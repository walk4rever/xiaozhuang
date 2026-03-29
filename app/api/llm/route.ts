export const runtime = 'edge'
export const maxDuration = 30

const normalizeChatCompletionsUrl = (rawBaseUrl: string) => {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions')
    ? trimmed
    : `${trimmed}/chat/completions`
}

const jsonResponse = (body: Record<string, string>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

const encoder = new TextEncoder()
const UPSTREAM_TIMEOUT_MS = 25000
const UPSTREAM_RETRY_DELAY_MS = 600
const isJsonResponse = (contentType: string | null) =>
  (contentType ?? '').toLowerCase().includes('application/json')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const extractErrorMessage = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    error?: unknown
    message?: unknown
  }

  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error.trim()
  }
  if (candidate.error && typeof candidate.error === 'object') {
    const nestedMessage = extractErrorMessage(candidate.error)
    if (nestedMessage) return nestedMessage
  }
  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim()
  }
  return null
}

const classifyProxyError = (error: unknown) => {
  const candidate = error as {
    name?: string
    message?: string
    cause?: unknown
    overloaded?: unknown
    code?: unknown
  }
  const causeMessage =
    candidate.cause instanceof Error ? candidate.cause.message : String(candidate.cause ?? '')
  const rawMessage = `${candidate.message ?? ''} ${causeMessage}`.toLowerCase()
  const overloaded =
    candidate.overloaded === true ||
    rawMessage.includes('overloaded') ||
    rawMessage.includes('rate limit') ||
    rawMessage.includes('too many requests')
  const timeout =
    candidate.name === 'TimeoutError' ||
    candidate.name === 'AbortError' ||
    rawMessage.includes('timed out') ||
    rawMessage.includes('timeout') ||
    rawMessage.includes('aborted')

  if (overloaded) {
    return {
      status: 503,
      code: 'upstream_overloaded',
      message: '模型服务当前繁忙，请稍后再试。',
      retryable: true,
    }
  }

  if (timeout) {
    return {
      status: 504,
      code: 'upstream_timeout',
      message: '模型服务响应超时，请稍后再试。',
      // Edge runtime has a 30s maxDuration on Hobby. Retrying after a 25s
      // upstream timeout almost guarantees the whole function times out again
      // before we can return a graceful error to the client.
      retryable: false,
    }
  }

  return {
    status: 502,
    code: 'upstream_fetch_failed',
    message: '连接模型服务失败，请稍后再试。',
    retryable: false,
  }
}

const extractContent = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null
  const parsed = payload as {
    choices?: Array<{
      delta?: { content?: string }
      message?: { content?: string }
    }>
  }
  return (
    parsed.choices?.[0]?.delta?.content ??
    parsed.choices?.[0]?.message?.content ??
    null
  )
}

export async function POST(request: Request) {
  const apiKey = process.env.AI_API_KEY
  const rawBaseUrl = process.env.AI_API_BASE_URL
  const defaultModel = process.env.AI_MODEL

  if (!apiKey) {
    return jsonResponse({ error: 'AI_API_KEY is not configured' }, 500)
  }
  if (!rawBaseUrl) {
    return jsonResponse({ error: 'AI_API_BASE_URL is not configured' }, 500)
  }
  if (!defaultModel) {
    return jsonResponse({ error: 'AI_MODEL is not configured' }, 500)
  }
  const baseUrl = normalizeChatCompletionsUrl(rawBaseUrl)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse({ error: 'Invalid request payload' }, 400)
  }

  const requestedModel = (payload as { model?: unknown }).model
  const resolvedModel =
    typeof requestedModel === 'string' && requestedModel.trim()
      ? requestedModel.trim()
      : defaultModel

  const upstreamPayload = {
    ...payload,
    model: resolvedModel,
  }

  const shouldStream =
    'stream' in upstreamPayload &&
    (upstreamPayload as { stream?: unknown }).stream !== false

  try {
    let response: Response | null = null

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(upstreamPayload),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
        break
      } catch (error) {
        const classified = classifyProxyError(error)
        console.error('Proxy fetch failed', {
          attempt,
          status: classified.status,
          code: classified.code,
          retryable: classified.retryable,
          model: resolvedModel,
          stream: shouldStream,
          baseUrl,
          error,
        })

        if (!classified.retryable || attempt === 2) {
          return jsonResponse(
            {
              error: classified.message,
              code: classified.code,
            },
            classified.status
          )
        }

        await sleep(UPSTREAM_RETRY_DELAY_MS)
      }
    }

    if (!response) {
      return jsonResponse(
        {
          error: '连接模型服务失败，请稍后再试。',
          code: 'upstream_fetch_failed',
        },
        502
      )
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type')
      const errorText = await response.text()
      let errorMessage = errorText.trim()
      let errorCode = 'upstream_http_error'

      if (isJsonResponse(contentType)) {
        try {
          const parsed = JSON.parse(errorText) as unknown
          errorMessage = extractErrorMessage(parsed) ?? errorMessage
          const extractedCode =
            parsed && typeof parsed === 'object' && 'code' in parsed &&
            typeof (parsed as { code?: unknown }).code === 'string'
              ? (parsed as { code: string }).code
              : null
          if (extractedCode) errorCode = extractedCode
        } catch {
          // Fall back to raw text.
        }
      }

      if (!errorMessage) {
        if (response.status === 429 || response.status === 503) {
          errorMessage = '模型服务当前繁忙，请稍后再试。'
          errorCode = 'upstream_overloaded'
        } else if (response.status === 504) {
          errorMessage = '模型服务响应超时，请稍后再试。'
          errorCode = 'upstream_timeout'
        } else {
          errorMessage = '模型服务暂时不可用，请稍后再试。'
        }
      }

      return jsonResponse(
        {
          error: errorMessage,
          code: errorCode,
        },
        response.status
      )
    }

    if (!shouldStream || isJsonResponse(response.headers.get('content-type'))) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type':
            response.headers.get('content-type') ?? 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        },
      })
    }

    if (!response.body) {
      return jsonResponse({ error: 'Upstream returned empty body' }, 502)
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let sseBuffer = ''
        let streamCompleted = false

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            sseBuffer += decoder.decode(value, { stream: true })
            const lines = sseBuffer.split('\n')
            sseBuffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) continue

              const rawPayload = trimmed.slice(5).trim()
              if (!rawPayload) continue
              if (rawPayload === '[DONE]') {
                streamCompleted = true
                controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
                await reader.cancel()
                break
              }

              try {
                const parsed = JSON.parse(rawPayload)
                const delta = extractContent(parsed)
                if (!delta) continue
                controller.enqueue(
                  encoder.encode(`event: delta\ndata: ${JSON.stringify(delta)}\n\n`)
                )
              } catch {
                // Skip malformed upstream SSE chunks.
              }
            }

            if (streamCompleted) break
          }

          const trailingPayload = sseBuffer.trim()
          if (trailingPayload.startsWith('data:')) {
            const rawPayload = trailingPayload.slice(5).trim()
            if (rawPayload === '[DONE]') {
              streamCompleted = true
            } else if (rawPayload) {
              try {
                const parsed = JSON.parse(rawPayload)
                const delta = extractContent(parsed)
                if (delta) {
                  controller.enqueue(
                    encoder.encode(`event: delta\ndata: ${JSON.stringify(delta)}\n\n`)
                  )
                }
              } catch {
                // Ignore incomplete trailing chunk payloads.
              }
            }
          }

          if (!streamCompleted) {
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
          }
        } catch (error) {
          console.error('Stream processing error:', error)
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`
            )
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('Proxy error:', {
      model: resolvedModel,
      stream: shouldStream,
      baseUrl,
      error,
    })
    return jsonResponse(
      {
        error: '模型服务暂时不可用，请稍后再试。',
        code: 'proxy_internal_error',
      },
      500
    )
  }
}
