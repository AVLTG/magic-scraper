import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { COOKIE_NAMES } from '@/lib/auth'

export async function POST() {
  const cookieStore = await cookies()  // MUST await in Next.js 16
  cookieStore.set(COOKIE_NAMES.session, '', { maxAge: 0, path: '/' })
  // Stale pre-migration cookie — keep clearing it until the legacy window closes
  cookieStore.set('admin_session', '', { maxAge: 0, path: '/' })
  return NextResponse.json({ success: true, redirect: '/login' })
}
