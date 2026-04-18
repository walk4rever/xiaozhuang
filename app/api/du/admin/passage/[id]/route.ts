import {
  getPassageByIdFull,
  getPassageContext,
  updatePassage,
  verifyCronSecret,
  type PassageUpdate,
} from '@/lib/du-server'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('x-cron-secret') ?? ''
  if (!verifyCronSecret(secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const passage = await getPassageByIdFull(id)
  if (!passage) return Response.json({ error: 'Not found' }, { status: 404 })

  const context = (passage.source_origin && passage.title)
    ? await getPassageContext(id, passage.source_origin, passage.title).catch(() => null)
    : null

  return Response.json({ ...passage, context })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('x-cron-secret') ?? ''
  if (!verifyCronSecret(secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  const allowed: (keyof PassageUpdate)[] = [
    'content', 'title', 'source_origin', 'difficulty', 'theme', 'enabled',
  ]
  const fields: PassageUpdate = {}
  for (const key of allowed) {
    if (key in body) (fields as Record<string, unknown>)[key] = body[key]
  }

  if (Object.keys(fields).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  await updatePassage(id, fields)
  return Response.json({ message: 'Updated', id })
}
