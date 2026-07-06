import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';

/** Same server-side proxy pattern as /api/patients/search — see that route
 *  for why (private API origin, cookie-forwarding-ready for future auth). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get('query')?.trim() ?? '';
  if (!query) {
    return NextResponse.json([]);
  }

  const upstreamUrl = new URL('/clients/search', env.API_URL);
  upstreamUrl.searchParams.set('query', query);
  const limit = request.nextUrl.searchParams.get('limit');
  if (limit) {
    upstreamUrl.searchParams.set('limit', limit);
  }

  const upstreamResponse = await fetch(upstreamUrl, { cache: 'no-store' });
  const body: unknown = await upstreamResponse.json();
  return NextResponse.json(body, { status: upstreamResponse.status });
}
