import { type NextRequest } from 'next/server';
import { env } from '../../../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../../../lib/api-proxy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const { id, lineId } = await params;
  const upstreamResponse = await proxyFetch(request, new URL(`/visits/${id}/invoice/lines/${lineId}`, env.API_URL), {
    method: 'DELETE',
  });

  return relayJson(upstreamResponse);
}
