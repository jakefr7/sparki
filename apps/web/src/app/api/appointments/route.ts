import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../lib/env';

/** Same server-side proxy pattern as /api/patients/search — see that route
 *  for why (private API origin, cookie-forwarding-ready for future auth). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json();

  const upstreamResponse = await fetch(new URL('/appointments', env.API_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const responseBody: unknown = await upstreamResponse.json();
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
