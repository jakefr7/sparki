import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

/** Same server-side proxy pattern as /api/patients/search — see that route
 *  for why (private API origin, forwards the auth session cookie). Keeps
 *  the Mapbox access token entirely server-side (AddressService). */
export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get('placeId')?.trim() ?? '';
  const sessionToken = request.nextUrl.searchParams.get('sessionToken')?.trim() ?? '';
  if (!placeId || !sessionToken) {
    return NextResponse.json(null);
  }

  const upstreamUrl = new URL('/address/details', env.API_URL);
  upstreamUrl.searchParams.set('placeId', placeId);
  upstreamUrl.searchParams.set('sessionToken', sessionToken);

  const upstreamResponse = await proxyFetch(request, upstreamUrl);
  return relayJson(upstreamResponse);
}
