import {
  getLibraryVolumes,
  getVolumePassagesAdmin,
  getSentPassages,
  getUnsentPassages,
  verifyCronSecret,
} from '@/lib/du-server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const secret = request.headers.get('x-cron-secret') ?? ''
  if (!verifyCronSecret(secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'sent'

  if (type === 'volumes') {
    const volumes = await getLibraryVolumes()
    return Response.json(volumes)
  }

  if (type === 'volume') {
    const vol = parseInt(searchParams.get('vol') ?? '', 10)
    if (isNaN(vol)) return Response.json({ error: 'vol required' }, { status: 400 })
    const articles = await getVolumePassagesAdmin(vol)
    return Response.json(articles)
  }

  // Legacy: sent / unsent
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = 20
  const result = type === 'unsent'
    ? await getUnsentPassages(page, limit)
    : await getSentPassages(page, limit)
  return Response.json({ ...result, page, limit, type })
}
