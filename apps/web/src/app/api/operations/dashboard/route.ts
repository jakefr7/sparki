import { NextResponse } from 'next/server';
import { env } from '../../../../lib/env';

/** Same server-side proxy pattern as /api/staff — see that route for why. */
export async function GET(): Promise<NextResponse> {
  const upstreamResponse = await fetch(new URL('/operations/dashboard', env.API_URL), {
    cache: 'no-store',
  });
  const responseBody: unknown = await upstreamResponse.json();
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
