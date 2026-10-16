import { type NextRequest } from 'next/server';
import { env } from '../../../lib/env';
import { proxyFetch, relayJson } from '../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  const url = new URL(`/referral-contacts`, env.API_URL);
  url.search = request.nextUrl.search;
  return relayJson(await proxyFetch(request, url));
}

export async function POST(request: NextRequest) {
  const url = new URL(`/referral-contacts`, env.API_URL);
  return relayJson(
    await proxyFetch(request, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await request.json()),
    }),
  );
}
