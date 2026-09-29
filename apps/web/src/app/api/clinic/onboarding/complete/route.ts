import type { NextRequest } from 'next/server';
import { clinicProxy } from '../../../../../lib/clinic-proxy';

export async function POST(request: NextRequest) {
  return clinicProxy(request, '/clinic/onboarding/complete');
}
