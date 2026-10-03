import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayCookies } from '../../../../../lib/api-proxy';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const upstream = await proxyFetch(
    request,
    new URL(`/client-communication/attachments/${encodeURIComponent(id)}`, env.API_URL),
  );
  const response = new NextResponse(upstream.body, { status: upstream.status });
  for (const header of [
    'content-type',
    'content-length',
    'content-disposition',
    'cache-control',
    'content-security-policy',
    'x-content-type-options',
  ]) {
    const value = upstream.headers.get(header);
    if (value) response.headers.set(header, value);
  }
  response.headers.set('Cache-Control', 'private, no-store');
  relayCookies(upstream, response);
  return response;
}
