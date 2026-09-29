'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ClinicApiError, clinicRequest } from '../../../lib/clinic-api';
import { ROLE_LABELS, type PublicInvitation } from '../../../lib/clinic-contracts';
import { SparkiLogo } from '../../../components/sparki-logo';
import '../../clinic-access.css';

const stateCopy = {
  EXPIRED: ['This invitation has expired.', 'Ask your clinic administrator for a new invitation.'],
  REVOKED: ['This invitation is no longer active.', 'Ask your clinic administrator for a new invitation.'],
  ACCEPTED: ['This invitation has already been used.', 'Sign in to continue to Sparki.'],
};
export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<PublicInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    clinicRequest<PublicInvitation>(`/invitations/${encodeURIComponent(token)}`)
      .then((value) => { if (active) { setInvite(value); if (value.isOwnerFounding) { setFirstName(value.suggestedFirstName ?? ''); setLastName(value.suggestedLastName ?? ''); } } })
      .catch(() => { if (active) setError('This invitation link isn’t valid.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);
  async function accept(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setError('Passwords don’t match.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    setSaving(true); setError(null);
    try {
      await clinicRequest(`/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), password }) });
      // A full navigation reloads the server-side auth bootstrap with the new cookie.
      window.location.assign(invite?.isOwnerFounding ? '/setup' : '/today');
    } catch (caught) {
      if (caught instanceof ClinicApiError) {
        if (caught.code === 'EMAIL_ALREADY_REGISTERED') setError('This email already has a Sparki account.');
        else if (caught.status === 410) setError(/revok/i.test(caught.message) ? stateCopy.REVOKED[0]! : stateCopy.EXPIRED[0]!);
        else if (caught.status === 409) setError(stateCopy.ACCEPTED[0]!);
        else if (caught.status === 404) setError('This invitation link isn’t valid.');
        else setError('We couldn’t create your account. Try again.');
      } else setError('We couldn’t create your account. Try again.');
      setSaving(false);
    }
  }
  const inactive = invite && invite.status !== 'PENDING' ? stateCopy[invite.status] : null;
  return <main className="clinic-access"><section className="clinic-access__panel"><Link className="clinic-access__brand" href="/" aria-label="Sparki home"><SparkiLogo /></Link>
    {loading ? <p role="status">Loading your invitation…</p> : inactive ? <><h1>{inactive[0]}</h1><p>{inactive[1]}</p><Link href="/login" className="button-primary">Sign in</Link></> : invite ? <>
      <p className="eyebrow">{invite.isOwnerFounding ? 'Your clinic is ready' : 'Join your clinic'}</p>
      <h1>{invite.isOwnerFounding ? 'Welcome to Sparki' : `You’ve been invited to ${invite.clinicName}`}</h1>
      <p>{invite.isOwnerFounding ? `${invite.clinicName} is ready. Create your administrator account to finish setting up your clinic.` : `Create an account to join ${invite.clinicName}.`}</p>
      <p className="clinic-access__meta">{invite.email} · {ROLE_LABELS[invite.role]}</p>
      <form onSubmit={(event) => void accept(event)} className="clinic-form">
        <div className="clinic-form__pair"><label>First name<input autoComplete="given-name" required maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label><label>Last name<input autoComplete="family-name" required maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label></div>
        <label>Password<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error} {error.includes('already') ? <Link href="/login">Sign in</Link> : null}</p>}
        <button className="button-primary" disabled={saving}>{saving ? 'Creating account…' : 'Create account'}</button>
      </form>
    </> : <><h1>This invitation link isn’t valid.</h1><p>Ask your clinic administrator for a new invitation.</p><Link href="/login" className="button-secondary">Sign in</Link></>}
    </section></main>;
}
