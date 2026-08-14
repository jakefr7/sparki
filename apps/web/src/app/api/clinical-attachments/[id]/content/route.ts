import { type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch } from '../../../../../lib/api-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upstream = await proxyFetch(request, new URL(`/clinical-attachments/${encodeURIComponent(id)}/content`, env.API_URL));
  return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream', 'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment' } });
}
