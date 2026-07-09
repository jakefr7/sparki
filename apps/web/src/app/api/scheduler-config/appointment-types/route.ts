import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const upstreamResponse = await proxyFetch(
    request,
    new URL('/scheduler-config/appointment-types', env.API_URL),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  return relayJson(upstreamResponse);
}
