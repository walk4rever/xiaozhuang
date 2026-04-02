import { notFound } from 'next/navigation'
import { getPassageById, getPassageContext } from '@/lib/du-server'
import DuDayClient from '../../[date]/du-day-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DuPreviewPage({ params }: Props) {
  const { id } = await params
  const passageId = parseInt(id, 10)
  if (isNaN(passageId)) notFound()

  const passage = await getPassageById(passageId).catch(() => null)
  if (!passage || !passage.payload) notFound()

  const context = passage.source_origin && passage.title
    ? await getPassageContext(passageId, passage.source_origin, passage.title).catch(() => null)
    : null

  const run = {
    id: 0,
    run_date: '',
    passage_id: passageId,
    sent_count: 0,
    passage,
  }

  return <DuDayClient run={run} date={context?.contextLine ?? '预览'} context={context} />
}
