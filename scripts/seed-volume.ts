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

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

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
