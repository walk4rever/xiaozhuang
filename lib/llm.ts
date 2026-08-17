const llmApiUrl = process.env.NEXT_PUBLIC_LLM_URL

if (!llmApiUrl) {
  throw new Error(
    'NEXT_PUBLIC_LLM_URL is not configured. There is no in-app /api/llm fallback anymore ' +
    '(removed 2026-08-17, all LLM calls now go through relay/llm-proxy.mjs) — set ' +
    'NEXT_PUBLIC_LLM_URL to the relay endpoint in .env.local / Vercel env vars.'
  )
}

export const LLM_API_URL = llmApiUrl
