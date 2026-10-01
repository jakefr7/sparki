import { NextResponse, type NextRequest } from 'next/server';
import { env } from '../../../../../../lib/env';
import { proxyFetch, relayCookies, relayJson } from '../../../../../../lib/api-proxy';
async function relay(request: NextRequest, params: Promise<{ id: string; segments?: string[] }>) {
  const { id, segments = [] } = await params;
  const url = new URL(`/patients/${encodeURIComponent(id)}/prescriptions${segments.length ? '/' + segments.map(encodeURIComponent).join('/') : ''}`, env.API_URL);
  const upstream = await proxyFetch(request, url, request.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await request.text() } : {});
  if (!upstream.ok || !upstream.headers.get('content-type')?.includes('application/pdf')) return relayJson(upstream);
  const response = new NextResponse(upstream.body, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment' } });
  relayCookies(upstream, response); return response;
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; segments?: string[] }> }) { return relay(request, params); }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; segments?: string[] }> }) { return relay(request, params); }
