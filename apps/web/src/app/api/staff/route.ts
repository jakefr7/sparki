import { type NextRequest } from 'next/server';
import { env } from '../../../lib/env';
import { proxyFetch, relayJson } from '../../../lib/api-proxy';

/** Same server-side proxy pattern as /api/patients/search — see that route
 *  for why (private API origin, forwards the auth session cookie). */
export async function GET(request: NextRequest) {
  const upstreamUrl = new URL('/staff', env.API_URL);
  upstreamUrl.search = request.nextUrl.search;

  const upstreamResponse = await proxyFetch(request, upstreamUrl);
  return relayJson(upstreamResponse);
}
