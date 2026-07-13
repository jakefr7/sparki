import { type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';
import { env } from '../../../../../lib/env';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: unknown = await request.json();

  const upstreamResponse = await proxyFetch(request, new URL(`/patients/${id}/alerts`, env.API_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return relayJson(upstreamResponse);
}
