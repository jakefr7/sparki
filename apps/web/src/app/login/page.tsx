import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '../../components/login-form';

export const metadata: Metadata = {
  title: 'Sign in — Sparki',
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <header className="login-header">
        <Link href="/" className="login-brand" aria-label="Sparki home">
          <span className="login-brand__mark" aria-hidden="true">S</span>
          <span className="login-brand__name">sparki</span>
        </Link>
        <Link href="/" className="login-back">← Back to Sparki</Link>
      </header>
      <div className="login-content">
        <section className="login-intro" aria-label="Welcome to Sparki">
          <p className="login-eyebrow">YOUR CONNECTED CLINIC</p>
          <h2>Less chasing.<br /><span>More caring.</span></h2>
          <p>Your patients, your team, and the day ahead.<br />Together in one workspace.</p>
        </section>
        <section className="login-card" aria-labelledby="login-heading">
          <p className="login-eyebrow">WELCOME BACK</p>
          <h1 id="login-heading">Sign in</h1>
          <p className="login-subtitle">Pick up where your clinic left off.</p>
          <LoginForm />
        </section>
      </div>
      <footer className="login-footer">Built for the people who care.</footer>
    </main>
  );
}
