import { type NextRequest } from 'next/server';
import { env } from '../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../lib/api-proxy';

/** Same server-side proxy pattern as /api/staff — see that route for why. */
export async function GET(request: NextRequest) {
  const upstreamResponse = await proxyFetch(request, new URL('/operations/dashboard', env.API_URL));
  return relayJson(upstreamResponse);
}
