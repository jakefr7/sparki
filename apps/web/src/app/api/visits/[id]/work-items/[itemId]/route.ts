import { type NextRequest } from 'next/server';
import { env } from '../../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../../lib/api-proxy';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const upstream = await proxyFetch(request, new URL(`/visits/${id}/work-items/${itemId}`, env.API_URL), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: await request.text(),
  });
  return relayJson(upstream);
}
