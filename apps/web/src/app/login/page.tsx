import type { Metadata } from 'next';
import { LoginForm } from '../../components/login-form';

export const metadata: Metadata = {
  title: 'Sign in — Sparki',
};

export default function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand__mark" aria-hidden="true">
            S
          </span>
          <span className="login-brand__name">Sparki</span>
        </div>
        <h1>Sign in</h1>
        <p className="login-subtitle">Enter your clinic credentials to continue.</p>
        <LoginForm />
      </div>
    </div>
  );
}
