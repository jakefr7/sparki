import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: unknown = await request.json();

  const upstreamResponse = await proxyFetch(request, new URL(`/notes/${id}`, env.API_URL), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return relayJson(upstreamResponse);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstreamResponse = await proxyFetch(request, new URL(`/notes/${id}`, env.API_URL), {
    method: 'DELETE',
  });

  return relayJson(upstreamResponse);
}
