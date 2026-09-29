'use client';
import Link from 'next/link';
import { SparkiLogo } from '../../components/sparki-logo';
import { useEffect, useState, type FormEvent } from 'react';
import { clinicRequest, friendlyClinicError } from '../../lib/clinic-api';
import { ROLE_LABELS, TEAM_ROLES, type BatchInvitationResult, type ClinicProfile, type OnboardingState, type TeamRole } from '../../lib/clinic-contracts';
import { useCurrentUser } from '../../lib/use-current-user';
import '../clinic-access.css';

type InviteRow = { key: number; email: string; role: TeamRole; state: 'idle' | 'pending' | 'sent' | 'error'; error?: string | undefined };
let rowKey = 0;
const newRow = (): InviteRow => ({ key: ++rowKey, email: '', role: 'VETERINARIAN', state: 'idle' });
const COMMON_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver'];
export default function SetupPage() {
  const { user } = useCurrentUser();
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [clinic, setClinic] = useState<ClinicProfile | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', teamSize: '', addressLine1: '', city: '', state: '', postalCode: '', timezone: '' });
  const [rows, setRows] = useState<InviteRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    let active = true;
    clinicRequest<OnboardingState>('/clinic/onboarding-state').then(async (state) => {
      if (!active) return;
      setOnboarding(state);
      if (state.step === 'CLINIC_DETAILS') {
        const profile = await clinicRequest<ClinicProfile>('/clinic');
        if (!active) return;
        setClinic(profile);
        setForm({ name: profile.name, phone: profile.phone ?? '', email: profile.email ?? '', teamSize: profile.teamSize ?? '', addressLine1: profile.addressLine1 ?? '', city: profile.city ?? '', state: profile.state ?? '', postalCode: profile.postalCode ?? '', timezone: profile.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '' });
      }
    }).catch((caught) => { if (active) setError(friendlyClinicError(caught)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function saveDetails(event: FormEvent) {
    event.preventDefault(); setError(null); setSaving(true);
    try {
      if (!form.timezone) { setError('Choose your clinic’s timezone.'); return; }
      await clinicRequest<ClinicProfile>('/clinic', { method: 'PATCH', body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || null, teamSize: form.teamSize || null, addressLine1: form.addressLine1.trim() || null, city: form.city.trim() || null, state: form.state.trim() || null, postalCode: form.postalCode.trim() || null, timezone: form.timezone }) });
      setOnboarding(await clinicRequest<OnboardingState>('/clinic/onboarding-state'));
    } catch (caught) { setError(friendlyClinicError(caught)); } finally { setSaving(false); }
  }
  async function complete() {
    setError(null); setSaving(true);
    try { setOnboarding(await clinicRequest<OnboardingState>('/clinic/onboarding/complete', { method: 'POST' })); setFinished(true); }
    catch (caught) { setError(friendlyClinicError(caught)); } finally { setSaving(false); }
  }
  async function sendInvites(event: FormEvent) {
    event.preventDefault(); setError(null);
    const pending = rows.filter((row) => row.state !== 'sent' && row.email.trim());
    if (!pending.length) { await complete(); return; }
    if (pending.length > 25) { setError('Send up to 25 invitations at a time.'); return; }
    setSaving(true);
    const keys = new Set(pending.map((row) => row.key));
    setRows((current) => current.map((row) => keys.has(row.key) ? { ...row, state: 'pending', error: undefined } : row));
    try {
      const results = await clinicRequest<BatchInvitationResult[]>('/team/invitations/batch', { method: 'POST', body: JSON.stringify({ invitations: pending.map((row) => ({ email: row.email.trim(), role: row.role })) }) });
      setRows((current) => current.map((row) => { const index = pending.findIndex((item) => item.key === row.key); if (index < 0) return row; const result = results[index]; return result?.success ? { ...row, state: 'sent', error: undefined } : { ...row, state: 'error', error: result?.error && /already has a Sparki account/i.test(result.error) ? 'This email already has a Sparki account.' : result?.error && /owner/i.test(result.error) ? 'Only a clinic owner can invite an owner.' : 'Invitation could not be sent. Check this row and try again.' }; }));
      if (results.every((result) => result.success)) setError(null);
    } catch (caught) { setRows((current) => current.map((row) => keys.has(row.key) ? { ...row, state: 'error', error: friendlyClinicError(caught) } : row)); }
    finally { setSaving(false); }
  }
  const update = (key: number, patch: Partial<InviteRow>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch, state: 'idle', error: undefined } : row));
  const allZones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : COMMON_ZONES;
  const zoneOptions = Array.from(new Set([form.timezone, ...COMMON_ZONES, ...allZones].filter(Boolean)));
  return <main className="clinic-access"><section className="clinic-access__panel clinic-access__panel--wide"><Link href="/" className="clinic-access__brand" aria-label="Sparki home"><SparkiLogo /></Link>
    {loading ? <p role="status">Loading clinic setup…</p> : !onboarding ? <><h1>Clinic setup is unavailable</h1><p>{error ?? 'Try again in a moment.'}</p><button className="button-secondary" onClick={() => window.location.reload()}>Try again</button></> : finished || onboarding.step === 'COMPLETE' ? <><p className="eyebrow">Setup complete</p><h1>You’re ready to use Sparki</h1><p>Your clinic workspace is ready.</p><Link className="button-primary" href="/today">Enter Sparki</Link></> : onboarding.step === 'CLINIC_DETAILS' ? <><p className="eyebrow">Step 1 of 2</p><h1>Confirm your clinic details</h1><p>We’ve brought over what you shared. Confirm your time zone and make any updates.</p><form className="clinic-form" onSubmit={(event) => void saveDetails(event)}>
      <label>Clinic name<input required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
      <div className="clinic-form__pair"><label>Phone<input required type="tel" maxLength={50} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label><label>Email <small>Optional</small><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label></div>
      <label>Team size <small>Optional</small><select value={form.teamSize} onChange={(event) => setForm({ ...form, teamSize: event.target.value })}><option value="">Select team size</option><option value="1">Just me</option><option value="2-5">2–5 people</option><option value="6-10">6–10 people</option><option value="11-25">11–25 people</option><option value="26+">26+ people</option></select></label>
      <label>Address <small>Optional</small><input autoComplete="street-address" value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })}/></label>
      <div className="clinic-form__triple"><label>City<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })}/></label><label>State<input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })}/></label><label>ZIP / postal code<input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })}/></label></div>
      <label>Clinic timezone<select required value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option value="">Choose a timezone</option>{zoneOptions.map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ').replace('/', ' · ')}</option>)}</select><small>Appointment times use this timezone. Please check it before continuing.</small></label>
      {error && <p className="form-error" role="alert">{error}</p>}<button className="button-primary" disabled={saving || !clinic}>{saving ? 'Saving…' : 'Continue'}</button></form></> : <><p className="eyebrow">Step 2 of 2</p><h1>Invite your team</h1><p>Add teammates now, or do this later in Settings → Team.</p><form className="clinic-form" onSubmit={(event) => void sendInvites(event)}>{rows.map((row) => <div className="clinic-invite-row" key={row.key}><label>Email<input type="email" required={rows.length === 1 && row.state !== 'sent'} disabled={row.state === 'sent' || saving} value={row.email} onChange={(event) => update(row.key, { email: event.target.value })}/></label><label>Role<select value={row.role} disabled={row.state === 'sent' || saving} onChange={(event) => update(row.key, { role: event.target.value as TeamRole })}>{TEAM_ROLES.filter((role) => user?.role === 'OWNER' || role !== 'OWNER').map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label><button type="button" className="button-secondary" aria-label={`Remove invitation for ${row.email || 'teammate'}`} disabled={saving} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>Remove</button>{row.state !== 'idle' && <small className="clinic-invite-row__status" role="status">{row.state === 'sent' ? '✓ Invitation sent' : row.state === 'pending' ? 'Sending…' : row.error}</small>}</div>)}
      {rows.length < 25 && <button type="button" className="clinic-text-button" onClick={() => setRows((current) => [...current, newRow()])}>+ Add another team member</button>}
      {error && <p className="form-error" role="alert">{error}</p>}<div className="clinic-form__actions"><button type="submit" className="button-primary" disabled={saving}>{saving ? 'Sending…' : rows.every((row) => row.state === 'sent' || !row.email.trim()) ? 'Finish setup' : 'Send invitations'}</button><button type="button" className="button-secondary" disabled={saving} onClick={() => void complete()}>Skip for now</button></div></form></>}
  </section></main>;
}
