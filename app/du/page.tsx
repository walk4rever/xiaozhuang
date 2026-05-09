import type { Metadata } from 'next'
import { getRecentRunsPaged } from '@/lib/du-server'
import DuClient from './du-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '慢读 — 小庄',
  description: '订阅每日古文慢读：经史百家杂钞精选，每天一封，慢慢读懂。',
}

interface Props {
  searchParams: Promise<{ page?: string }>
}

const PAGE_SIZE = 10

export default async function DuPage({ searchParams }: Props) {
  const { page: pageRaw } = await searchParams
  const currentPage = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1)

  const { items: recentRuns, total } = await getRecentRunsPaged(currentPage, PAGE_SIZE).catch(() => ({ items: [], total: 0 }))

  return (
    <DuClient
      recentRuns={recentRuns}
      pagination={{ page: currentPage, pageSize: PAGE_SIZE, total }}
    />
  )
}
