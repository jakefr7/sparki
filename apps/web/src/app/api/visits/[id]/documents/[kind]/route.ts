import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../../../lib/env';
import { proxyFetch, relayCookies } from '../../../../../../lib/api-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const upstream = await proxyFetch(request, new URL(`/visits/${encodeURIComponent(id)}/documents/${encodeURIComponent(kind)}`, env.API_URL));
  const response = new NextResponse(upstream.body, { status: upstream.status, headers: {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
    'Cache-Control': 'private, no-store',
    ...(upstream.ok ? { 'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment' } : {}),
  } });
  relayCookies(upstream, response);
  return response;
}
