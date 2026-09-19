import { type NextRequest } from 'next/server';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';
import { env } from '../../../../../lib/env';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return relayJson(await proxyFetch(request, new URL(`/patients/${id}/invoices`, env.API_URL)));
}
