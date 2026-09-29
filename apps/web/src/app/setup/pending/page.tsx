'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClinicApiError, clinicRequest } from '../../../lib/clinic-api';
import type { CheckoutStatus } from '../../../lib/clinic-contracts';
import '../../clinic-access.css';

export default function PendingSetupPage() {
  const sessionId = useSearchParams().get('session_id');
  const [state, setState] = useState<'pending' | 'provisioned' | 'invalid'>('pending');
  const [slow, setSlow] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!sessionId) { setState('invalid'); return; }
    let active = true;
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await clinicRequest<CheckoutStatus>(`/billing/checkout-sessions/${encodeURIComponent(sessionId)}/status`);
        if (!active) return;
        if (result.status === 'provisioned') { setState('provisioned'); return; }
      } catch (error) {
        if (!active) return;
        if (error instanceof ClinicApiError && error.status === 404) { setState('invalid'); return; }
      }
      if (Date.now() - start >= 60_000) setSlow(true);
      if (active) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [sessionId, retry]);
  return <main className="clinic-access"><section className="clinic-access__panel"><Link href="/" className="clinic-access__brand">Sparki</Link>
    {state === 'provisioned' ? <><h1>Your clinic is ready</h1><p>We’ve sent an activation email. Open it to create your account and finish setting up your clinic.</p><Link href="/login" className="button-secondary">Already have an account? Sign in</Link></> : state === 'invalid' ? <><h1>We couldn’t find this setup link</h1><p>Check the link and try again, or contact Sparki support.</p><Link href="/" className="button-secondary">Sparki home</Link></> : <><div className="clinic-access__spinner" aria-hidden="true"/><h1>Setting up your clinic</h1><p>We’re confirming your subscription and preparing your Sparki workspace.</p>{slow && <p role="status">This is taking a little longer than expected. Your payment may still be processing. Check your email or refresh this page.</p>}<button type="button" className="button-secondary" onClick={() => { setSlow(false); setRetry((value) => value + 1); }}>Check again</button></>}
  </section></main>;
}
