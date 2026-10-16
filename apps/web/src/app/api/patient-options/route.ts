import { type NextRequest } from 'next/server';
import { env } from '../../../lib/env';
import { proxyFetch, relayJson } from '../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  const url = new URL(`/patient-options`, env.API_URL);
  url.search = request.nextUrl.search;
  return relayJson(await proxyFetch(request, url));
}
