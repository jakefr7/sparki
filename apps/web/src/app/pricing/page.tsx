'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { clinicRequest } from '../../lib/clinic-api';
import s from './pricing.module.css';

const features = [
  'Client & patient management',
  'Scheduling and appointments',
  'Intake and exams',
  'Checkout and invoicing',
  'Inventory management',
  'Team accounts',
];

export default function PricingPage() {
  const [step, setStep] = useState<'plan' | 'checkout'>('plan');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await clinicRequest<{ checkoutUrl: string }>('/billing/checkout-sessions', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), plan: 'STANDARD' }),
      });
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== 'https:') throw new Error('Unexpected checkout URL');
      window.location.assign(checkoutUrl.href);
    } catch {
      setError('We couldn’t start checkout. Please try again or contact Sparki support.');
      setBusy(false);
    }
  }

  return <div className={s.page}>
    <a className={s.skip} href="#main">Skip to content</a>
    <header className={s.header}>
      <Link href="/" className={s.brand} aria-label="Sparki home"><span className={s.brandMark}>S</span>sparki</Link>
      <nav className={`${s.nav} ${menuOpen ? s.navOpen : ''}`} aria-label="Main navigation">
        <Link href="/#product" onClick={() => setMenuOpen(false)}>Product</Link>
        <Link href="/#solutions" onClick={() => setMenuOpen(false)}>Solutions</Link>
        <Link href="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link>
      </nav>
      <div className={s.headerActions}>
        <Link href="/login" className={s.signIn}>Sign In</Link>
        <button type="button" className={s.menuToggle} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '×' : '☰'}</button>
      </div>
    </header>

    <main id="main" className={s.main}>
      {step === 'plan' ? <>
        <div className={s.intro}>
          <p className={s.eyebrow}>Sparki pricing</p>
          <h1>Simple pricing for<br /><span>veterinary teams.</span></h1>
          <p>Everything a clinic needs to run Sparki in one place.</p>
        </div>
        <section className={s.plan} aria-label="Sparki plan">
          <div className={s.planTop}>
            <div><p className={s.eyebrow}>One connected workspace</p><h2>Sparki</h2></div>
            <p className={s.price}><strong>$0</strong><span>/month</span></p>
          </div>
          <p className={s.early}>Free during early access</p>
          <p className={s.planDescription}>The essentials for your clinic’s daily work, together.</p>
          <ul className={s.features}>{features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
          <button type="button" className={s.button} onClick={() => setStep('checkout')}>Start free <span aria-hidden="true">↗</span></button>
        </section>
        <p className={s.note}>We’re keeping Sparki free while we work closely with our first clinics.</p>
      </> : <>
        <div className={s.checkoutHeading}>
          <button type="button" className={s.back} onClick={() => { setStep('plan'); setError(null); }}>← Back to pricing</button>
          <p className={s.eyebrow}>Your next step</p>
          <h1>Start your<br /><span>Sparki clinic.</span></h1>
          <p>One step closer to a more connected clinic day.</p>
        </div>
        <section className={s.checkoutCard} aria-label="Checkout details">
          <div className={s.summary}><p className={s.eyebrow}>Your plan</p><div><strong>Sparki</strong><strong>$0 today</strong></div><span>Free during early access</span></div>
          <form onSubmit={(event) => void checkout(event)}>
            <label htmlFor="owner-email">Owner email</label>
            <p className={s.help}>This email will become the clinic owner’s Sparki account.</p>
            <input id="owner-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            {error && <p className={s.error} role="alert">{error}</p>}
            <button className={s.button} disabled={busy}>{busy ? 'Opening checkout…' : 'Continue to secure checkout'} <span aria-hidden="true">↗</span></button>
          </form>
        </section>
      </>}
    </main>
    <footer className={s.footer}><Link href="/" className={s.brand}><span className={s.brandMark}>S</span>sparki</Link><span>Built for the people who care.</span><div><Link href="/#product">Product</Link><Link href="/pricing">Pricing</Link><Link href="/login">Sign In</Link><span>© {new Date().getFullYear()} Sparki</span></div></footer>
  </div>;
}
