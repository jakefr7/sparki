import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../lib/env';

/** Server-side proxy for Visit creation. Keeps client components on same-origin
 * fetches and follows the existing appointment/patient proxy pattern. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json();

  const upstreamResponse = await fetch(new URL('/visits', env.API_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const responseBody: unknown = await upstreamResponse.json();
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
