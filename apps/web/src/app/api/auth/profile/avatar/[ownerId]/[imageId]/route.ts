import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../../../../lib/env';
import { proxyFetch, relayCookies } from '../../../../../../../lib/api-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ ownerId: string; imageId: string }> }) {
  const { ownerId, imageId } = await params;
  const upstream = await proxyFetch(request, new URL(`/auth/profile/avatar/${encodeURIComponent(ownerId)}/${encodeURIComponent(imageId)}`, env.API_URL));
  const response = new NextResponse(upstream.body, { status: upstream.status, headers: {
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
  relayCookies(upstream, response);
  return response;
}
