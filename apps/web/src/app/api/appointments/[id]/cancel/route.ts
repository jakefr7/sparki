import { type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await proxyFetch(request, new URL(`/appointments/${encodeURIComponent(id)}/cancel`, env.API_URL), { method: 'POST' });
  return relayJson(response);
}
