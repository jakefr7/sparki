'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { clinicRequest } from '../../lib/clinic-api';
import '../clinic-access.css';

export default function PricingPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function checkout(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const result = await clinicRequest<{ checkoutUrl: string }>('/billing/checkout-sessions', { method: 'POST', body: JSON.stringify({ email: email.trim(), plan: 'STANDARD' }) });
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== 'https:') throw new Error('Unexpected checkout URL');
      window.location.assign(checkoutUrl.href);
    } catch { setError('We couldn’t start checkout. Please try again or contact Sparki support.'); setBusy(false); }
  }
  return <main className="clinic-access"><section className="clinic-access__panel"><Link href="/" className="clinic-access__brand">Sparki</Link><p className="eyebrow">Veterinary practice software</p><h1>Sparki for your clinic</h1>
    <p>Enter the email address for your clinic’s owner to continue to secure checkout.</p><form className="clinic-form" onSubmit={(event) => void checkout(event)}><label>Owner email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button-primary" disabled={busy}>{busy ? 'Opening checkout…' : 'Continue to checkout'}</button></form>
  </section></main>;
}
