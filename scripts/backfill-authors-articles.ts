/**
 * 从源文件全量生成 xz_du_authors 和 xz_du_articles 缺失数据（覆盖全部26卷，无需提前入库）。
 *
 * Usage:
 *   npx tsx scripts/backfill-authors-articles.ts           # 全量
 *   npx tsx scripts/backfill-authors-articles.ts --dry-run # 只打印，不写入
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { parseJingshiPassages } from './jingshi-parser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: resolve(__dirname, '../.env.local') })

import { AUTHOR_DESCRIPTION_PROMPT, ARTICLE_BACKGROUND_PROMPT } from '../data/du-prompt'

const supabaseUrl = process.env.SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const aiApiKey = process.env.AI_API_KEY!
const aiBaseUrl = process.env.AI_API_BASE_URL!
const aiModel = process.env.AI_PRIMARY_MODEL!

if (!supabaseUrl || !serviceRoleKey || !aiApiKey || !aiBaseUrl || !aiModel) {
  console.error('Missing required env vars')
  process.exit(1)
}

const isDryRun = process.argv.includes('--dry-run')
const DELAY_MS = 600

// ---------------------------------------------------------------------------
// Helpers
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
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`)
  if (!text.trim()) return null as T
  return JSON.parse(text) as T
}

function parseSegmentBase(title: string): string {
  const m = title.match(/^(.+?)（\d+）$/)
  return m ? m[1] : title
}

const callAI = async (systemPrompt: string, userContent: string): Promise<string> => {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          temperature: 0.4,
          max_tokens: 400,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`AI ${res.status}: ${text}`)
      const data = JSON.parse(text) as { choices: Array<{ message: { content: string } }> }
      return (data.choices[0]?.message?.content ?? '').trim()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000))
    }
  }
  throw lastError
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const sourceFile = resolve(__dirname, '../data/经史百家杂钞.txt')
const passages = parseJingshiPassages(sourceFile)

// Collect unique source_origins and (source_origin, base_title) pairs
const uniqueAuthors = new Set<string>()
const uniqueArticles = new Set<string>() // key: "source_origin\x00base_title"
const articlePairs: Array<{ sourceOrigin: string; baseTitle: string }> = []

for (const p of passages) {
  if (!p.source_origin) continue
  uniqueAuthors.add(p.source_origin)
  const baseTitle = p.title ? parseSegmentBase(p.title) : null
  if (baseTitle) {
    const key = `${p.source_origin}\x00${baseTitle}`
    if (!uniqueArticles.has(key)) {
      uniqueArticles.add(key)
      articlePairs.push({ sourceOrigin: p.source_origin, baseTitle })
    }
  }
}

// Fetch existing records — skip only those with non-empty content
const existingAuthors = await supaFetch<Array<{ source_origin: string; description: string }>>(
  'xz_du_authors?select=source_origin,description&limit=9999'
)
const existingArticles = await supaFetch<Array<{ source_origin: string; base_title: string; background: string }>>(
  'xz_du_articles?select=source_origin,base_title,background&limit=9999'
)

const existingAuthorSet = new Set(existingAuthors.filter((a) => (a.description?.trim().length ?? 0) >= 40).map((a) => a.source_origin))
const existingArticleSet = new Set(existingArticles.filter((a) => (a.background?.trim().length ?? 0) >= 40).map((a) => `${a.source_origin}\x00${a.base_title}`))

const pendingAuthors = [...uniqueAuthors].filter((o) => !existingAuthorSet.has(o))
const pendingArticles = articlePairs.filter((a) => !existingArticleSet.has(`${a.sourceOrigin}\x00${a.baseTitle}`))

console.log(`Authors:  ${existingAuthorSet.size} existing, ${pendingAuthors.length} to generate`)
console.log(`Articles: ${existingArticleSet.size} existing, ${pendingArticles.length} to generate`)
if (isDryRun) { console.log('Dry run — exiting.'); process.exit(0) }

let ok = 0, fail = 0

const existingAuthorNames = new Set(existingAuthors.map((a) => a.source_origin))

for (const sourceOrigin of pendingAuthors) {
  try {
    const description = await callAI(AUTHOR_DESCRIPTION_PROMPT, sourceOrigin)
    if (!description) throw new Error('AI returned empty description')
    if (!/[。！？]$/.test(description.trim())) throw new Error(`description appears truncated: "${description.slice(-20)}"`)

    const isExisting = existingAuthorNames.has(sourceOrigin)
    if (isExisting) {
      await supaFetch(`xz_du_authors?source_origin=eq.${encodeURIComponent(sourceOrigin)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ description, updated_at: new Date().toISOString() }),
      })
    } else {
      await supaFetch('xz_du_authors', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ source_origin: sourceOrigin, description, updated_at: new Date().toISOString() }),
      })
    }
    ok++
    console.log(`✓ author [${sourceOrigin}]  (${ok + fail}/${pendingAuthors.length + pendingArticles.length})`)
  } catch (err) {
    fail++
    console.error(`✗ author [${sourceOrigin}]: ${err instanceof Error ? err.message : err}`)
  }
  await new Promise((r) => setTimeout(r, DELAY_MS))
}

const existingArticleNames = new Set(existingArticles.map((a) => `${a.source_origin}\x00${a.base_title}`))

for (const { sourceOrigin, baseTitle } of pendingArticles) {
  try {
    const background = await callAI(ARTICLE_BACKGROUND_PROMPT, `作者：${sourceOrigin}\n文章：${baseTitle}`)
    if (!background) throw new Error('AI returned empty background')
    if (!/[。！？]$/.test(background.trim())) throw new Error(`background appears truncated: "${background.slice(-20)}"`)

    const isExisting = existingArticleNames.has(`${sourceOrigin}\x00${baseTitle}`)
    if (isExisting) {
      await supaFetch(
        `xz_du_articles?source_origin=eq.${encodeURIComponent(sourceOrigin)}&base_title=eq.${encodeURIComponent(baseTitle)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ background, updated_at: new Date().toISOString() }),
        }
      )
    } else {
      await supaFetch('xz_du_articles', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ source_origin: sourceOrigin, base_title: baseTitle, background, updated_at: new Date().toISOString() }),
      })
    }
    ok++
    console.log(`✓ article [${sourceOrigin} · ${baseTitle}]  (${ok + fail}/${pendingAuthors.length + pendingArticles.length})`)
  } catch (err) {
    fail++
    console.error(`✗ article [${sourceOrigin} · ${baseTitle}]: ${err instanceof Error ? err.message : err}`)
  }
  await new Promise((r) => setTimeout(r, DELAY_MS))
}

console.log(`\nDone. ✓ ${ok}  ✗ ${fail}`)
