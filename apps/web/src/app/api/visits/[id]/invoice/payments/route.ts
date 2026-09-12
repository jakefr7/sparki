import { type NextRequest } from 'next/server';
import { env } from '../../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../../lib/api-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstreamResponse = await proxyFetch(request, new URL(`/visits/${id}/invoice/payments`, env.API_URL));

  return relayJson(upstreamResponse);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.text();
  const upstreamResponse = await proxyFetch(request, new URL(`/visits/${id}/invoice/payments`, env.API_URL), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  });
  return relayJson(upstreamResponse);
}
