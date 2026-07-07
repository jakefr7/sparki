import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

/** Same server-side proxy pattern as /api/patients/search — see that route
 *  for why (private API origin, forwards the auth session cookie). */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')?.trim() ?? '';
  if (!query) {
    return NextResponse.json([]);
  }

  const upstreamUrl = new URL('/clients/search', env.API_URL);
  upstreamUrl.searchParams.set('query', query);
  const limit = request.nextUrl.searchParams.get('limit');
  if (limit) {
    upstreamUrl.searchParams.set('limit', limit);
  }

  const upstreamResponse = await proxyFetch(request, upstreamUrl);
  return relayJson(upstreamResponse);
}
