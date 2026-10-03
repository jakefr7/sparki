import { NextResponse, type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';
import { env } from '../../../../lib/env';

type Context = { params: Promise<{ path: string[] }> };
async function relay(request: NextRequest, context: Context, method: string) {
  const { path } = await context.params;
  if (path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment)) || path[0] === 'webhooks')
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const target = new URL(
    `/client-communication/${path.map(encodeURIComponent).join('/')}`,
    env.API_URL,
  );
  target.search = request.nextUrl.search;
  const response = await proxyFetch(request, target, {
    method,
    ...(method !== 'GET'
      ? { headers: { 'Content-Type': 'application/json' }, body: await request.text() }
      : {}),
  });
  return relayJson(response);
}
export function GET(request: NextRequest, context: Context) {
  return relay(request, context, 'GET');
}
export function POST(request: NextRequest, context: Context) {
  return relay(request, context, 'POST');
}
export function PATCH(request: NextRequest, context: Context) {
  return relay(request, context, 'PATCH');
}
export function PUT(request: NextRequest, context: Context) {
  return relay(request, context, 'PUT');
}
