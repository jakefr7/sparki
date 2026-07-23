import { type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';
import { env } from '../../../../lib/env';
async function relay(request: NextRequest, context: { params: Promise<{ path: string[] }> }, method: string) { const { path } = await context.params; const target = new URL(`/inventory/${path.join('/')}`, env.API_URL); target.search = request.nextUrl.search; const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method); return relayJson(await proxyFetch(request, target, { method, ...(hasBody ? { headers: { 'Content-Type': 'application/json' }, body: await request.text() } : {}) })); }
export function GET(r: NextRequest, c: { params: Promise<{ path: string[] }> }) { return relay(r, c, 'GET'); }
export function POST(r: NextRequest, c: { params: Promise<{ path: string[] }> }) { return relay(r, c, 'POST'); }
export function PATCH(r: NextRequest, c: { params: Promise<{ path: string[] }> }) { return relay(r, c, 'PATCH'); }
export function DELETE(r: NextRequest, c: { params: Promise<{ path: string[] }> }) { return relay(r, c, 'DELETE'); }
