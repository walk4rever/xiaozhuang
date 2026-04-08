export {}
/**
 * Remove duplicate xz_du_passages rows before adding the unique identity constraint.
 *
 * Keeps the most useful row in each duplicate group:
 * - prefers rows with payload
 * - then prefers rows with last_sent_at
 * - then keeps the oldest id
 *
 * Usage:
 *   npx tsx scripts/dedupe-du-passages.ts
 *   npx tsx scripts/dedupe-du-passages.ts --dry-run
 */

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  process.stderr.write('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set\n')
  process.exit(1)
}

interface PassageRow {
  id: number
  source_book: string
  source_origin: string | null
  title: string | null
  content: string
  payload: unknown
  last_sent_at: string | null
  referenced: boolean
}

const dryRun = process.argv.includes('--dry-run')

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
  return res.json() as Promise<T>
}

const rows = await supaFetch<Array<Omit<PassageRow, 'referenced'>>>(
  'xz_du_passages?select=id,source_book,source_origin,title,content,payload,last_sent_at&order=id.asc&limit=5000'
)

const runs = await supaFetch<Array<{ passage_id: number }>>(
  'xz_du_daily_runs?select=passage_id&limit=5000'
)

const referencedIds = new Set(runs.map((row) => row.passage_id))
const hydratedRows: PassageRow[] = rows.map((row) => ({
  ...row,
  referenced: referencedIds.has(row.id),
}))

const keyOf = (row: PassageRow) => [row.source_book, row.source_origin ?? '', row.title ?? '', row.content].join('||')
const groups = new Map<string, PassageRow[]>()

for (const row of hydratedRows) {
  const key = keyOf(row)
  const group = groups.get(key) ?? []
  group.push(row)
  groups.set(key, group)
}

const score = (row: PassageRow) => {
  let total = 0
  if (row.referenced) total += 20
  if (row.payload != null) total += 10
  if (row.last_sent_at != null) total += 5
  total -= row.id / 1_000_000
  return total
}

const duplicates = [...groups.values()].filter((group) => group.length > 1)
let deleteCount = 0

for (const group of duplicates) {
  const sorted = [...group].sort((a, b) => score(b) - score(a))
  const keep = sorted[0]
  const remove = sorted.slice(1)

  process.stdout.write(
    `keep id=${keep.id}; remove=${remove.map((row) => row.id).join(', ')} :: ${keep.source_origin ?? ''} · ${keep.title ?? ''}\n`
  )

  deleteCount += remove.length
  if (dryRun || remove.length === 0) continue

  const ids = remove.map((row) => row.id).join(',')
  await supaFetch(`xz_du_passages?id=in.(${ids})`, { method: 'DELETE' })
}

process.stdout.write(
  dryRun
    ? `Dry run complete. Duplicate groups: ${duplicates.length}, rows to delete: ${deleteCount}\n`
    : `Dedup complete. Duplicate groups: ${duplicates.length}, rows deleted: ${deleteCount}\n`
)
