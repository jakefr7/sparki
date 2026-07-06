import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../lib/env';

/** Same server-side proxy pattern as /api/patients/search — see that route
 *  for why (private API origin, cookie-forwarding-ready for future auth). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const upstreamUrl = new URL('/staff', env.API_URL);
  upstreamUrl.search = request.nextUrl.search;

  const upstreamResponse = await fetch(upstreamUrl);
  const responseBody: unknown = await upstreamResponse.json();
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
