import type { NextRequest } from 'next/server'
import { updateAllCollections } from '@/lib/updateCollections'
import { sendDiscordAlert } from '@/lib/discord'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const { succeeded, failed } = await updateAllCollections('cron')
    if (failed.length > 0) {
      const lines = failed.map(f => `- ${f.name}: ${f.error}`).join('\n')
      await sendDiscordAlert({
        content: `Nightly sync completed with ${failed.length} failure(s) (${succeeded.length} succeeded):\n${lines}`,
      })
    }
    return Response.json({ success: true, succeeded: succeeded.length, failed: failed.length })
  } catch (error) {
    console.error('Cron sync failed:', error)
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}
