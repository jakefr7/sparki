import { type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';
import { env } from '../../../../lib/env';

async function relay(request: NextRequest, context: { params: Promise<{ path: string[] }> }, method: string) {
  const { path } = await context.params;
  const target = new URL(`/messaging/${path.join('/')}`, env.API_URL);
  target.search = request.nextUrl.search;
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method);
  const response = await proxyFetch(request, target, {
    method,
    ...(hasBody ? { headers: { 'Content-Type': request.headers.get('content-type') ?? 'application/json' }, body: await request.text() } : {}),
  });
  return relayJson(response);
}

export function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { return relay(request, context, 'GET'); }
export function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { return relay(request, context, 'POST'); }
export function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { return relay(request, context, 'PATCH'); }
export function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) { return relay(request, context, 'DELETE'); }
