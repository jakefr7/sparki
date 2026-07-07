import { type NextRequest } from 'next/server';
import { env } from '../../../lib/env';
import { proxyFetch, relayJson } from '../../../lib/api-proxy';

/** Server-side proxy for Visit creation. Keeps client components on same-origin
 * fetches and follows the existing appointment/patient proxy pattern. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  const upstreamResponse = await proxyFetch(request, new URL('/visits', env.API_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return relayJson(upstreamResponse);
}
