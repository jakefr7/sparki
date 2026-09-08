'use client';

import Link from 'next/link';

import { useState, type FormEvent } from 'react';
import {
  DEMO_REQUEST_AVAILABLE,
  submitDemoRequest,
  type DemoRequest,
} from '../../lib/demo-request';
import s from './landing.module.css';

export function DemoPage() {
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const data = new FormData(event.currentTarget);
    const request = Object.fromEntries(
      ['name', 'email', 'organization', 'role', 'veterinarians', 'phone', 'message'].map((key) => [
        key,
        String(data.get(key) ?? '').trim(),
      ]),
    ) as unknown as DemoRequest;
    try {
      const result = await submitDemoRequest(request);
      setNotice(result.message);
    } catch {
      setNotice('Your request could not be sent. Please try again later.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={`${s.landing} ${s.demoPage}`}>
      <Link href="#demo-form" className={s.skip}>
        Skip to demo request form
      </Link>
      <header className={s.demoHeader}>
        <Link href="/" className={s.brand}>
          <span className={s.mark} aria-hidden="true">
            S<span />
          </span>
          sparki
        </Link>
        <Link href="/" className={s.textLink}>
          <span aria-hidden="true">←</span> Back to Sparki
        </Link>
      </header>
      <main className={s.demoMain}>
        <section className={s.demoIntro}>
          <p className={s.eyebrow}>LET’S TALK ABOUT YOUR CLINIC</p>
          <h1>
            A better day.
            <br />
            <span>Let’s picture it.</span>
          </h1>
          <p>
            See how Sparki brings your patients, people, and daily work into one connected
            workspace.
          </p>
          <div className={s.demoAgenda}>
            <span>EXPLORE SPARKI WITH YOUR TEAM</span>
            <p>
              <i>01</i> Follow a patient from arrival to record.
            </p>
            <p>
              <i>02</i> See the workspace from your team’s roles.
            </p>
            <p>
              <i>03</i> Talk through the way your clinic works.
            </p>
          </div>
          <div className={s.demoSignature}>
            <span className={s.markSmall} aria-hidden="true">
              S<span />
            </span>
            <span>Built for the people who care.</span>
          </div>
        </section>
        <section className={s.demoFormPanel} aria-labelledby="demo-form-title">
          <h2 id="demo-form-title">Book a Demo</h2>
          <p>A little about you and your clinic.</p>
          {!DEMO_REQUEST_AVAILABLE && (
            <div className={s.demoUnavailable} id="demo-availability">
              <strong>Demo requests are not open yet.</strong>
              <p>You can explore the form below. Your details will not be sent or saved.</p>
            </div>
          )}
          <form id="demo-form" onSubmit={submit} aria-describedby="demo-availability">
            <div className={s.formGrid}>
              <label>
                Name
                <input name="name" autoComplete="name" required maxLength={120} />
              </label>
              <label>
                Work email
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
              <label className={s.fullField}>
                Clinic / organization name
                <input name="organization" autoComplete="organization" required maxLength={200} />
              </label>
              <label htmlFor="demo-role">
                Role
                <select id="demo-role" aria-label="Role" name="role" defaultValue="" required>
                  <option value="" disabled>
                    Select your role
                  </option>
                  {[
                    'Receptionist',
                    'Technician / Assistant',
                    'Veterinarian',
                    'Practice Manager',
                    'Owner',
                    'Other',
                  ].map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="demo-veterinarians">
                Number of veterinarians
                <select
                  id="demo-veterinarians"
                  aria-label="Number of veterinarians"
                  name="veterinarians"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Approximate team size
                  </option>
                  {['1', '2–5', '6–10', '11–20', '21+', 'Not sure yet'].map((size) => (
                    <option key={size}>{size}</option>
                  ))}
                </select>
              </label>
              <label className={s.fullField}>
                Phone number <span>(optional)</span>
                <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
              </label>
              <label className={s.fullField}>
                Anything you’d like us to know? <span>(optional)</span>
                <textarea name="message" rows={3} maxLength={2000} />
              </label>
            </div>
            <button
              className={s.demoSubmit}
              disabled={!DEMO_REQUEST_AVAILABLE || pending}
              type="submit"
            >
              {pending
                ? 'Sending request…'
                : DEMO_REQUEST_AVAILABLE
                  ? 'Request a Demo'
                  : 'Demo requests opening soon'}
              <span aria-hidden="true">↗</span>
            </button>
            <p className={s.formNote}>
              This is a request for a conversation, not a scheduled appointment.
            </p>
            <p role="status" className={s.formStatus}>
              {notice}
            </p>
          </form>
        </section>
      </main>
      <footer className={s.demoFooter}>
        <span>© {new Date().getFullYear()} Sparki</span>
        <Link href="/login">
          Sign In <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </div>
  );
}
