import { type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';
import { env } from '../../../../../lib/env';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(`/visits/${encodeURIComponent(id)}/fas`, env.API_URL);
  const body: unknown = await request.json();
  return relayJson(
    await proxyFetch(request, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}
