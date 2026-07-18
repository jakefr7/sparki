import { type NextRequest } from 'next/server';
import { env } from '../../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../../lib/api-proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upstreamResponse = await proxyFetch(request, new URL(`/visits/${id}/record/finalize`, env.API_URL), { method: 'POST' });
  return relayJson(upstreamResponse);
}
