import { verifyCronSecret } from '@/lib/du-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret') ?? null
  if (!verifyCronSecret(secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return Response.json({ ok: true })
}
