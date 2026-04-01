/**
 * Parse 经史百家杂钞.txt into SQL INSERT statements for xz_du_passages.
 *
 * Splitting strategy:
 * - Each circle-entry is parsed into natural paragraphs (each indented line)
 * - If total content ≤ 450 chars: one record
 * - If total content > 450 chars: greedy chunk into ~300-450 char blocks
 * - Very short final chunk (< 80 chars) is merged into the previous block
 * - Multi-chunk titles get numbered: 逍遥游篇（一）, 逍遥游篇（二）…
 *
 * Usage:
 *   npx tsx scripts/parse-du-passages.ts
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Passage {
  source_book: string
  source_origin: string
  title: string
  content: string
  theme: string
  difficulty: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_CHUNK = 150    // chars — target upper bound per record
const MIN_CHUNK = 80     // chars — any chunk shorter than this gets merged

// ---------------------------------------------------------------------------
// Theme extraction from volume header  ●卷X·分类之属Y
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

// ---------------------------------------------------------------------------
// Difficulty by source era
// ---------------------------------------------------------------------------
const PRE_QIN = new Set([
  '书', '诗', '易', '礼', '春秋', '左传',
  '孟子', '庄子', '荀子', '韩非子', '老子', '列子', '墨子',
  '屈原', '宋玉',
])
const HAN = new Set([
  '贾谊', '班固', '司马迁', '班彪', '东方朔', '司马相如',
  '扬雄', '张衡', '王粲', '曹操', '陆机', '刘伶', '潘岳',
  '左思', '江统', '李康',
])

function getDifficulty(origin: string): number {
  if (PRE_QIN.has(origin)) return 3
  if (HAN.has(origin)) return 2
  return 1
}

// ---------------------------------------------------------------------------
// Split a long single paragraph at sentence boundaries (。！？)
// ---------------------------------------------------------------------------
function splitLongParagraph(para: string): string[] {
  if (para.length <= MAX_CHUNK) return [para]

  // Split at sentence-ending punctuation, keeping the punctuation
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
    if (current.length < MIN_CHUNK && result.length > 0) {
      result[result.length - 1] += current
    } else {
      result.push(current)
    }
  }

  return result.length > 0 ? result : [para]
}

// ---------------------------------------------------------------------------
// Split paragraphs into appropriately-sized chunks
// ---------------------------------------------------------------------------
function chunkParagraphs(paragraphs: string[], baseTitle: string): Array<{ title: string; content: string }> {
  // First, split any single paragraph that is itself too long
  const expanded: string[] = []
  for (const para of paragraphs) {
    expanded.push(...splitLongParagraph(para))
  }

  const total = expanded.join('').length
  if (total <= MAX_CHUNK) {
    return [{ title: baseTitle, content: expanded.join('\n') }]
  }

  // Greedy chunking — never flush a chunk shorter than MIN_CHUNK
  const chunks: string[][] = []
  let current: string[] = []
  let currentLen = 0

  for (const para of expanded) {
    const wouldExceed = currentLen + para.length > MAX_CHUNK
    const currentIsBig = currentLen >= MIN_CHUNK

    if (wouldExceed && currentIsBig) {
      chunks.push(current)
      current = [para]
      currentLen = para.length
    } else {
      current.push(para)
      currentLen += para.length
    }
  }

  if (current.length > 0) {
    // Merge short tail into last chunk
    if (currentLen < MIN_CHUNK && chunks.length > 0) {
      chunks[chunks.length - 1].push(...current)
    } else {
      chunks.push(current)
    }
  }

  if (chunks.length === 1) {
    return [{ title: baseTitle, content: chunks[0].join('\n') }]
  }

  return chunks.map((lines, i) => ({
    title: `${baseTitle}（${i + 1}）`,
    content: lines.join('\n'),
  }))
}

// ---------------------------------------------------------------------------
// Parse the txt file into raw entries, then chunk
// ---------------------------------------------------------------------------
function parse(filePath: string): Passage[] {
  const lines = readFileSync(filePath, 'utf-8').split('\n')
  const passages: Passage[] = []

  let currentTheme = ''
  let currentOrigin = ''
  let currentTitle = ''
  let rawLines: string[] = []

  const flushEntry = () => {
    const lines = rawLines
    rawLines = []

    if (!currentOrigin) return

    const paragraphs = lines
      // eslint-disable-next-line no-irregular-whitespace
      .map((l) => l.replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''))
      .filter((l) => l.length > 0)

    if (paragraphs.join('').length < 20) return

    const chunks = chunkParagraphs(paragraphs, currentTitle)
    for (const chunk of chunks) {
      passages.push({
        source_book: '经史百家杂钞',
        source_origin: currentOrigin,
        title: chunk.title,
        content: chunk.content,
        theme: currentTheme,
        difficulty: getDifficulty(currentOrigin),
      })
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')

    if (line.startsWith('●')) {
      flushEntry()
      currentOrigin = ''
      currentTitle = ''
      if (!line.includes('序例')) {
        currentTheme = extractTheme(line)
      }
      continue
    }

    if (line.startsWith('○')) {
      flushEntry()
      currentOrigin = ''
      currentTitle = ''
      const raw = line.slice(1).trim()
      const dash = raw.indexOf('-')
      if (dash !== -1) {
        currentOrigin = raw.slice(0, dash).trim()
        currentTitle = raw.slice(dash + 1).trim()
      } else {
        currentOrigin = raw
        currentTitle = raw
      }
      continue
    }

    if (currentOrigin && (line.startsWith('　') || line.startsWith(' ') || line.startsWith('\t'))) {
      rawLines.push(line)
    } else if (currentOrigin && line.trim().length > 0) {
      rawLines.push(line)
    }
  }

  flushEntry()
  return passages
}

// ---------------------------------------------------------------------------
// SQL escaping
// ---------------------------------------------------------------------------
function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

function generateSQL(passages: Passage[]): string {
  const header = `-- Auto-generated by scripts/parse-du-passages.ts
-- Source: data/经史百家杂钞.txt (流芳阁 digitized edition)
-- ${passages.length} passages

INSERT INTO xz_du_passages (source_book, source_origin, title, content, difficulty, theme, enabled)
VALUES`

  const rows = passages.map(
    (p) =>
      `  (${sqlStr(p.source_book)}, ${sqlStr(p.source_origin)}, ${sqlStr(p.title)}, ${sqlStr(p.content)}, ${p.difficulty}, ${sqlStr(p.theme)}, true)`
  )

  return `${header}\n${rows.join(',\n')}\n;\n`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const INPUT = resolve(__dirname, '../data/经史百家杂钞.txt')
const OUTPUT = resolve(__dirname, '../supabase/seeds/du-passages.sql')

const passages = parse(INPUT)

// Summary stats
const byTheme = passages.reduce<Record<string, number>>((acc, p) => {
  acc[p.theme] = (acc[p.theme] ?? 0) + 1
  return acc
}, {})

const lengths = passages.map((p) => p.content.length)
const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
const max = Math.max(...lengths)
const min = Math.min(...lengths)

process.stderr.write(`Parsed ${passages.length} passages\n`)
process.stderr.write(`Content length — min: ${min}  avg: ${avg}  max: ${max}\n`)
process.stderr.write('Theme breakdown:\n')
for (const [theme, count] of Object.entries(byTheme)) {
  process.stderr.write(`  ${theme}: ${count}\n`)
}

const sql = generateSQL(passages)
writeFileSync(OUTPUT, sql, 'utf-8')
process.stderr.write(`Written to ${OUTPUT}\n`)
