const normalizeChatCompletionsUrl = (rawBaseUrl: string) => {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/chat/completions')
    ? trimmed
    : `${trimmed}/chat/completions`;
};

const jsonResponse = (body: Record<string, string>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const encoder = new TextEncoder();

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const apiKey = process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY;
  const rawBaseUrl =
    process.env.AI_API_BASE_URL ||
    process.env.DASHSCOPE_BASE_URL ||
    'https://ark.cn-beijing.volces.com/api/coding/v3';
  const baseUrl = normalizeChatCompletionsUrl(rawBaseUrl);

  if (!apiKey) {
    return jsonResponse({ error: 'AI_API_KEY is not configured' }, 500);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText, {
        status: response.status,
        headers: {
          'Content-Type':
            response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
        },
      });
    }

    if (!response.body) {
      return jsonResponse({ error: 'Upstream returned empty body' }, 502);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let streamCompleted = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;

              const rawPayload = trimmed.slice(5).trim();
              if (!rawPayload) continue;
              if (rawPayload === '[DONE]') {
                streamCompleted = true;
                controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
                await reader.cancel();
                break;
              }

              try {
                const parsed = JSON.parse(rawPayload) as {
                  choices?: Array<{ delta?: { content?: string } }>
                };
                const delta = parsed.choices?.[0]?.delta?.content;
                if (!delta) continue;
                controller.enqueue(
                  encoder.encode(`event: delta\ndata: ${JSON.stringify(delta)}\n\n`)
                );
              } catch {
                // Skip malformed upstream SSE chunks.
              }
            }

            if (streamCompleted) {
              break;
            }
          }

          if (!streamCompleted) {
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
          }
        } catch (error) {
          console.error('Stream processing error:', error);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: 'Stream interrupted',
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return jsonResponse(
      { error: 'Failed to fetch from upstream model provider' },
      500
    );
  }
}
