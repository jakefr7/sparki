import { type NextRequest } from 'next/server';
import { env } from '../../../lib/env';
import { proxyFetch, relayJson } from '../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  return relayJson(await proxyFetch(request, new URL('/visit-policy', env.API_URL)));
}

export async function PUT(request: NextRequest) {
  const body = await request.text();
  return relayJson(await proxyFetch(request, new URL('/visit-policy', env.API_URL), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
  }));
}
