import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return relayJson(await proxyFetch(request, new URL(`/dashboard-status-colors/${encodeURIComponent(id)}`, env.API_URL), { method: 'DELETE' }));
}
