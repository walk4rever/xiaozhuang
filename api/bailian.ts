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

    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
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
