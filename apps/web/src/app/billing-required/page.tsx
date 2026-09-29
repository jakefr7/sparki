'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clinicRequest } from '../../lib/clinic-api';
import { SparkiLogo } from '../../components/sparki-logo';
import type { BillingStatus } from '../../lib/clinic-contracts';
import '../clinic-access.css';

const copy = {
  PENDING: ['We’re confirming your Sparki subscription.', 'Your clinic may still be processing. Please check your email and try again shortly.'],
  CANCELED: ['Your Sparki subscription has ended.', 'Your clinic data remains in Sparki. Contact support to discuss access.'],
  SUSPENDED: ['Your Sparki account is currently suspended.', 'Please contact Sparki support for help.'],
};
export default function BillingRequiredPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { clinicRequest<BillingStatus>('/clinic/billing').then(setBilling).catch(() => setError(true)); }, []);
  useEffect(() => { if (billing && !billing.isRestricted) window.location.assign('/today'); }, [billing]);
  const message = billing?.subscriptionStatus && billing.subscriptionStatus in copy ? copy[billing.subscriptionStatus as keyof typeof copy] : null;
  return <main className="clinic-access"><section className="clinic-access__panel"><Link href="/" className="clinic-access__brand" aria-label="Sparki home"><SparkiLogo /></Link>
    {error ? <><h1>We couldn’t check your clinic’s status</h1><p>Try refreshing this page.</p><button className="button-secondary" onClick={() => window.location.reload()}>Try again</button></> : !billing ? <p role="status">Checking your clinic…</p> : message ? <><h1>{message[0]}</h1><p>{message[1]}</p><button className="button-secondary" onClick={() => window.location.reload()}>Check again</button></> : <p role="status">Opening Sparki…</p>}
  </section></main>;
}
