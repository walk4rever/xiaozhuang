import { unsubscribeEmail } from '@/lib/du-server'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')?.trim().toLowerCase()

  if (!email || !EMAIL_REGEX.test(email)) {
    return new Response('邮箱无效。', { status: 400 })
  }

  try {
    await unsubscribeEmail(email)
    return new Response('你已成功退订慢读邮件。', { status: 200 })
  } catch {
    return new Response('退订失败，请稍后重试。', { status: 500 })
  }
}
