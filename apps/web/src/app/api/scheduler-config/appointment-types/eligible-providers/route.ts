import { type NextRequest } from 'next/server';
import { env } from '../../../../../lib/env';
import { proxyFetch, relayJson } from '../../../../../lib/api-proxy';

export async function GET(request: NextRequest) {
  return relayJson(
    await proxyFetch(request, new URL('/scheduler-config/appointment-types/eligible-providers', env.API_URL)),
  );
}
