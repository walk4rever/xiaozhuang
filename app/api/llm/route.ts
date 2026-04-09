import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import type { ModelMessage, ImagePart, TextPart } from 'ai'

export const runtime = 'nodejs'
export const maxDuration = 300

type RawPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type RawMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | RawPart[]
}

const stripChatCompletionsPath = (url: string) => {
  const trimmed = url.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions')
    ? trimmed.slice(0, -'/chat/completions'.length)
    : trimmed
}

const hasVisionInput = (messages: RawMessage[]): boolean =>
  messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')
  )

const dataUrlToUint8Array = (dataUrl: string): { data: Uint8Array; mimeType: string } => {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(0, comma)
  const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { data: bytes, mimeType }
}

const toModelMessages = (messages: RawMessage[]): ModelMessage[] =>
  messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content } as ModelMessage
    }
    const parts: (TextPart | ImagePart)[] = msg.content.map((part) => {
      if (part.type === 'image_url') {
        const url = part.image_url.url
        if (url.startsWith('data:')) {
          const { data, mimeType } = dataUrlToUint8Array(url)
          return { type: 'image' as const, image: data, mimeType }
        }
        return { type: 'image' as const, image: new URL(url) }
      }
      return { type: 'text' as const, text: part.text }
    })
    return { role: msg.role, content: parts } as ModelMessage
  })

export async function POST(request: Request) {
  const apiKey = process.env.AI_API_KEY
  const rawBaseUrl = process.env.AI_API_BASE_URL
  const primaryModel = process.env.AI_PRIMARY_MODEL?.trim()
  const visionModel = process.env.AI_VISION_MODEL?.trim() || primaryModel

  if (!apiKey || !rawBaseUrl || !primaryModel) {
    return Response.json({ error: 'AI service is not configured' }, { status: 500 })
  }

  let body: { messages?: unknown; temperature?: number; max_tokens?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { messages, temperature, max_tokens } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages is required' }, { status: 400 })
  }

  const rawMessages = messages as RawMessage[]
  const modelId = hasVisionInput(rawMessages) ? visionModel! : primaryModel

  const openai = createOpenAI({
    baseURL: stripChatCompletionsPath(rawBaseUrl),
    apiKey,
  })

  const result = streamText({
    model: openai.chat(modelId),
    messages: toModelMessages(rawMessages),
    temperature: temperature ?? 0.7,
    maxOutputTokens: max_tokens,
    onError: ({ error }) => {
      console.error('[llm] streamText error:', JSON.stringify(error))
    },
    onFinish: ({ text, finishReason, usage }) => {
      console.log('[llm] finish:', finishReason, 'chars:', text.length, 'tokens:', usage)
    },
  })

  return result.toTextStreamResponse()
}
