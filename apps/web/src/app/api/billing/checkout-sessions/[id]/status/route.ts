import type { NextRequest } from 'next/server';
import { clinicProxy } from '../../../../../../lib/clinic-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return clinicProxy(request, `/billing/checkout-sessions/${encodeURIComponent(id)}/status`);
}
