import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

/** Same server-side proxy pattern as /api/appointments — forwards the
 *  scheduler's "New Patient" combined payload to the transactional
 *  POST /appointments/new-patient endpoint. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();

  const upstreamResponse = await proxyFetch(
    request,
    new URL('/appointments/new-patient', env.API_URL),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  return relayJson(upstreamResponse);
}
