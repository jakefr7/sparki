import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const body: unknown = await request.json();

  const upstreamResponse = await fetch(new URL(`/visits/${id}/exam-findings`, env.API_URL), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const responseBody: unknown = await upstreamResponse.json();
  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
