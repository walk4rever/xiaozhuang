import { getRunByDate } from '@/lib/du-server'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params

  if (!DATE_RE.test(date)) {
    return Response.json({ error: 'Invalid date format' }, { status: 400 })
  }

  try {
    const run = await getRunByDate(date)
    if (!run) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    return Response.json(run)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
