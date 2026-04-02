import { getSentPassages, getUnsentPassages, verifyCronSecret } from '@/lib/du-server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const secret = request.headers.get('x-cron-secret') ?? ''
  if (!verifyCronSecret(secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') === 'unsent' ? 'unsent' : 'sent'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = 20

  const result = type === 'sent'
    ? await getSentPassages(page, limit)
    : await getUnsentPassages(page, limit)

  return Response.json({ ...result, page, limit, type })
}
