'use client';

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';

interface Profile {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  statusEmoji: string | null;
  statusText: string | null;
  role: string;
}

const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', PRACTICE_MANAGER: 'Practice Manager', RECEPTIONIST: 'Receptionist', VETERINARIAN: 'Veterinarian', TECHNICIAN: 'Technician', ASSISTANT: 'Assistant', CLIENT: 'Client' };
const STATUS_PRESETS = [['🟢', 'Available'], ['🩺', 'With a patient'], ['📋', 'Charting'], ['🍽️', 'At lunch'], ['🚫', 'Do not disturb']] as const;

export function ProfileSection() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState({ displayName: '', phone: '', avatarUrl: '', statusEmoji: '', statusText: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const avatarButton = useRef<HTMLButtonElement>(null);
  const photoMenu = useRef<HTMLDivElement>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [photoMenuPosition, setPhotoMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => { void fetch('/api/auth/profile', { cache: 'no-store' }).then((response) => response.json()).then((body: Profile) => { setProfile(body); setDraft({ displayName: body.displayName ?? `${body.firstName} ${body.lastName}`, phone: body.phone ?? '', avatarUrl: body.avatarUrl ?? '', statusEmoji: body.statusEmoji ?? '', statusText: body.statusText ?? '' }); }); }, []);
  useLayoutEffect(() => { if (!photoMenuOpen) return; const update = () => { const rect = avatarButton.current?.getBoundingClientRect(); if (!rect) return; const width = 280; const margin = 12; setPhotoMenuPosition({ top: rect.bottom + 12, left: Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - margin) }); }; update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true); return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); }; }, [photoMenuOpen]);
  useEffect(() => { if (!photoMenuOpen) return; const dismiss = (event: MouseEvent) => { const target = event.target as Node; if (!photoMenu.current?.contains(target) && !avatarButton.current?.contains(target)) setPhotoMenuOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPhotoMenuOpen(false); }; document.addEventListener('mousedown', dismiss); document.addEventListener('keydown', escape); return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', escape); }; }, [photoMenuOpen]);

  async function upload(file: File) {
    setUploading(true); setMessage(null);
    const form = new FormData(); form.set('file', file);
    const response = await fetch('/api/auth/profile/avatar', { method: 'POST', body: form });
    const body = await response.json();
    if (response.ok) { await persistAvatar(body.avatarUrl); setPhotoMenuOpen(false); }
    else setMessage(body.message ?? 'Could not upload this image.');
    setUploading(false);
  }

  async function persistAvatar(avatarUrl: string) {
    const next = { ...draft, avatarUrl };
    const response = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: next.displayName, phone: next.phone || null, avatarUrl: next.avatarUrl || null, statusEmoji: next.statusEmoji || null, statusText: next.statusText || null }) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message ?? 'Could not update this image.'); return; }
    setDraft(next); setProfile(body); window.dispatchEvent(new CustomEvent('sparki:profile-updated', { detail: body }));
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const response = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: draft.displayName, phone: draft.phone || null, avatarUrl: draft.avatarUrl || null, statusEmoji: draft.statusEmoji || null, statusText: draft.statusText || null }) });
    const body = await response.json();
    if (response.ok) { setProfile(body); setMessage('Profile saved. Your changes now appear across Sparki.'); window.dispatchEvent(new CustomEvent('sparki:profile-updated', { detail: body })); }
    else setMessage(body.message ?? 'Could not save your profile.');
    setSaving(false);
  }

  const fallback = profile ? `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}` : '';
  return <section className="settings-section profile-settings" aria-labelledby="settings-profile-heading">
    <h1 id="settings-profile-heading">Profile</h1><p className="settings-section__intro">Choose how your teammates see and reach you throughout Sparki.</p>
    <form onSubmit={save}>
      <fieldset className="settings-group"><legend>Profile image</legend><div className="profile-photo-row"><div className="patient-photo-control profile-photo-control"><button ref={avatarButton} type="button" className="patient-photo-control__avatar-button" onClick={() => setPhotoMenuOpen((current) => !current)} aria-label={draft.avatarUrl ? 'Change profile image' : 'Add profile image'}><span className="profile-photo">{draft.avatarUrl ? <img src={draft.avatarUrl} alt="Profile preview" /> : <span>{fallback}</span>}</span><span className="patient-photo-control__badge" aria-hidden="true">+</span></button></div><p>JPG, PNG, WebP, or GIF. Maximum 5 MB.</p><input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />{photoMenuOpen && photoMenuPosition ? createPortal(<div ref={photoMenu} className="patient-photo-menu patient-photo-menu--portal" role="dialog" aria-label="Profile image options" style={{ top: photoMenuPosition.top, left: photoMenuPosition.left }}><div className="patient-photo-menu__header"><strong>{draft.avatarUrl ? 'Change image' : 'Add image'}</strong><button type="button" onClick={() => setPhotoMenuOpen(false)} aria-label="Close image options">×</button></div><div className="patient-photo-menu__actions"><button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload image'}</button><button type="button" disabled>Use webcam <span>Coming soon</span></button>{draft.avatarUrl ? <button type="button" onClick={() => { void persistAvatar(''); setPhotoMenuOpen(false); }}>Remove image</button> : null}</div></div>, document.body) : null}</div></fieldset>
      <fieldset className="settings-group"><legend>Identity</legend><div className="profile-form-grid"><label><span>Display name</span><input required maxLength={120} value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /></label><label><span>Role</span><input value={profile ? ROLE_LABELS[profile.role] ?? profile.role : ''} disabled aria-describedby="profile-role-help" /><small id="profile-role-help">Your clinic manages roles and permissions.</small></label><label><span>Email</span><input value={profile?.email ?? ''} disabled /></label><label><span>Phone</span><input type="tel" maxLength={50} value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Add a contact number" /></label></div></fieldset>
      <fieldset className="settings-group"><legend>Status</legend><p className="profile-field-help">Let the clinic team know your availability without sending a message.</p><div className="profile-status-presets">{STATUS_PRESETS.map(([emoji, text]) => <button type="button" key={text} aria-pressed={draft.statusText === text} onClick={() => setDraft((current) => ({ ...current, statusEmoji: emoji, statusText: text }))}><span>{emoji}</span>{text}</button>)}</div><div className="profile-status-custom"><label><span>Emoji</span><input value={draft.statusEmoji} maxLength={16} onChange={(event) => setDraft((current) => ({ ...current, statusEmoji: event.target.value }))} placeholder="🙂" /></label><label><span>Status message</span><input value={draft.statusText} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, statusText: event.target.value }))} placeholder="What are you working on?" /></label><button type="button" onClick={() => setDraft((current) => ({ ...current, statusEmoji: '', statusText: '' }))}>Clear</button></div></fieldset>
      <div className="profile-save-row">{message ? <p role="status">{message}</p> : <span />}<button className="button-primary" disabled={saving || uploading || !draft.displayName.trim()}>{saving ? 'Saving…' : 'Save profile'}</button></div>
    </form>
  </section>;
}
