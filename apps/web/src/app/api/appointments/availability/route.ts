import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  const upstreamUrl = new URL('/appointments/availability/search', env.API_URL);
  upstreamUrl.search = request.nextUrl.search;
  const upstreamResponse = await proxyFetch(request, upstreamUrl);
  if (!upstreamResponse.ok) {
    // The booking modal shows one generic message for every failure here and the API does not
    // log 4xx responses, so record the reason. The query holds only ids and dates.
    const reason = (await upstreamResponse.clone().text()).slice(0, 500);
    console.warn(`[availability] ${upstreamResponse.status} for ${request.nextUrl.search}: ${reason}`);
  }
  return relayJson(upstreamResponse);
}
