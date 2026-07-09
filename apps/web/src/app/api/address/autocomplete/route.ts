import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

/** Same server-side proxy pattern as /api/patients/search — see that route
 *  for why (private API origin, forwards the auth session cookie). Keeps
 *  the Mapbox access token entirely server-side (AddressService). */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')?.trim() ?? '';
  const sessionToken = request.nextUrl.searchParams.get('sessionToken')?.trim() ?? '';
  if (query.length < 3 || !sessionToken) {
    return NextResponse.json([]);
  }

  const upstreamUrl = new URL('/address/autocomplete', env.API_URL);
  upstreamUrl.searchParams.set('query', query);
  upstreamUrl.searchParams.set('sessionToken', sessionToken);

  const upstreamResponse = await proxyFetch(request, upstreamUrl);
  return relayJson(upstreamResponse);
}
