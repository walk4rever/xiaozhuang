import { subscribeEmail, sendConfirmEmail } from '@/lib/du-server'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email || !EMAIL_REGEX.test(email)) {
    return Response.json({ error: 'Invalid email' }, { status: 400 })
  }

  try {
    const token = await subscribeEmail(email)
    await sendConfirmEmail(email, token)
    return Response.json({ message: '确认邮件已发送，请查收并点击链接完成订阅。' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Subscribe failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
