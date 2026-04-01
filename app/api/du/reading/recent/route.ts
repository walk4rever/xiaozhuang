import { getRecentRuns } from '@/lib/du-server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const runs = await getRecentRuns(7)
    return Response.json(runs)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
