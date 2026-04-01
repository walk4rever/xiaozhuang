import type { Metadata } from 'next'
import { getRecentRuns } from '@/lib/du-server'
import DuClient from './du-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '慢读订阅 — 小庄',
  description: '订阅每日古文慢读：经史百家杂钞精选，每天一封，慢慢读懂。',
}

export default async function DuPage() {
  const recentRuns = await getRecentRuns(10).catch(() => [])
  return <DuClient recentRuns={recentRuns} />
}
