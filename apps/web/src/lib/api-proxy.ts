import { NextResponse, type NextRequest } from 'next/server';

/**
 * Shared helper for the server-side proxy routes under app/api/** (see e.g.
 * patients/search/route.ts for why this indirection exists at all: the
 * browser never talks to the API origin directly).
 *
 * Forwards the browser's httpOnly session cookie to the API on the way in,
 * and relays any Set-Cookie the API sends back (AuthGuard re-issues the
 * session cookie transparently when it refreshes an expired access token —
 * without this, that refreshed cookie would be dropped by the proxy and the
 * browser would get logged out on the next request).
 */
export function proxyFetch(request: NextRequest, upstreamUrl: URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }
  return fetch(upstreamUrl, { ...init, headers, cache: init.cache ?? 'no-store' });
}

export async function relayJson(upstreamResponse: Response): Promise<NextResponse> {
  const body: unknown = await upstreamResponse.json();
  const response = NextResponse.json(body, { status: upstreamResponse.status });
  relayCookies(upstreamResponse, response);
  return response;
}

export function relayCookies(upstreamResponse: Response, response: NextResponse): void {
  const setCookie =
    typeof upstreamResponse.headers.getSetCookie === 'function'
      ? upstreamResponse.headers.getSetCookie()
      : upstreamResponse.headers.get('set-cookie')
        ? [upstreamResponse.headers.get('set-cookie')!]
        : [];
  for (const cookie of setCookie) {
    response.headers.append('set-cookie', cookie);
  }
}
