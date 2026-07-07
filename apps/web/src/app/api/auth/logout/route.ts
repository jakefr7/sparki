import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

export async function POST(request: NextRequest) {
  const upstreamResponse = await proxyFetch(request, new URL('/auth/logout', env.API_URL), {
    method: 'POST',
  });

  return relayJson(upstreamResponse);
}
