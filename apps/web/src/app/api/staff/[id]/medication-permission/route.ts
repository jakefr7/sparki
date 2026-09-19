import { type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upstream = await proxyFetch(request, new URL(`/staff/${id}/medication-permission`, env.API_URL), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  });
  return relayJson(upstream);
}
