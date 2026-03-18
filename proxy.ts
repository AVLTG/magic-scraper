import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyHmac, COOKIE_NAMES } from '@/lib/auth'

const ADMIN_PATHS = ['/admin', '/api/admin']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip login page and auth API routes — prevent infinite redirect loop
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Skip cron paths — authenticated by Bearer token at route level, not session cookie
  if (pathname.startsWith('/api/cron')) {
    return NextResponse.next()
  }

  // Check group session cookie
  const sessionCookie = request.cookies.get(COOKIE_NAMES.session)
  const hasSession = sessionCookie && verifyHmac(sessionCookie.value, COOKIE_NAMES.session)

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Check admin session for admin paths
  const isAdminPath = ADMIN_PATHS.some(p => pathname.startsWith(p))
  if (isAdminPath) {
    const adminCookie = request.cookies.get(COOKIE_NAMES.adminSession)
    const hasAdmin = adminCookie && verifyHmac(adminCookie.value, COOKIE_NAMES.adminSession)
    if (!hasAdmin) {
      const url = new URL('/login', request.url)
      url.searchParams.set('message', 'admin-required')
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
