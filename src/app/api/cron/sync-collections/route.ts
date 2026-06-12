import type { NextRequest } from 'next/server'
import { updateAllCollections } from '@/lib/updateCollections'
import { sendDiscordAlert } from '@/lib/discord'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Automatic sync is production-only. On preview/staging (e.g. the `develop`
  // deployment) this short-circuits so we never burn scraper tokens or ping
  // Discord automatically — staging is manual-sync only via the admin panel.
  // VERCEL_ENV is unset locally, so local `npm run dev` testing is unaffected.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return Response.json(
      { skipped: true, reason: `automatic sync disabled in ${process.env.VERCEL_ENV} environment` },
      { status: 200 }
    )
  }

  try {
    const { succeeded, failed } = await updateAllCollections('cron')
    if (failed.length > 0) {
      const lines = failed.map(f => `- ${f.name}: ${f.error}`).join('\n')
      await sendDiscordAlert({
        content: `⚠️ Nightly sync completed with ${failed.length} failure(s) (${succeeded.length} succeeded):\n${lines}`,
      })
    } else {
      await sendDiscordAlert({
        content: `✅ Nightly sync complete: ${succeeded.length} user(s) synced successfully`,
      })
    }
    return Response.json({ success: true, succeeded: succeeded.length, failed: failed.length })
  } catch (error) {
    console.error('Cron sync failed:', error)
    // Hard failure (e.g. DB unreachable) throws before the per-user loop, so no
    // ⚠️/✅ summary is sent. Alert explicitly so a total failure is never silent.
    await sendDiscordAlert({
      content: `❌ Nightly sync crashed before completing: ${String(error)}`,
    }).catch((alertError) => {
      console.error('Failed to post cron-failure alert to Discord:', alertError)
    })
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}
