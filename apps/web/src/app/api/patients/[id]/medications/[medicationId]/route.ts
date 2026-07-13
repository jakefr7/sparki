import { type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../../../lib/api-proxy';
import { env } from '../../../../../../lib/env';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; medicationId: string }> },
) {
  const { id, medicationId } = await params;
  const body: unknown = await request.json();

  const upstreamResponse = await proxyFetch(
    request,
    new URL(`/patients/${id}/medications/${medicationId}`, env.API_URL),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  return relayJson(upstreamResponse);
}
