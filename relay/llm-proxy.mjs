/**
 * Lightweight LLM streaming proxy for relay.air7.fun
 *
 * Receives the same request format as /api/llm, forwards to upstream
 * (火山方舟) with streaming, and pipes plain text back to the client.
 *
 * No dependencies — uses Node.js built-in http + native fetch.
 *
 * Usage:
 *   cp .env.example .env   # fill in values
 *   node llm-proxy.mjs
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Load .env ──────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envText = readFileSync(resolve(__dirname, '.env'), 'utf-8')
  for (const line of envText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
} catch {
  // .env is optional if vars are set externally
}

// ── Config ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3002')
const API_KEY = process.env.AI_API_KEY
const API_BASE_URL = process.env.AI_API_BASE_URL?.replace(/\/+$/, '') || ''
const PRIMARY_MODEL = process.env.AI_PRIMARY_MODEL || ''
const VISION_MODEL = process.env.AI_VISION_MODEL || PRIMARY_MODEL
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://xz.air7.fun')
  .split(',')
  .map((s) => s.trim())

if (!API_KEY || !API_BASE_URL || !PRIMARY_MODEL) {
  console.error('[llm-proxy] Missing required env: AI_API_KEY, AI_API_BASE_URL, AI_PRIMARY_MODEL')
  process.exit(1)
}

const UPSTREAM_URL = API_BASE_URL.endsWith('/chat/completions')
  ? API_BASE_URL
  : `${API_BASE_URL}/chat/completions`

// ── Helpers ────────────────────────────────────────────────────
const corsHeaders = (origin) => {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

const hasVisionInput = (messages) =>
  messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')
  )

async function* parseSSE(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) yield content
      } catch {
        // skip malformed chunks
      }
    }
  }
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })

// ── Server ─────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const origin = req.headers.origin || ''
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', ...cors })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const raw = await readBody(req)

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json', ...cors })
    res.end(JSON.stringify({ error: 'Invalid JSON' }))
    return
  }

  const { messages, temperature = 0.7, max_tokens } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...cors })
    res.end(JSON.stringify({ error: 'messages is required' }))
    return
  }

  const model = hasVisionInput(messages) ? VISION_MODEL : PRIMARY_MODEL
  const upstreamBody = { model, messages, temperature, stream: true, thinking: { type: 'disabled' } }
  if (max_tokens) upstreamBody.max_tokens = max_tokens

  console.log(`[llm-proxy] ${new Date().toISOString()} model=${model} msgs=${messages.length}`)

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(upstreamBody),
    })

    if (!upstream.ok) {
      const errText = await upstream.text()
      console.error('[llm-proxy] upstream error:', upstream.status, errText)
      res.writeHead(upstream.status, { 'Content-Type': 'application/json', ...cors })
      res.end(JSON.stringify({ error: `Upstream ${upstream.status}` }))
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      ...cors,
    })

    for await (const text of parseSSE(upstream.body)) {
      res.write(text)
    }

    res.end()
  } catch (err) {
    console.error('[llm-proxy] error:', err.message)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json', ...cors })
      res.end(JSON.stringify({ error: 'Proxy error' }))
    } else {
      res.end()
    }
  }
})

server.listen(PORT, () => {
  console.log(`[llm-proxy] listening on :${PORT}`)
  console.log(`[llm-proxy] upstream: ${UPSTREAM_URL}`)
  console.log(`[llm-proxy] models: ${PRIMARY_MODEL} / vision: ${VISION_MODEL}`)
  console.log(`[llm-proxy] allowed: ${ALLOWED_ORIGINS.join(', ')}`)
})
