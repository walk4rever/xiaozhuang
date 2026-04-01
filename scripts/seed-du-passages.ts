/**
 * Load xz_du_passages into Supabase via REST API (batch inserts).
 *
 * Requires env vars (copy from .env.local or pass inline):
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Usage:
 *   npx tsx scripts/seed-du-passages.ts            # 全部入库
 *   npx tsx scripts/seed-du-passages.ts --volume=1  # 只入卷一
 *   npx tsx scripts/seed-du-passages.ts --volume=1,2 # 只入卷一和卷二
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---------------------------------------------------------------------------
// Types (mirrors Passage in lib/du-server.ts)
// ---------------------------------------------------------------------------
interface PassageInsert {
  source_book: string
  source_origin: string
  title: string
  content: string
  difficulty: number
  theme: string
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  process.stderr.write('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set\n')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Parse txt → passage objects  (same logic as parse-du-passages.ts)
// ---------------------------------------------------------------------------
const THEME_MAP: Array<[RegExp, string]> = [
  [/论著/, '论著'],
  [/词赋/, '词赋'],
  [/序跋/, '序跋'],
  [/诏令/, '诏令'],
  [/奏议/, '奏议'],
  [/书牍/, '书牍'],
  [/哀祭/, '哀祭'],
  [/传志/, '传志'],
  [/叙[记事]/, '叙记'],
  [/典志/, '典志'],
  [/杂[记钞]/, '杂记'],
]

function extractTheme(header: string): string {
  for (const [pattern, theme] of THEME_MAP) {
    if (pattern.test(header)) return theme
  }
  return '杂记'
}

const PRE_QIN = new Set(['书', '诗', '易', '礼', '春秋', '左传', '孟子', '庄子', '荀子', '韩非子', '老子', '列子', '墨子', '屈原', '宋玉'])
const HAN = new Set(['贾谊', '班固', '司马迁', '班彪', '东方朔', '司马相如', '扬雄', '张衡', '王粲', '曹操', '陆机', '刘伶', '潘岳', '左思', '江统', '李康'])

function getDifficulty(origin: string): number {
  if (PRE_QIN.has(origin)) return 3
  if (HAN.has(origin)) return 2
  return 1
}

const MAX_CHUNK = 150
const MIN_CHUNK = 80

function splitLongParagraph(para: string): string[] {
  if (para.length <= MAX_CHUNK) return [para]
  const sentences = para.split(/(?<=[。！？])/)
  const result: string[] = []
  let current = ''
  for (const sent of sentences) {
    if (current.length + sent.length > MAX_CHUNK && current.length >= MIN_CHUNK) {
      result.push(current)
      current = sent
    } else {
      current += sent
    }
  }
  if (current.length > 0) {
    if (current.length < MIN_CHUNK && result.length > 0) result[result.length - 1] += current
    else result.push(current)
  }
  return result.length > 0 ? result : [para]
}

function chunkParagraphs(paragraphs: string[], baseTitle: string): Array<{ title: string; content: string }> {
  const expanded: string[] = []
  for (const para of paragraphs) expanded.push(...splitLongParagraph(para))

  const total = expanded.join('').length
  if (total <= MAX_CHUNK) return [{ title: baseTitle, content: expanded.join('\n') }]

  const chunks: string[][] = []
  let current: string[] = []
  let currentLen = 0
  for (const para of expanded) {
    if (currentLen + para.length > MAX_CHUNK && currentLen >= MIN_CHUNK) {
      chunks.push(current); current = [para]; currentLen = para.length
    } else { current.push(para); currentLen += para.length }
  }
  if (current.length > 0) {
    if (currentLen < MIN_CHUNK && chunks.length > 0) chunks[chunks.length - 1].push(...current)
    else chunks.push(current)
  }
  if (chunks.length === 1) return [{ title: baseTitle, content: chunks[0].join('\n') }]
  return chunks.map((lines, i) => ({ title: `${baseTitle}（${i + 1}）`, content: lines.join('\n') }))
}

// Extract volume number from a ● header line, e.g. "●卷一·论著之属一" → 1
const VOLUME_CHINESE: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16, 十七: 17,
  十八: 18, 十九: 19, 二十: 20, 二十一: 21, 二十二: 22, 二十三: 23,
  二十四: 24, 二十五: 25, 二十六: 26,
}

function extractVolume(header: string): number | null {
  const m = header.match(/●卷([一二三四五六七八九十]+)·/)
  if (!m) return null
  return VOLUME_CHINESE[m[1]] ?? null
}

function parsePassages(filePath: string, volumes?: Set<number>): PassageInsert[] {
  const lines = readFileSync(filePath, 'utf-8').split('\n')
  const passages: PassageInsert[] = []
  let currentTheme = ''
  let currentOrigin = ''
  let currentTitle = ''
  let rawLines: string[] = []
  let activeVolume: number | null = null
  let inScope = false

  const flush = () => {
    if (!currentOrigin || !inScope) return
    const paras = rawLines
      // eslint-disable-next-line no-irregular-whitespace
      .map((l) => l.replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''))
      .filter((l) => l.length > 0)
    if (paras.join('').length < 20) return
    for (const chunk of chunkParagraphs(paras, currentTitle)) {
      passages.push({
        source_book: '经史百家杂钞',
        source_origin: currentOrigin,
        title: chunk.title,
        content: chunk.content,
        difficulty: getDifficulty(currentOrigin),
        theme: currentTheme,
        enabled: true,
      })
    }
    rawLines = []
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    if (line.startsWith('●')) {
      flush()
      currentOrigin = ''
      currentTitle = ''
      rawLines = []
      if (line.includes('序例')) {
        inScope = false
        continue
      }
      currentTheme = extractTheme(line)
      activeVolume = extractVolume(line)
      inScope = !volumes || (activeVolume !== null && volumes.has(activeVolume))
    } else if (line.startsWith('○')) {
      flush()
      currentOrigin = ''
      currentTitle = ''
      rawLines = []
      if (!inScope) continue
      const raw = line.slice(1).trim()
      const dash = raw.indexOf('-')
      if (dash !== -1) { currentOrigin = raw.slice(0, dash).trim(); currentTitle = raw.slice(dash + 1).trim() }
      else { currentOrigin = raw; currentTitle = raw }
    } else if (inScope && currentOrigin && (line.startsWith('　') || line.startsWith(' ') || line.startsWith('\t'))) {
      rawLines.push(line)
    } else if (inScope && currentOrigin && line.trim().length > 0) {
      rawLines.push(line)
    }
  }
  flush()
  return passages
}

// ---------------------------------------------------------------------------
// Supabase batch insert
// ---------------------------------------------------------------------------
async function insertBatch(batch: PassageInsert[]): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/xz_du_passages`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(batch),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Insert failed: ${response.status} ${text}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const INPUT = resolve(__dirname, '../data/经史百家杂钞.txt')
const BATCH_SIZE = 50

// Parse --volume=1 or --volume=1,2,3 from argv
const volumeArg = process.argv.find((a) => a.startsWith('--volume='))
const volumeFilter = volumeArg
  ? new Set(volumeArg.replace('--volume=', '').split(',').map(Number))
  : undefined

const passages = parsePassages(INPUT, volumeFilter)
const scope = volumeFilter ? `卷 ${[...volumeFilter].join(', ')}` : '全部'
process.stdout.write(`范围：${scope}，共 ${passages.length} 条。Inserting in batches of ${BATCH_SIZE}...\n`)

let inserted = 0
for (let i = 0; i < passages.length; i += BATCH_SIZE) {
  const batch = passages.slice(i, i + BATCH_SIZE)
  await insertBatch(batch)
  inserted += batch.length
  process.stdout.write(`  ${inserted}/${passages.length}\n`)
}

process.stdout.write(`Done. Inserted ${inserted} passages into xz_du_passages.\n`)
