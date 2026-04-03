import {
  buildGuaCacheKey,
  getGuaInterpretation,
  saveGuaInterpretation,
  type GuaInterpretation,
} from '@/lib/gua-server'

export const runtime = 'nodejs'

// GET /api/gua/interpret?baseId=1&changing=1,3,5
// Returns { hit: true, data: GuaInterpretation } or { hit: false }
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const baseId = parseInt(searchParams.get('baseId') ?? '', 10)
  const changingParam = searchParams.get('changing') ?? ''

  if (!baseId || baseId < 1 || baseId > 64) {
    return Response.json({ error: 'Invalid baseId' }, { status: 400 })
  }

  const changingPositions = changingParam
    ? changingParam.split(',').map(Number).filter((n) => n >= 1 && n <= 6)
    : []

  const key = buildGuaCacheKey(baseId, changingPositions)

  try {
    const cached = await getGuaInterpretation(key)
    if (cached) {
      return Response.json({ hit: true, data: cached })
    }
    return Response.json({ hit: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cache lookup failed'
    console.error('[gua/interpret GET]', message)
    return Response.json({ hit: false })
  }
}

// POST /api/gua/interpret
// Body: { baseId, changing, baseInterpretation, changingLinesGuidance, changedInterpretation }
export async function POST(request: Request) {
  let body: {
    baseId?: number
    changing?: number[]
    baseInterpretation?: string
    changingLinesGuidance?: string
    changedInterpretation?: string
  }

  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { baseId, changing = [], baseInterpretation, changingLinesGuidance, changedInterpretation } = body

  if (!baseId || !baseInterpretation || !changingLinesGuidance || !changedInterpretation) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const key = buildGuaCacheKey(baseId, changing)
  const record: GuaInterpretation = { key, base_interpretation: baseInterpretation, changing_lines_guidance: changingLinesGuidance, changed_interpretation: changedInterpretation }

  try {
    await saveGuaInterpretation(record)
    return Response.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cache save failed'
    console.error('[gua/interpret POST]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
