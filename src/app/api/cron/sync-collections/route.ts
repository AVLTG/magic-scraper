import type { NextRequest } from 'next/server'
import { updateAllCollections } from '@/lib/updateCollections'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await updateAllCollections()
    return Response.json({ success: true })
  } catch (error) {
    console.error('Cron sync failed:', error)
    return Response.json({ success: false, error: String(error) }, { status: 500 })
  }
}
