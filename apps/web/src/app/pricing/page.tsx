'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ClinicApiError, clinicRequest } from '../../lib/clinic-api';
import { PublicHeader } from '../../components/landing/public-header';
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
  const [signupStep, setSignupStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const signupIntro = useRef<HTMLDivElement>(null);
  const [showCompactHeading, setShowCompactHeading] = useState(false);
  const signupSteps = ['About you', 'Your practice', 'Address'];

  useEffect(() => {
    if (step !== 'checkout') return;
    const update = () => {
      const intro = signupIntro.current;
      setShowCompactHeading(Boolean(intro && intro.getBoundingClientRect().bottom <= (window.innerWidth <= 700 ? 68 : 82)));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [step]);

  useEffect(() => {
    if (step !== 'checkout') return;
    stepHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [step, signupStep]);

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
    if (signupStep < 2) {
      setSignupStep(signupStep + 1);
      setError(null);
      return;
    }
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
    <PublicHeader onGetStarted={() => { setStep('checkout'); window.scrollTo({ top: 0, behavior: 'instant' }); }} />

    {step === 'checkout' && showCompactHeading && <div className={s.compactHeading}>
      <button type="button" onClick={() => { setStep('plan'); setError(null); }}>← Back to pricing</button>
      <span>Make room for your practice.</span>
      <span className={s.compactStep}>Step {signupStep + 1} of 3</span>
    </div>}

    <main id="main" className={`${s.main} ${step === 'checkout' ? s.signupMain : ''}`}>
      {step === 'plan' ? <div className={s.pricingLayout}>
        <div className={s.intro}>
          <p className={s.eyebrow}>Sparki pricing</p>
          <h1>A calmer clinic day.<br /><span>One simple plan.</span></h1>
          <p>Your patients, your team, and the work between them. Together in Sparki.</p>
          <p className={s.introNote}>Built with our first clinics.<br />Free during early access.</p>
        </div>
        <section className={s.plan} aria-label="Sparki plan">
          <div className={s.planTop}>
            <h2>Sparki</h2>
            <span className={s.earlyBadge}>Early access</span>
          </div>
          <p className={s.price}><strong>$0</strong><span>/month</span></p>
          <p className={s.planDescription}>One connected workspace for your practice.</p>
          <button type="button" className={s.button} onClick={() => setStep('checkout')}>Start free <span aria-hidden="true">↗</span></button>
          <p className={s.includedLabel}>Included in your workspace</p>
          <ul className={s.features}>{features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        </section>
      </div> : <>
        <div ref={signupIntro} className={`${s.checkoutHeading} ${s.signupHeading}`}>
          <button type="button" className={s.back} onClick={() => { setStep('plan'); setError(null); }}>← Back to pricing</button>
          <h1>Make room for <span>your practice.</span></h1>
          <p>A few details. A workspace that feels like yours.</p>
        </div>
        <section className={`${s.checkoutCard} ${s.signupCard}`} aria-label="Checkout details">
          <ol className={s.signupRail} aria-label="Signup progress">
            {signupSteps.map((label, index) => <li key={label} data-status={index < signupStep ? 'done' : index === signupStep ? 'active' : 'upcoming'} aria-current={index === signupStep ? 'step' : undefined}>
              <span className={s.signupDot} aria-hidden="true">{index < signupStep ? <svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M3 8.5 6.2 11.5 13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : index + 1}</span>
              <span>{label}</span>
            </li>)}
          </ol>
          <div className={s.stepIntro}>
            <p className={s.eyebrow}>Step {signupStep + 1} of 3</p>
            <h2 ref={stepHeading} tabIndex={-1}>{['First, a little about you.', 'Tell us about your practice.', 'What’s your practice address?'][signupStep]}</h2>
            <p>{['You’ll be the owner of your Sparki workspace.', 'Start with your business name. The other details are optional.', 'Your practice address is optional. You can also add it during setup.'][signupStep]}</p>
          </div>
          <form onSubmit={(event) => void checkout(event)}>
            {signupStep === 0 && <div className={s.formSection}>
              <div className={s.fieldPair}>
                <label>First name<input autoComplete="given-name" required maxLength={100} value={form.ownerFirstName} onChange={(event) => setForm({ ...form, ownerFirstName: event.target.value })} /></label>
                <label>Last name<input autoComplete="family-name" required maxLength={100} value={form.ownerLastName} onChange={(event) => setForm({ ...form, ownerLastName: event.target.value })} /></label>
              </div>
              <label>Your email<input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <p className={s.help}>Use an email only you can access. A personal email is fine if you don’t have your own work email. We’ll send your account setup link here.</p>
            </div>}
            {signupStep === 1 && <div className={s.formSection}>
              <label>Business name<input autoComplete="organization" required maxLength={200} value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
              <div className={s.fieldPair}>
                <label>Business phone<input type="tel" inputMode="tel" autoComplete="organization-tel" placeholder="(555) 123-4567" value={form.businessPhone} onChange={updateBusinessPhone} onKeyDown={handleBusinessPhoneKeyDown} /></label>
                <label>Team size<select value={form.teamSize} onChange={(event) => setForm({ ...form, teamSize: event.target.value })}><option value="">Select team size</option><option value="1">Just me</option><option value="2-5">2–5 people</option><option value="6-10">6–10 people</option><option value="11-25">11–25 people</option><option value="26+">26+ people</option></select></label>
              </div>
              <label>Practice contact email<input type="email" autoComplete="organization-email" value={form.businessEmail} onChange={(event) => setForm({ ...form, businessEmail: event.target.value })} /></label>
              <p className={s.help}>For a shared hospital inbox, if you have one. Team members use their own email addresses to sign in.</p>
            </div>}
            {signupStep === 2 && <div className={s.formSection}>
              <label>Street address<input autoComplete="street-address" maxLength={200} value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })} /></label>
              <div className={s.addressGrid}>
                <label>City<input autoComplete="address-level2" maxLength={100} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
                <label>State<input autoComplete="address-level1" maxLength={100} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></label>
                <label>ZIP code<input autoComplete="postal-code" maxLength={20} value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} /></label>
              </div>
            </div>}
            {error && <p className={s.error} role="alert">{error}</p>}
            <div className={s.signupActions}>
              {signupStep > 0 && <button type="button" className={s.stepBack} disabled={busy} onClick={() => { setSignupStep(signupStep - 1); setError(null); }}>← Back</button>}
              <button className={s.button} disabled={busy}>{busy ? 'Opening checkout…' : signupStep === 2 ? 'Continue to secure checkout' : 'Continue'} <span aria-hidden="true">{signupStep === 2 ? '↗' : '→'}</span></button>
            </div>
          </form>
          <div className={s.signupPlan}><span>Sparki · Free during early access</span><strong>$0 today</strong></div>
        </section>
      </>}
    </main>
    <footer className={s.footer}><Link href="/" className={s.brand} aria-label="Sparki home"><SparkiLogo kind="mark" /><SparkiLogo kind="wordmark" /></Link><span>Built for the people who care.</span><div><Link href="/#product">Product</Link><Link href="/pricing">Pricing</Link><Link href="/login">Sign In</Link><span>© {new Date().getFullYear()} Sparki</span></div></footer>
  </div>;
}
