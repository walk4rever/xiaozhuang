/**
 * 批量为所有 payload IS NULL 的 passages 生成 AI 解读并存回 Supabase。
 *
 * 需要本地运行（无执行时间限制）。
 * Usage:
 *   npx tsx scripts/generate-payloads.ts           # 全部未生成的
 *   npx tsx scripts/generate-payloads.ts --limit=10 # 只生成前10条（测试用）
 *   npx tsx scripts/generate-payloads.ts --id=42    # 只重新生成指定 id
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 加载 .env.local
config({ path: resolve(__dirname, '../.env.local') })

import { buildDuUserPrompt, DU_SYSTEM_PROMPT, type DuOutput } from '../data/du-prompt'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const aiApiKey = process.env.AI_API_KEY!
const aiBaseUrl = process.env.AI_API_BASE_URL!
const aiModel = process.env.AI_PRIMARY_MODEL!

if (!supabaseUrl || !serviceRoleKey || !aiApiKey || !aiBaseUrl || !aiModel) {
  console.error('Missing required env vars')
  process.exit(1)
}

const CONCURRENCY = 1     // 同时跑几个 AI 请求
const DELAY_MS = 500      // 每批之间的间隔

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Passage {
  id: number
  source_origin: string | null
  title: string | null
  content: string
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------
const supaFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase ${res.status}: ${text}`)
  }
  if (res.status === 204) return null as T
  return res.json()
}

const fetchPassages = async (limit: number, id?: number): Promise<Passage[]> => {
  if (id !== undefined) {
    return supaFetch<Passage[]>(
      `xz_du_passages?select=id,source_origin,title,content&id=eq.${id}`
    )
  }
  return supaFetch<Passage[]>(
    `xz_du_passages?select=id,source_origin,title,content&payload=is.null&enabled=eq.true&order=id.asc&limit=${limit}`
  )
}

const savePayload = async (id: number, payload: DuOutput): Promise<void> => {
  await supaFetch(`xz_du_passages?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ payload, payload_generated_at: new Date().toISOString() }),
  })
}

// ---------------------------------------------------------------------------
// AI call (direct, no streaming)
// ---------------------------------------------------------------------------
const extractJson = (text: string): string | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s === -1 || e <= s) return null
  return text.slice(s, e + 1)
}

const callAI = async (passage: Passage): Promise<DuOutput> => {
  const userPrompt = buildDuUserPrompt({
    sourceOrigin: passage.source_origin ?? undefined,
    title: passage.title ?? undefined,
    content: passage.content,
  })

  const res = await fetch(`${aiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${aiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        { role: 'system', content: DU_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.45,
      max_tokens: 1500,
      stream: false,
    }),
    signal: AbortSignal.timeout(90000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI API ${res.status}: ${text}`)
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const raw = data.choices[0]?.message?.content ?? ''
  const candidate = extractJson(raw)
  if (!candidate) throw new Error('Invalid JSON from AI')

  const parsed = JSON.parse(candidate) as DuOutput
  if (!parsed.summary || !parsed.translation || !parsed.structure || !parsed.insight) {
    throw new Error('Missing required fields')
  }
  if (!Array.isArray(parsed.keywords) || !parsed.keywords.length) {
    throw new Error('keywords required')
  }
  return parsed
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const limitArg = argv.find((a) => a.startsWith('--limit='))
const idArg = argv.find((a) => a.startsWith('--id='))
const limit = limitArg ? parseInt(limitArg.replace('--limit=', ''), 10) : 9999
const targetId = idArg ? parseInt(idArg.replace('--id=', ''), 10) : undefined

const passages = await fetchPassages(limit, targetId)
console.log(`Found ${passages.length} passages to process`)

let success = 0
let failed = 0

// 分批并发执行
for (let i = 0; i < passages.length; i += CONCURRENCY) {
  const batch = passages.slice(i, i + CONCURRENCY)

  await Promise.all(
    batch.map(async (p) => {
      const label = `[${p.id}] ${p.source_origin} · ${p.title}`
      try {
        const payload = await callAI(p)
        await savePayload(p.id, payload)
        success++
        console.log(`✓ ${label}  (${success + failed}/${passages.length})`)
      } catch (err) {
        failed++
        console.error(`✗ ${label}: ${err instanceof Error ? err.message : err}`)
      }
    })
  )

  if (i + CONCURRENCY < passages.length) {
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }
}

console.log(`\nDone. ✓ ${success}  ✗ ${failed}`)
