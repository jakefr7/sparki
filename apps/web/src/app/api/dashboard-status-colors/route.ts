import { type NextRequest } from 'next/server';
import { env } from '../../../lib/env';
import { proxyFetch, relayJson } from '../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  const upstreamResponse = await proxyFetch(request, new URL('/dashboard-status-colors', env.API_URL));

  return relayJson(upstreamResponse);
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const upstreamResponse = await proxyFetch(request, new URL('/dashboard-status-colors', env.API_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return relayJson(upstreamResponse);
}
