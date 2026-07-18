import { type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upstream = await proxyFetch(request, new URL(`/visits/${id}/work-items`, env.API_URL), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await request.text(),
  });
  return relayJson(upstream);
}
