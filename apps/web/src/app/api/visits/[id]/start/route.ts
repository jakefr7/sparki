import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const upstreamResponse = await fetch(new URL(`/visits/${id}/start`, env.API_URL), {
    method: 'POST',
  });

  const responseBody: unknown = await upstreamResponse.json();
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
