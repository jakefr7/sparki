import type { Metadata } from 'next';
import { LoginForm } from '../../components/login-form';
import { PublicHeader } from '../../components/landing/public-header';

export const metadata: Metadata = {
  title: 'Sign in — Sparki',
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <PublicHeader />
      <div className="login-content">
        <section className="login-intro" aria-label="Welcome to Sparki">
          <p className="login-eyebrow">YOUR CONNECTED CLINIC</p>
          <h2>Less chasing.<br /><span>More caring.</span></h2>
          <p>Your patients, your team, and the day ahead.<br />Together in one workspace.</p>
        </section>
        <section className="login-card" aria-labelledby="login-heading">
          <LoginForm />
        </section>
      </div>
      <footer className="login-footer">Built for the people who care.</footer>
    </main>
  );
}
