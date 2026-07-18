import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  const upstreamUrl = new URL('/appointments/schedule', env.API_URL);
  upstreamUrl.search = request.nextUrl.search;
  return relayJson(await proxyFetch(request, upstreamUrl));
}
