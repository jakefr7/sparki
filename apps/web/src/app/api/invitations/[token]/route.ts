import type { NextRequest } from 'next/server';
import { clinicProxy } from '../../../../lib/clinic-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return clinicProxy(request, `/invitations/${encodeURIComponent(token)}`);
}
