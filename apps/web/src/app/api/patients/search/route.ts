import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';

/**
 * Thin server-side proxy so the browser never needs to know the API's
 * origin (or send it credentials directly) — same-origin fetch from the
 * client, this route does the cross-service call using the private
 * (non-`NEXT_PUBLIC_`) API_URL. Also keeps this ready for the future WorkOS
 * integration, which will need to forward an httpOnly session cookie
 * server-side rather than exposing it to client JS.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get('query')?.trim() ?? '';
  if (!query) {
    return NextResponse.json([]);
  }

  const upstreamUrl = new URL('/patients/search', env.API_URL);
  upstreamUrl.searchParams.set('query', query);
  const limit = request.nextUrl.searchParams.get('limit');
  if (limit) {
    upstreamUrl.searchParams.set('limit', limit);
  }

  const upstreamResponse = await fetch(upstreamUrl, { cache: 'no-store' });
  const body: unknown = await upstreamResponse.json();
  return NextResponse.json(body, { status: upstreamResponse.status });
}
