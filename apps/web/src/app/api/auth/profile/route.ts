import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  return relayJson(await proxyFetch(request, new URL('/auth/profile', env.API_URL)));
}

export async function PATCH(request: NextRequest) {
  const body: unknown = await request.json();
  return relayJson(await proxyFetch(request, new URL('/auth/profile', env.API_URL), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}
