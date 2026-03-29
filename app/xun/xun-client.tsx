'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'

type ParsedResult = {
  quote: string
  source: string
  interpretation: string
  resonance: string
}

const SYSTEM_PROMPT = `你是"小庄"，一位深谙中国古典诗词与古文的文化伙伴。用户会描述一个场景、一种情绪、或一个画面，你需要从中国古典诗词、古文名篇中找到最贴切、最美的一句（或几句），并解释为什么这句话与用户的此刻最为契合。

输出要求：请只输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。JSON 结构必须严格如下：
{
  "quote": "原文引用（诗句或古文原文）",
  "source": "出处（作者、篇名、朝代）",
  "interpretation": "白话解读：这句话是什么意思，写作背景是什么，妙在哪里（3-5句）",
  "resonance": "共鸣连接：为什么这句话与用户描述的场景/情绪最为契合，它如何照见此刻的心境（2-3句）"
}

选句原则：
1. 优先选意境贴合、情感共鸣强的句子，而非最有名的句子
2. 诗词、古文、辞赋均可，不限于唐诗宋词
3. 白话解读要深入浅出，让不懂古文的人也能感受到美
4. 共鸣连接要具体，不要泛泛而谈`

const extractJsonBlock = (text: string) => {
  const trimmed = text.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return trimmed.slice(start, end + 1)
}

const parseResult = (text: string): ParsedResult | null => {
  const json = extractJsonBlock(text)
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as ParsedResult
    if (parsed.quote && parsed.source) return parsed
    return null
  } catch {
    return null
  }
}

type SseEvent =
  | { type: 'delta'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

const parseSseLine = (line: string): string | null => {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
    }
    return parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

const parseStreamEvent = (eventName: string, data: string): SseEvent | null => {
  if (!data) return null
  if (eventName === 'delta') {
    try {
      const content = JSON.parse(data) as string
      return typeof content === 'string' ? { type: 'delta', content } : null
    } catch {
      return null
    }
  }
  if (eventName === 'done') return { type: 'done' }
  if (eventName === 'error') {
    try {
      const payload = JSON.parse(data) as { error?: string }
      return { type: 'error', message: payload.error ?? 'stream_error' }
    } catch {
      return { type: 'error', message: 'stream_error' }
    }
  }
  return null
}

const readErrorMessage = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as { error?: string; message?: string }
      return payload.error ?? payload.message ?? `${response.status} 请求失败`
    } catch {
      return `${response.status} 请求失败`
    }
  }

  const text = await response.text()
  return text.trim() || `${response.status} 请求失败`
}

async function requestXun(
  input: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      temperature: 0.8,
      max_tokens: 768,
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorMessage = await readErrorMessage(response)
    throw new Error(errorMessage)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content ?? ''
    onChunk?.(content)
    return content
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('stream_unavailable')

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let content = ''
  let currentEvent = ''

  while (true) {
    const { value, done } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) {
          currentEvent = ''
          continue
        }
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim()
          continue
        }
        if (line.startsWith('data:')) {
          if (!currentEvent) {
            const delta = parseSseLine(line)
            if (delta) {
              content += delta
              onChunk?.(content)
            }
            continue
          }
          const evt = parseStreamEvent(currentEvent, line.slice(5).trim())
          if (!evt) continue
          if (evt.type === 'delta') {
            content += evt.content
            onChunk?.(content)
          } else if (evt.type === 'error') {
            throw new Error(evt.message)
          } else if (evt.type === 'done') {
            return content
          }
        }
      }
    }
    if (done) break
  }

  return content
}

export default function XunClient() {
  const [input, setInput] = useState('')
  const [rawOutput, setRawOutput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const parsed = rawOutput ? parseResult(rawOutput) : null
  const isStreaming = isLoading && rawOutput.length > 0

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return
    requestIdRef.current += 1
    const reqId = requestIdRef.current

    setIsLoading(true)
    setRawOutput('')
    setError(null)

    try {
      await requestXun(input.trim(), (partial) => {
        if (reqId === requestIdRef.current) setRawOutput(partial)
      })
    } catch (err) {
      if (reqId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : '寻句失败，请稍后再试')
      }
    } finally {
      if (reqId === requestIdRef.current) setIsLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="seal">句</div>
        <div className="hero-text">
          <Link href="/" className="back-link">← 小庄</Link>
          <p className="subtitle">观景 · 体情 · 寻意</p>
          <h1>寻句</h1>
          <p className="description">
            描述你看到的、感受到的，小庄从千年诗文中，帮你找到最贴切的那句话。
          </p>
        </div>
      </header>

      <section className="panel xun-input-panel">
        <textarea
          className="xun-textarea"
          placeholder="比如：秋天傍晚，满地银杏叶，金色的光洒在路上……"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <button
          className="xun-button"
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '寻句中…' : '帮我找那句话'}
        </button>
      </section>

      {error && (
        <section className="panel xun-result">
          <p style={{ color: '#ff8080' }}>{error}</p>
        </section>
      )}

      {isStreaming && !parsed && (
        <section className="panel xun-result">
          <p className="xun-streaming">寻句中，古人正在翻书……</p>
        </section>
      )}

      {parsed && (
        <section className="panel xun-result">
          <div className="xun-quote-block">
            <p className="quote-text">{parsed.quote}</p>
            <p className="quote-source">—— {parsed.source}</p>
          </div>
          <div className="section">
            <h4>📖 白话解读</h4>
            <p>{parsed.interpretation}</p>
          </div>
          <div className="section">
            <h4>💫 为何是这句</h4>
            <p>{parsed.resonance}</p>
          </div>
        </section>
      )}
    </div>
  )
}
