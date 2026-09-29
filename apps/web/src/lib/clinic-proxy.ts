import type { NextRequest } from 'next/server';
import { env } from './env';
import { proxyFetch, relayJson } from './api-proxy';

/** Thin BFF forwarding. No clinic or billing rules live here. */
export async function clinicProxy(request: NextRequest, path: string) {
  const upstream = new URL(path, env.API_URL);
  upstream.search = request.nextUrl.search;
  const body = request.method === 'POST' || request.method === 'PATCH' ? await request.text() : undefined;
  const response = await proxyFetch(request, upstream, { method: request.method, ...(body !== undefined ? { body, headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' } } : {}) });
  return relayJson(response);
}
