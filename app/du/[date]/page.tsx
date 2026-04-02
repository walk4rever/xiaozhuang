import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getRunByDate, getPassageContext } from '@/lib/du-server'
import DuDayClient from './du-day-client'

interface Props {
  params: Promise<{ date: string }>
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params
  if (!DATE_RE.test(date)) return {}

  const run = await getRunByDate(date).catch(() => null)
  if (!run) return { title: '慢读 — 小庄' }

  const source = [run.passage.source_origin, run.passage.title].filter(Boolean).join(' · ')
  const summary = (run.passage.payload?.summary ?? '').slice(0, 100)

  return {
    title: `${date} 慢读｜${source} — 小庄`,
    description: summary,
    openGraph: {
      title: `今日慢读｜${source}`,
      description: summary,
      url: `https://xz.air7.fun/du/${date}`,
      siteName: '小庄',
      locale: 'zh_CN',
      type: 'article',
    },
  }
}

export default async function DuDayPage({ params }: Props) {
  const { date } = await params
  if (!DATE_RE.test(date)) notFound()

  const run = await getRunByDate(date).catch(() => null)
  if (!run) notFound()

  const context = run.passage.source_origin && run.passage.title
    ? await getPassageContext(run.passage.id, run.passage.source_origin, run.passage.title).catch(() => null)
    : null

  return <DuDayClient run={run} date={date} context={context} />
}
