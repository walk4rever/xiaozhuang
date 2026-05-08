/**
 * 批量为所有 payload IS NULL 的 passages 生成 AI 解读并存回 Supabase。
 *
 * 需要本地运行（无执行时间限制）。
 * Usage:
 *   npx tsx scripts/generate-payloads.ts           # 全部未生成的
 *   npx tsx scripts/generate-payloads.ts --limit=10 # 只生成前10条（测试用）
 *   npx tsx scripts/generate-payloads.ts --id=42    # 只重新生成指定 id（单条模式）
 *   npx tsx scripts/generate-payloads.ts --volume=2 # 只生成卷二
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { jsonrepair } from 'jsonrepair'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: resolve(__dirname, '../.env.local') })

import { DU_SYSTEM_PROMPT, type DuOutput } from '../data/du-prompt'

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

const BATCH_SIZE = 5
const DELAY_MS = 300
const DEFAULT_CONCURRENCY = 3

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Passage {
  id: number
  source_origin: string | null
  title: string | null
  content: string
  volume?: number | null
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
const BATCH_SYSTEM_PROMPT = `${DU_SYSTEM_PROMPT}

本次输入包含多条段落，每条用 === [序号] === 分隔。
请严格输出 JSON 数组，数组长度必须与输入段落数完全一致，顺序一一对应，每个元素结构与上述相同。
不要输出 Markdown，不要代码块，直接输出数组。`

const buildBatchUserPrompt = (passages: Passage[]): string =>
  passages.map((p, i) =>
    `=== [${i}] ${p.source_origin ?? ''} · ${p.title ?? ''} ===\n${p.content.trim()}`
  ).join('\n\n')

const buildSingleUserPrompt = (p: Passage): string =>
  [
    `【来源】${p.source_origin ?? '经史百家杂钞节选'}`,
    `【标题】${p.title ?? '未标注'}`,
    '【原文段落】',
    p.content.trim(),
    '请按系统规则输出。',
  ].join('\n')

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

const fetchPassages = async (limit: number, id?: number, volumes?: number[]): Promise<Passage[]> => {
  if (id !== undefined) {
    return supaFetch<Passage[]>(
      `xz_du_passages?select=id,source_origin,title,content,volume&id=eq.${id}`
    )
  }
  const volumeFilter = volumes?.length
    ? volumes.length === 1
      ? `&volume=eq.${volumes[0]}`
      : `&volume=in.(${volumes.join(',')})`
    : ''
  return supaFetch<Passage[]>(
    `xz_du_passages?select=id,source_origin,title,content,volume&payload=is.null&enabled=eq.true${volumeFilter}&order=id.asc&limit=${limit}`
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
// JSON helpers
// ---------------------------------------------------------------------------
const repairJson = (text: string): string | null => {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    let raw: string | null = null
    if (fenced?.[1]) {
      raw = fenced[1].trim()
    } else {
      // use whichever outermost container appears first
      const ai = text.indexOf('['), oi = text.indexOf('{')
      if (ai !== -1 && (oi === -1 || ai < oi)) {
        const ae = text.lastIndexOf(']')
        if (ae > ai) raw = text.slice(ai, ae + 1)
      } else if (oi !== -1) {
        const oe = text.lastIndexOf('}')
        if (oe > oi) raw = text.slice(oi, oe + 1)
      }
    }
    if (!raw) return null
    return jsonrepair(raw)
  } catch {
    return null
  }
}

const validatePayload = (obj: unknown): DuOutput => {
  const p = obj as DuOutput
  if (!p.summary || !p.translation || !p.structure || !p.insight) {
    throw new Error('Missing required fields')
  }
  if (!Array.isArray(p.keywords) || !p.keywords.length) {
    throw new Error('keywords required')
  }
  return p
}

// ---------------------------------------------------------------------------
// AI calls
// ---------------------------------------------------------------------------
const callAIRaw = async (systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> => {
  const res = await fetch(`${aiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.45,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI API ${res.status}: ${text}`)
  }
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return data.choices[0]?.message?.content ?? ''
}

// 批量调用：返回 DuOutput 数组，长度与 passages 一致（失败项为 null）
const callAIBatch = async (passages: Passage[]): Promise<Array<DuOutput | null>> => {
  const userPrompt = buildBatchUserPrompt(passages)
  const maxTokens = passages.length * 1000 + 500
  const raw = await callAIRaw(BATCH_SYSTEM_PROMPT, userPrompt, maxTokens)
  const candidate = repairJson(raw)
  if (!candidate) throw new Error('Invalid JSON from AI')

  const parsed = JSON.parse(candidate)
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array')
  // pad with nulls if fewer items than expected
  const out: Array<DuOutput | null> = parsed.map((item: unknown) => {
    try { return validatePayload(item) } catch { return null }
  })
  while (out.length < passages.length) out.push(null)
  return out
}

// 单条降级调用
const callAISingle = async (passage: Passage): Promise<DuOutput> => {
  const raw = await callAIRaw(DU_SYSTEM_PROMPT, buildSingleUserPrompt(passage), 3000)
  const candidate = repairJson(raw)
  if (!candidate) throw new Error('Invalid JSON from AI')
  const parsed = JSON.parse(candidate)
  return validatePayload(parsed)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const limitArg = argv.find((a) => a.startsWith('--limit='))
const idArg = argv.find((a) => a.startsWith('--id='))
const volumeArg = argv.find((a) => a.startsWith('--volume='))
const concurrencyArg = argv.find((a) => a.startsWith('--concurrency='))
const limit = limitArg ? parseInt(limitArg.replace('--limit=', ''), 10) : 9999
const targetId = idArg ? parseInt(idArg.replace('--id=', ''), 10) : undefined
const targetVolumes = volumeArg
  ? volumeArg.replace('--volume=', '').split(',').map(Number)
  : undefined
const concurrency = concurrencyArg ? parseInt(concurrencyArg.replace('--concurrency=', ''), 10) : DEFAULT_CONCURRENCY

const passages = await fetchPassages(limit, targetId, targetVolumes)
const volumeLabel = targetVolumes ? `卷 ${targetVolumes.join(', ')}` : '全部'
console.log(`Found ${passages.length} passages to process [${volumeLabel}] (batch_size=${targetId ? 1 : BATCH_SIZE}, concurrency=${targetId ? 1 : concurrency})`)

let success = 0
let failed = 0
let singleCount = 0
let singleMs = 0
let batchCount = 0
let batchMs = 0
const total = passages.length
const runStart = Date.now()

// --id 模式走单条
if (targetId !== undefined) {
  const p = passages[0]
  if (!p) { console.log('Not found'); process.exit(1) }
  try {
    const payload = await callAISingle(p)
    await savePayload(p.id, payload)
    console.log(`✓ [${p.id}] ${p.source_origin} · ${p.title}`)
  } catch (err) {
    console.error(`✗ [${p.id}]: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
  process.exit(0)
}

// 批量模式
const allBatches: Passage[][] = []
for (let i = 0; i < passages.length; i += BATCH_SIZE) {
  allBatches.push(passages.slice(i, i + BATCH_SIZE))
}
const totalBatches = allBatches.length

const processBatch = async (batch: Passage[], batchNum: number): Promise<void> => {
  const batchLabel = `[batch ${batchNum}/${totalBatches}] ${batch[0].source_origin} · ${batch[0].title} … (${batch.length}条)`

  let results: Array<DuOutput | null> | null = null
  const batchStart = Date.now()
  try {
    results = await callAIBatch(batch)
    const batchOk = results.filter(Boolean).length
    const batchElapsed = Date.now() - batchStart
    batchCount += batchOk
    batchMs += batchElapsed
    console.log(`  ${batchLabel} → 批量成功 ${batchOk}/${batch.length}  (${batchElapsed}ms, ${Math.round(batchElapsed / batch.length)}ms/条)`)
  } catch (err) {
    console.error(`  ${batchLabel} → 批量失败 (${err instanceof Error ? err.message : err})，全部降级`)
  }

  for (let j = 0; j < batch.length; j++) {
    const p = batch[j]
    const label = `[${p.id}] ${p.source_origin} · ${p.title}`
    const batchResult = results?.[j] ?? null

    if (batchResult) {
      try {
        await savePayload(p.id, batchResult)
        success++
        console.log(`  ✓ ${label}  (${success + failed}/${total})`)
      } catch (err) {
        failed++
        console.error(`  ✗ ${label}: save failed: ${err instanceof Error ? err.message : err}`)
      }
    } else {
      const singleStart = Date.now()
      try {
        const payload = await callAISingle(p)
        await savePayload(p.id, payload)
        const singleElapsed = Date.now() - singleStart
        singleCount++
        singleMs += singleElapsed
        success++
        console.log(`  ✓ ${label}  (${success + failed}/${total}) [single ${singleElapsed}ms]`)
      } catch (err) {
        failed++
        console.error(`  ✗ ${label}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }
}

for (let i = 0; i < allBatches.length; i += concurrency) {
  const chunk = allBatches.slice(i, i + concurrency)
  await Promise.all(chunk.map((batch, j) => processBatch(batch, i + j + 1)))
  if (i + concurrency < allBatches.length) {
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }
}

const totalMs = Date.now() - runStart
const avgBatch = batchCount > 0 ? Math.round(batchMs / batchCount) : 0
const avgSingle = singleCount > 0 ? Math.round(singleMs / singleCount) : 0
console.log(`\nDone. ✓ ${success}  ✗ ${failed}  total ${Math.round(totalMs / 1000)}s`)
if (batchCount > 0) console.log(`  batch:  ${batchCount}条  avg ${avgBatch}ms/条`)
if (singleCount > 0) console.log(`  single: ${singleCount}条  avg ${avgSingle}ms/条`)
