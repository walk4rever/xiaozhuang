import { confirmSubscription } from '@/lib/du-server'
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!token) redirect('/du?confirm=invalid')

  const ok = await confirmSubscription(token)
  redirect(ok ? '/du?confirm=ok' : '/du?confirm=invalid')
}
