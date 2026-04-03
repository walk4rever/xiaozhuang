import {
  getActiveSubscribers,
  getRunByDate,
  sendCronAlertEmail,
  sendDuEmails,
  sendTestEmail,
  updatePassageLastSentAt,
  updateSentCount,
  verifyCronSecret,
} from '@/lib/du-server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  if (!verifyCronSecret(bearer)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runDate = new Date().toISOString().slice(0, 10)

  try {
    const run = await getRunByDate(runDate)
    if (!run) {
      return Response.json({ error: 'No prepared run for today. Call /prepare first.' }, { status: 422 })
    }

    const { passage } = run
    if (!passage.payload) {
      return Response.json({ error: 'Passage has no payload' }, { status: 422 })
    }

    if (run.sent_count > 0) {
      return Response.json({ message: 'Already sent today', runDate, sentCount: run.sent_count })
    }

    const subscribers = await getActiveSubscribers()
    if (!subscribers.length) {
      return Response.json({ message: 'No subscribers', runDate })
    }

    const sentCount = await sendDuEmails(runDate, passage, passage.payload, subscribers)
    await updateSentCount(runDate, sentCount)
    await updatePassageLastSentAt(passage.id)

    return Response.json({
      message: 'Sent',
      runDate,
      passageId: passage.id,
      sentCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed'
    await sendCronAlertEmail('cron/send', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
  const incomingSecret = request.headers.get('x-cron-secret') ?? bearer
  if (!verifyCronSecret(incomingSecret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runDate = new Date().toISOString().slice(0, 10)
  const { testOnly } = await request.json().catch(() => ({ testOnly: false })) as { testOnly?: boolean }

  try {
    const run = await getRunByDate(runDate)
    if (!run) {
      return Response.json({ error: 'No prepared run for today. Call /prepare first.' }, { status: 422 })
    }

    const { passage } = run
    if (!passage.payload) {
      return Response.json({ error: 'Passage has no payload' }, { status: 422 })
    }

    // 测试模式：只发给 admin
    if (testOnly) {
      await sendTestEmail(runDate, passage, passage.payload)
      return Response.json({ message: 'Test email sent', runDate, passageId: passage.id })
    }

    // 正式发送
    if (run.sent_count > 0) {
      return Response.json({ message: 'Already sent today', runDate, sentCount: run.sent_count })
    }

    const subscribers = await getActiveSubscribers()
    if (!subscribers.length) {
      return Response.json({ message: 'No subscribers', runDate })
    }

    const sentCount = await sendDuEmails(runDate, passage, passage.payload, subscribers)
    await updateSentCount(runDate, sentCount)
    await updatePassageLastSentAt(passage.id)

    return Response.json({
      message: 'Sent',
      runDate,
      passageId: passage.id,
      sentCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
