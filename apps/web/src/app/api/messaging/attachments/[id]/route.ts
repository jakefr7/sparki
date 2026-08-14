import { type NextRequest, NextResponse } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayCookies } from '../../../../../lib/api-proxy';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const upstream = await proxyFetch(request, new URL(`/messaging/attachments/${encodeURIComponent(id)}`, env.API_URL));
  const response = new NextResponse(upstream.body, { status: upstream.status });
  for (const header of ['content-type', 'content-length', 'content-disposition', 'cache-control']) {
    const value = upstream.headers.get(header); if (value) response.headers.set(header, value);
  }
  relayCookies(upstream, response);
  return response;
}
