import { type NextRequest } from 'next/server';
import { env } from '../../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../../lib/api-proxy';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  const upstreamResponse = await proxyFetch(request, new URL(`/visits/${id}/record/draft`, env.API_URL), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
  });
  return relayJson(upstreamResponse);
}
