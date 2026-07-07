import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  const upstreamResponse = await proxyFetch(request, new URL('/auth/me', env.API_URL));

  return relayJson(upstreamResponse);
}
