import { type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../../../../lib/api-proxy';
import { env } from '../../../../../../../lib/env';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; medicationId: string }> }) {
  const { id, medicationId } = await params;
  return relayJson(await proxyFetch(request, new URL(`/patients/${id}/medications/${medicationId}/discontinue`, env.API_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await request.text() }));
}
