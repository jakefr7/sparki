import { type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';
import { env } from '../../../../../lib/env';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(`/patients/${encodeURIComponent(id)}/fas`, env.API_URL);
  const cursor = request.nextUrl.searchParams.get('cursor');
  if (cursor) url.searchParams.set('cursor', cursor);
  return relayJson(await proxyFetch(request, url));
}
