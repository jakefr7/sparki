import { type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstreamResponse = await proxyFetch(
    request,
    new URL(`/scheduler-config/date-exceptions/${id}`, env.API_URL),
    { method: 'DELETE' },
  );

  return relayJson(upstreamResponse);
}
