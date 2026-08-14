import 'server-only';

import { cookies } from 'next/headers';

/**
 * Fetches a protected API resource during server rendering. The incoming
 * cookie header stays server-side and is forwarded opaquely to Nest; protected
 * SSR reads must never rely on the development identity fallback.
 */
export async function authenticatedServerFetch(
  upstreamUrl: URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookieHeader = (await cookies()).toString();
  if (cookieHeader) {
    headers.set('cookie', cookieHeader);
  }

  return fetch(upstreamUrl, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
