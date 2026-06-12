import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifySessionToken, COOKIE_NAMES } from '@/lib/auth'

const ADMIN_PATHS = ['/admin', '/api/admin']
// Reachable without a session: login, auth APIs, invite redemption, cron (Bearer-token auth at route level)
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/invite', '/api/invites', '/api/cron']

// Segment-boundary match: '/login' and '/login/...', but never '/loginfoo'
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiPath = matchesPrefix(pathname, '/api')

  if (PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get(COOKIE_NAMES.session)
  const session = sessionCookie ? await verifySessionToken(sessionCookie.value) : null

  if (!session) {
    // fetch() callers can't act on an HTML redirect — give APIs a real 401
    if (isApiPath) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const isAdminPath = ADMIN_PATHS.some((p) => matchesPrefix(pathname, p))
  if (isAdminPath && session.role !== 'ADMIN') {
    if (isApiPath) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const url = new URL('/login', request.url)
    url.searchParams.set('message', 'admin-required')
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
