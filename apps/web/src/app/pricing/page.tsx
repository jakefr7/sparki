'use client';

import Link from 'next/link';
import { useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ClinicApiError, clinicRequest } from '../../lib/clinic-api';
import { SparkiLogo } from '../../components/sparki-logo';
import s from './pricing.module.css';

const features = [
  'Client & patient management',
  'Scheduling and appointments',
  'Intake and exams',
  'Checkout and invoicing',
  'Inventory management',
  'Team accounts',
];

function formatBusinessPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';
  if (digits.length < 4) return `(${digits}${digits.length === 3 ? ')' : ''}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function caretAfterDigits(value: string, digitCount: number): number {
  if (digitCount === 0) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index++) {
    if (/\d/.test(value[index]!)) seen++;
    if (seen === digitCount) return index + 1;
  }
  return value.length;
}

export default function PricingPage() {
  const [step, setStep] = useState<'plan' | 'checkout'>('plan');
  const [form, setForm] = useState({ ownerFirstName: '', ownerLastName: '', email: '', businessName: '', businessPhone: '', businessEmail: '', teamSize: '', addressLine1: '', city: '', state: '', postalCode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function updateBusinessPhone(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const digitsBeforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
    const formatted = formatBusinessPhone(input.value);
    setForm((current) => ({ ...current, businessPhone: formatted }));
    requestAnimationFrame(() => input.setSelectionRange(caretAfterDigits(formatted, digitsBeforeCaret), caretAfterDigits(formatted, digitsBeforeCaret)));
  }

  function handleBusinessPhoneKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const caret = input.selectionStart ?? 0;
    if (event.key !== 'Backspace' || caret !== input.selectionEnd || caret === 0 || /\d/.test(input.value[caret - 1]!)) return;
    event.preventDefault();
    const digitIndex = input.value.slice(0, caret).replace(/\D/g, '').length - 1;
    if (digitIndex < 0) return;
    const digits = input.value.replace(/\D/g, '');
    const formatted = formatBusinessPhone(digits.slice(0, digitIndex) + digits.slice(digitIndex + 1));
    setForm((current) => ({ ...current, businessPhone: formatted }));
    requestAnimationFrame(() => input.setSelectionRange(caretAfterDigits(formatted, digitIndex), caretAfterDigits(formatted, digitIndex)));
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await clinicRequest<{ checkoutUrl: string }>('/billing/checkout-sessions', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(Object.entries({ ...form, plan: 'STANDARD' }).map(([key, value]) => [key, value.trim()]))),
      });
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== 'https:') throw new Error('Unexpected checkout URL');
      window.location.assign(checkoutUrl.href);
    } catch (cause) {
      setError(cause instanceof ClinicApiError && cause.code === 'BILLING_NOT_CONFIGURED'
        ? 'Checkout is temporarily unavailable. Please contact Sparki support.'
        : cause instanceof ClinicApiError && cause.code === 'EMAIL_UNAVAILABLE'
          ? 'Account setup email is temporarily unavailable. Please try again shortly.'
          : 'We couldn’t start checkout. Please try again or contact Sparki support.');
      setBusy(false);
    }
  }

  return <div className={s.page}>
    <a className={s.skip} href="#main">Skip to content</a>
    <header className={s.header}>
      <Link href="/" className={s.brand} aria-label="Sparki home"><SparkiLogo /></Link>
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
          <button type="button" className={s.button} onClick={() => setStep('checkout')}>Start free <span aria-hidden="true">↗</span></button>
          <ul className={s.features}>{features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        </section>
        <p className={s.note}>We’re keeping Sparki free while we work closely with our first clinics.</p>
      </> : <>
        <div className={s.checkoutHeading}>
          <button type="button" className={s.back} onClick={() => { setStep('plan'); setError(null); }}>← Back to pricing</button>
          <p className={s.eyebrow}>Your next step</p>
          <h1>Let’s get to know<br /><span>your practice.</span></h1>
          <p>A few details now, so your Sparki workspace feels like yours from the start.</p>
        </div>
        <section className={s.checkoutCard} aria-label="Checkout details">
          <div className={s.summary}><p className={s.eyebrow}>Your plan</p><div><strong>Sparki</strong><strong>$0 today</strong></div><span>Free during early access</span></div>
          <form onSubmit={(event) => void checkout(event)}>
            <div className={s.formSection}>
              <p className={s.sectionTitle}>About you</p>
              <div className={s.fieldPair}>
                <label>First name<input autoComplete="given-name" required maxLength={100} value={form.ownerFirstName} onChange={(event) => setForm({ ...form, ownerFirstName: event.target.value })} /></label>
                <label>Last name<input autoComplete="family-name" required maxLength={100} value={form.ownerLastName} onChange={(event) => setForm({ ...form, ownerLastName: event.target.value })} /></label>
              </div>
              <label>Your email<input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <p className={s.help}>Use an email only you can access. A personal email is fine if you don’t have your own work email. We’ll send your account setup link here.</p>
            </div>
            <div className={s.formSection}>
              <p className={s.sectionTitle}>Your practice</p>
              <label>Business name<input autoComplete="organization" required maxLength={200} value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
              <p className={s.help}>Only your business name is needed now. You can add the rest here or during setup.</p>
              <div className={s.fieldPair}>
                <label>Business phone<input type="tel" inputMode="tel" autoComplete="organization-tel" placeholder="(555) 123-4567" value={form.businessPhone} onChange={updateBusinessPhone} onKeyDown={handleBusinessPhoneKeyDown} /></label>
                <label>Team size<select value={form.teamSize} onChange={(event) => setForm({ ...form, teamSize: event.target.value })}><option value="">Select team size</option><option value="1">Just me</option><option value="2-5">2–5 people</option><option value="6-10">6–10 people</option><option value="11-25">11–25 people</option><option value="26+">26+ people</option></select></label>
              </div>
              <label>Practice contact email<input type="email" autoComplete="organization-email" value={form.businessEmail} onChange={(event) => setForm({ ...form, businessEmail: event.target.value })} /></label>
              <p className={s.help}>For a shared hospital inbox, if you have one. Team members use their own email addresses to sign in.</p>
              <p className={s.optionalTitle}>Practice address</p>
              <label>Street address<input autoComplete="street-address" maxLength={200} value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })} /></label>
              <div className={s.addressGrid}>
                <label>City<input autoComplete="address-level2" maxLength={100} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
                <label>State<input autoComplete="address-level1" maxLength={100} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></label>
                <label>ZIP code<input autoComplete="postal-code" maxLength={20} value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} /></label>
              </div>
            </div>
            {error && <p className={s.error} role="alert">{error}</p>}
            <button className={s.button} disabled={busy}>{busy ? 'Opening checkout…' : 'Continue to secure checkout'} <span aria-hidden="true">↗</span></button>
          </form>
        </section>
      </>}
    </main>
    <footer className={s.footer}><Link href="/" className={s.brand} aria-label="Sparki home"><SparkiLogo /></Link><span>Built for the people who care.</span><div><Link href="/#product">Product</Link><Link href="/pricing">Pricing</Link><Link href="/login">Sign In</Link><span>© {new Date().getFullYear()} Sparki</span></div></footer>
  </div>;
}
