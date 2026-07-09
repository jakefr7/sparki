import { type NextRequest } from 'next/server';
import { env } from '../../../lib/env';
import { proxyFetch, relayJson } from '../../../lib/api-proxy';

/** Same server-side proxy pattern as /api/patients/search — see that route
 *  for why (private API origin, forwards the auth session cookie). */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  const upstreamResponse = await proxyFetch(request, new URL('/patients', env.API_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return relayJson(upstreamResponse);
}

/** Plain directory listing (no query) — what the Patients tab shows before
 *  the user searches. */
export async function GET(request: NextRequest) {
  const upstreamUrl = new URL('/patients', env.API_URL);
  const limit = request.nextUrl.searchParams.get('limit');
  if (limit) {
    upstreamUrl.searchParams.set('limit', limit);
  }

  const upstreamResponse = await proxyFetch(request, upstreamUrl);
  return relayJson(upstreamResponse);
}
