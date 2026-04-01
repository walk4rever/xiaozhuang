import {
  deleteDailyRun,
  getRunByDate,
  pickTodayPassage,
  saveDailyRun,
  verifyCronSecret,
} from '@/lib/du-server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  const incomingSecret = request.headers.get('x-cron-secret') ?? bearer
  if (!verifyCronSecret(incomingSecret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runDate = new Date().toISOString().slice(0, 10)

  // 支持强制重置（admin 测试用）
  const { force } = await request.json().catch(() => ({ force: false })) as { force?: boolean }

  try {
    const existing = await getRunByDate(runDate)
    if (existing && !force) {
      return Response.json({
        message: 'Already prepared today',
        runDate,
        passageId: existing.passage_id,
        title: existing.passage.title,
      })
    }

    if (existing && force) {
      await deleteDailyRun(runDate)
    }

    const passage = await pickTodayPassage()

    if (!passage.payload) {
      return Response.json(
        { error: 'Passage has no payload yet. Run generate-payloads script first.', passageId: passage.id },
        { status: 422 }
      )
    }

    await saveDailyRun(runDate, passage.id)

    return Response.json({
      message: 'Prepared',
      runDate,
      passageId: passage.id,
      sourceOrigin: passage.source_origin,
      title: passage.title,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prepare failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
