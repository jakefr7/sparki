'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ClinicApiError, clinicRequest } from '../../../lib/clinic-api';
import type { CheckoutStatus } from '../../../lib/clinic-contracts';
import { SparkiLogo } from '../../../components/sparki-logo';
import s from './pending.module.css';

type PageState = 'checking' | 'pending' | 'activation_required' | 'provisioned' | 'invalid';
type StepStatus = 'done' | 'active' | 'upcoming';
interface Step {
  label: string;
  status: StepStatus;
  /** Continuous "system is working" motion vs. a static "ready" highlight. */
  busy?: boolean;
}

function stepsFor(state: PageState): Step[] {
  const workspaceReady = state === 'activation_required' || state === 'provisioned';
  return [
    { label: 'Payment confirmed', status: 'done' },
    { label: 'Workspace prepared', status: workspaceReady ? 'done' : 'active', busy: !workspaceReady },
    {
      label: state === 'provisioned' ? 'Setup email sent' : 'Send your setup email',
      status: state === 'provisioned' ? 'done' : workspaceReady ? 'active' : 'upcoming',
    },
  ];
}

export default function PendingSetupPage() {
  const sessionId = useSearchParams().get('session_id');
  const [state, setState] = useState<PageState>('checking');
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setState('checking');
    setBusinessName(null);
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
        if (result.status === 'pending') setState('pending');
      } catch (error) {
        if (!active) return;
        if (error instanceof ClinicApiError && error.status === 404) { setState('invalid'); return; }
      }
      if (active) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [sessionId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  async function resendActivation() {
    if (!sessionId || sending) return;
    setSending(true);
    setSendError(null);
    setJustSent(false);
    try {
      await clinicRequest(`/billing/checkout-sessions/${encodeURIComponent(sessionId)}/resend-activation`, { method: 'POST' });
      setState('provisioned');
      setJustSent(true);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setJustSent(false), 5000);
    } catch (error) {
      setSendError(error instanceof ClinicApiError && error.status === 429
        ? 'A setup link was just sent. Please wait a minute before trying again.'
        : 'We couldn’t send your setup link. Please try again or contact Sparki support.');
    } finally {
      setSending(false);
    }
  }

  const steps = state === 'invalid' ? null : stepsFor(state);
  const workspaceReady = state === 'activation_required' || state === 'provisioned';

  return <div className={s.page}>
    <header className={s.header}>
      <Link href="/" className={s.brand} aria-label="Sparki home"><SparkiLogo kind="mark" /><SparkiLogo kind="wordmark" /></Link>
      <Link href="/pricing" className={s.headerLink}>Back to pricing <span aria-hidden="true">↗</span></Link>
    </header>

    <main className={s.main}>
      {state === 'checking' ? <div className={s.checking} role="status">Checking your workspace…</div> : <div className={`${s.content} ${workspaceReady ? s.successReady : ''}`}>
        {workspaceReady && <div className={s.successMoment} aria-hidden="true">
          <span className={s.successHalo} />
          <svg className={s.successMark} viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="36" fill="#e3f4ef" />
            <circle className={s.successRing} cx="40" cy="40" r="35" stroke="#176f69" strokeWidth="2" pathLength="1" />
            <path className={s.successCheck} d="m25 40 10 10 21-22" stroke="#176f69" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
          </svg>
          <span className={s.successSparkle}>✦</span><span className={s.successSparkle}>✦</span>
        </div>}
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

        {steps ? (
          <section className={s.card} aria-label="Clinic setup status">
            <ol className={s.rail} aria-label="Setup progress">
              {steps.map((step) => (
                <li key={step.label} className={s.step} data-status={step.status}>
                  <span className={`${s.stepDot} ${step.busy ? s.busy : ''}`} aria-hidden="true">
                    {step.status === 'done' ? <CheckGlyph /> : step.status === 'active' ? <SparkleGlyph /> : null}
                  </span>
                  <span className={s.stepLabel}>{step.label}</span>
                </li>
              ))}
            </ol>

            <div className={s.panel} aria-live="polite">
              <p className={s.panelLabel}>{state === 'provisioned' ? 'Next step' : state === 'activation_required' ? 'Account setup' : 'In progress'}</p>
              <h2>{state === 'provisioned' ? 'Check your email' : state === 'activation_required' ? 'Send your setup link' : `Setting up ${businessName || 'your clinic'}`}</h2>
              <p>{state === 'provisioned'
                ? 'Open the secure link in your inbox to get started. If it hasn’t arrived, you can send a new one.'
                : state === 'activation_required'
                  ? 'We haven’t sent your activation email yet. Send it to the address you used at checkout.'
                  : 'We’ll keep checking here. You can close this page — we’ll email your activation link when your workspace is ready.'}</p>

              {state === 'provisioned' || state === 'activation_required' ? (
                <button type="button" className={s.action} disabled={sending} onClick={() => void resendActivation()}>
                  {sending ? 'Sending…' : state === 'provisioned' ? 'Send a new link' : 'Send setup link'} <span aria-hidden="true">↗</span>
                </button>
              ) : null}
              {sendError && <p className={s.error} role="alert">{sendError}</p>}
            </div>
          </section>
        ) : (
          <section className={s.cardInvalid} aria-label="Clinic setup status">
            <p className={s.panelLabel}>Setup link</p>
            <h2>Link unavailable</h2>
            <p>If you need a hand, contact Sparki support.</p>
            <Link href="/pricing" className={s.action}>Back to pricing <span aria-hidden="true">↗</span></Link>
          </section>
        )}

        <p className={s.reassurance}>A calmer clinic day starts here.</p>
      </div>}
    </main>

    <footer className={s.footer}><span>Built for the people who care.</span><span>© {new Date().getFullYear()} Sparki</span></footer>

    {justSent && (
      <div className={s.toast} role="status">
        <span className={s.toastIcon} aria-hidden="true"><CheckGlyph /></span>
        Setup link sent — check your inbox.
        <button type="button" className={s.toastClose} aria-label="Dismiss" onClick={() => setJustSent(false)}>×</button>
      </div>
    )}
  </div>;
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden="true">
      <path d="M3 8.5 6.2 11.5 13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M12 2 14.1 9.9 22 12 14.1 14.1 12 22 9.9 14.1 2 12 9.9 9.9Z" />
    </svg>
  );
}
