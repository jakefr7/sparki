import { type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(`/patients/${encodeURIComponent(id)}/providers`, env.API_URL);
  url.search = request.nextUrl.search;
  return relayJson(await proxyFetch(request, url));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(`/patients/${encodeURIComponent(id)}/providers`, env.API_URL);
  return relayJson(
    await proxyFetch(request, url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await request.json()),
    }),
  );
}
