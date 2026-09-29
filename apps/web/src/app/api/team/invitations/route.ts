import type { NextRequest } from 'next/server';
import { clinicProxy } from '../../../../lib/clinic-proxy';

export async function GET(request: NextRequest) {
  return clinicProxy(request, '/team/invitations');
}

export async function POST(request: NextRequest) {
  return clinicProxy(request, '/team/invitations');
}
