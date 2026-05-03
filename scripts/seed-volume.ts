/**
 * 一键入库：入库 → payload → author bio → article background
 *
 * Usage:
 *   npx tsx scripts/seed-volume.ts --volume=3
 *   npx tsx scripts/seed-volume.ts --volume=3,4
 */

import { execFileSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
config({ path: resolve(root, '.env.local') })

const volumeArg = process.argv.find((a) => a.startsWith('--volume='))
if (!volumeArg) {
  process.stderr.write('Usage: npx tsx scripts/seed-volume.ts --volume=<N>\n')
  process.exit(1)
}

const run = (script: string, ...args: string[]) => {
  const label = `[${script}${args.length ? ' ' + args.join(' ') : ''}]`
  process.stdout.write(`\n${'─'.repeat(60)}\n▶ ${label}\n${'─'.repeat(60)}\n`)
  execFileSync('npx', ['tsx', `scripts/${script}.ts`, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
}

run('seed-jingshi', volumeArg)
run('generate-payloads', volumeArg)
run('backfill-authors-articles')

// ── Final verification ────────────────────────────────────
process.stdout.write(`\n${'─'.repeat(60)}\n▶ [verification]\n${'─'.repeat(60)}\n`)

const volumes = volumeArg.replace('--volume=', '').split(',').map(Number)
const supabaseUrl = process.env.SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

let exitCode = 0
for (const vol of volumes) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/xz_du_passages?volume=eq.${vol}&enabled=eq.true&select=id,title,payload`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Range-Unit': 'items',
        Range: '0-9999',
      },
    }
  )
  const rows = await res.json() as Array<{ id: number; title: string; payload: unknown }>
  const total = rows.length
  const missing = rows.filter((r) => !r.payload)
  if (missing.length === 0) {
    process.stdout.write(`✅ 卷${vol}: ${total} 条，payload 全部完整\n`)
  } else {
    exitCode = 1
    process.stdout.write(`❌ 卷${vol}: ${total} 条，${missing.length} 条 payload 缺失：\n`)
    for (const r of missing) process.stdout.write(`   id=${r.id}  ${r.title}\n`)
  }
}

process.exit(exitCode)
