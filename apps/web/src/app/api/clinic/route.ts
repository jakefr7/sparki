import type { NextRequest } from 'next/server';
import { clinicProxy } from '../../../lib/clinic-proxy';

export async function GET(request: NextRequest) {
  return clinicProxy(request, '/clinic');
}

export async function PATCH(request: NextRequest) {
  return clinicProxy(request, '/clinic');
}
