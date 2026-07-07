import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from './lib/auth-cookie';

/**
 * Fast, cheap redirect based on cookie presence only — not full session
 * verification (that would need the WorkOS JWKS/iron-session crypto this
 * edge runtime doesn't have easy access to). Real authorization is enforced
 * on every request by the API's AuthGuard (apps/api/src/auth/auth.guard.ts),
 * which verifies and refreshes the sealed session server-side; this just
 * avoids flashing protected UI before that check can run, and redirects an
 * already-signed-in user away from /login.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (!hasSession && !isLoginPage) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
