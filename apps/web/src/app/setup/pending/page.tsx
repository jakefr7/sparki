'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClinicApiError, clinicRequest } from '../../../lib/clinic-api';
import type { CheckoutStatus } from '../../../lib/clinic-contracts';
import { SparkiLogo } from '../../../components/sparki-logo';
import s from './pending.module.css';

export default function PendingSetupPage() {
  const sessionId = useSearchParams().get('session_id');
  const [state, setState] = useState<'pending' | 'activation_required' | 'provisioned' | 'invalid'>('pending');
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) { setState('invalid'); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await clinicRequest<CheckoutStatus>(`/billing/checkout-sessions/${encodeURIComponent(sessionId)}/status`);
        if (!active) return;
        setBusinessName(result.businessName ?? null);
        if (result.status === 'provisioned') { setState('provisioned'); return; }
        if (result.status === 'activation_required') setState('activation_required');
      } catch (error) {
        if (!active) return;
        if (error instanceof ClinicApiError && error.status === 404) { setState('invalid'); return; }
      }
      if (active) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [sessionId]);

  async function resendActivation() {
    if (!sessionId || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await clinicRequest(`/billing/checkout-sessions/${encodeURIComponent(sessionId)}/resend-activation`, { method: 'POST' });
      setState('provisioned');
    } catch (error) {
      setSendError(error instanceof ClinicApiError && error.status === 429
        ? 'A setup link was just sent. Please wait a minute before trying again.'
        : 'We couldn’t send your setup link. Please try again or contact Sparki support.');
    } finally {
      setSending(false);
    }
  }

  return <div className={s.page}>
    <header className={s.header}>
      <Link href="/" className={s.brand} aria-label="Sparki home"><SparkiLogo /></Link>
      <Link href="/pricing" className={s.headerLink}>Back to pricing <span aria-hidden="true">↗</span></Link>
    </header>

    <main className={s.main}>
      <div className={s.content}>
        <div className={s.intro}>
          <p className={s.eyebrow}>Your Sparki clinic</p>
          {state === 'provisioned' || state === 'activation_required' ? <>
            <h1><span>{businessName || 'Your clinic'}</span> is ready.</h1>
            <p>{state === 'provisioned' ? 'Your setup link is on its way. Open it to create your account and finish setting up.' : 'Your workspace is prepared. Send yourself a secure link to create your account.'}</p>
          </> : state === 'invalid' ? <>
            <h1>Let’s find your <span>way back.</span></h1>
            <p>We couldn’t find this setup link. Check the address, or return to Sparki and try again.</p>
          </> : <>
            <h1>Making room for <span>{businessName || 'your clinic'}.</span></h1>
            <p>We’re confirming your subscription and preparing your Sparki workspace.</p>
          </>}
        </div>

        <section className={s.card} aria-live="polite" aria-label="Clinic setup status">
          <div className={`${s.statusIcon} ${state === 'pending' ? s.statusIconPending : ''}`} aria-hidden="true">
            {state === 'pending' ? <span className={s.spinner} /> : state === 'provisioned' ? '✓' : '↗'}
          </div>
          <div className={s.cardBody}>
            <p className={s.cardLabel}>{state === 'provisioned' ? 'Next step' : state === 'activation_required' ? 'Account setup' : state === 'invalid' ? 'Setup link' : 'In progress'}</p>
            <h2>{state === 'provisioned' ? 'Check your email' : state === 'activation_required' ? 'Send your setup link' : state === 'invalid' ? 'Link unavailable' : `Setting up ${businessName || 'your clinic'}`}</h2>
            <p>{state === 'provisioned'
              ? 'Open the secure link in your inbox to get started. If it hasn’t arrived, you can send a new one.'
              : state === 'activation_required'
                ? 'We haven’t sent your activation email yet. Send it to the address you used at checkout.'
              : state === 'invalid'
                ? 'If you need a hand, contact Sparki support.'
                : 'We’ll keep checking here. You can close this page; we’ll email your activation link when your workspace is ready.'}</p>
            {state === 'provisioned' || state === 'activation_required'
              ? <button type="button" className={s.action} disabled={sending} onClick={() => void resendActivation()}>{sending ? 'Sending…' : state === 'provisioned' ? 'Send a new link' : 'Send setup link'} <span aria-hidden="true">↗</span></button>
              : state === 'invalid' ? <Link href="/pricing" className={s.action}>Back to pricing <span aria-hidden="true">↗</span></Link> : null}
            {sendError && <p className={s.error} role="alert">{sendError}</p>}
          </div>
        </section>
        <p className={s.reassurance}>A calmer clinic day starts here.</p>
      </div>
    </main>

    <footer className={s.footer}><span>Built for the people who care.</span><span>© {new Date().getFullYear()} Sparki</span></footer>
  </div>;
}
