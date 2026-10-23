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

export function ProfileSection() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState({ displayName: '', phone: '', avatarUrl: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const avatarButton = useRef<HTMLButtonElement>(null);
  const photoMenu = useRef<HTMLDivElement>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [photoMenuPosition, setPhotoMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/auth/profile', { cache: 'no-store' })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign('/login?from=/settings');
          return null;
        }
        if (!response.ok) {
          throw new Error('Could not load your profile.');
        }
        return response.json() as Promise<Profile>;
      })
      .then((body) => {
        if (cancelled || !body) return;
        setProfile(body);
        setDraft({
          displayName: body.displayName ?? `${body.firstName} ${body.lastName}`,
          phone: body.phone ?? '',
          avatarUrl: body.avatarUrl ?? '',
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Could not load your profile.');
        }
      });

    return () => { cancelled = true; };
  }, []);
  useLayoutEffect(() => { if (!photoMenuOpen) return; const update = () => { const rect = avatarButton.current?.getBoundingClientRect(); if (!rect) return; const width = 280; const margin = 12; setPhotoMenuPosition({ top: rect.bottom + 12, left: Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - margin) }); }; update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true); return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); }; }, [photoMenuOpen]);
  useEffect(() => { if (!photoMenuOpen) return; const dismiss = (event: MouseEvent) => { const target = event.target as Node; if (!photoMenu.current?.contains(target) && !avatarButton.current?.contains(target)) setPhotoMenuOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPhotoMenuOpen(false); }; document.addEventListener('mousedown', dismiss); document.addEventListener('keydown', escape); return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', escape); }; }, [photoMenuOpen]);

  function applyPhoto(body: Profile) {
    setDraft((current) => ({ ...current, avatarUrl: body.avatarUrl ?? '' }));
    setProfile(body);
    setPhotoMenuOpen(false);
    window.dispatchEvent(new CustomEvent('sparki:profile-updated', { detail: body }));
  }

  async function upload(file: File) {
    if (uploading || saving || !profile) return;
    setMessage(null);
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setMessage('Use a JPG, PNG, WebP, or GIF image.'); return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setMessage('Choose an image no larger than 5 MB.'); return;
    }
    setUploading(true);
    try {
      const form = new FormData(); form.set('file', file);
      const response = await fetch('/api/auth/profile/avatar', { method: 'POST', body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.avatarUrl) throw new Error(typeof body?.message === 'string' ? body.message : 'Could not upload this image. Please try again.');
      applyPhoto(body);
      setMessage('Profile photo updated.');
    } catch (caught) {
      setMessage(caught instanceof TypeError ? 'Could not upload this image. Please try again.' : caught instanceof Error ? caught.message : 'Could not upload this image. Please try again.');
    } finally { setUploading(false); }
  }

  async function removeAvatar() {
    if (uploading || saving || !profile) return;
    setUploading(true); setMessage(null);
    try {
      const response = await fetch('/api/auth/profile/avatar', { method: 'DELETE' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) throw new Error(typeof body?.message === 'string' ? body.message : 'Could not remove this image. Please try again.');
      applyPhoto(body);
      setMessage('Profile photo removed.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not remove this image. Please try again.');
    } finally { setUploading(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || uploading || !profile) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: draft.displayName, phone: draft.phone || null, avatarUrl: draft.avatarUrl || null, statusEmoji: profile.statusEmoji, statusText: profile.statusText }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.id) throw new Error(typeof body?.message === 'string' ? body.message : 'Could not save your profile. Please try again.');
      setProfile(body); setMessage('Profile saved. Your changes now appear across Sparki.');
      window.dispatchEvent(new CustomEvent('sparki:profile-updated', { detail: body }));
    } catch (caught) {
      setMessage(caught instanceof TypeError ? 'Could not save your profile. Please try again.' : caught instanceof Error ? caught.message : 'Could not save your profile. Please try again.');
    } finally { setSaving(false); }
  }

  const fallback = profile ? `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase() : '';
  const savedDisplayName = profile ? profile.displayName ?? `${profile.firstName} ${profile.lastName}` : '';
  const hasUnsavedChanges = Boolean(profile && (
    draft.displayName !== savedDisplayName || draft.phone !== (profile.phone ?? '')
  ));
  return <section className="settings-section profile-settings" aria-labelledby="settings-profile-heading">
    <h1 id="settings-profile-heading">Profile</h1><p className="settings-section__intro">Manage your profile photo and contact information.</p>
    <form onSubmit={save}>
      <fieldset className="settings-group"><legend>Profile image</legend><div className="profile-photo-row"><div className="patient-photo-control profile-photo-control"><button ref={avatarButton} type="button" className="patient-photo-control__avatar-button" onClick={() => setPhotoMenuOpen((current) => !current)} aria-label={draft.avatarUrl ? 'Change profile image' : 'Add profile image'}><span className="profile-photo">{draft.avatarUrl && draft.avatarUrl !== failedAvatarUrl ? <img src={draft.avatarUrl} alt="Profile preview" onError={() => setFailedAvatarUrl(draft.avatarUrl)} /> : <span>{fallback}</span>}</span><span className="patient-photo-control__badge" aria-hidden="true">+</span></button></div><input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />{photoMenuOpen && photoMenuPosition ? createPortal(<div ref={photoMenu} className="patient-photo-menu patient-photo-menu--portal" role="dialog" aria-label="Profile image options" style={{ top: photoMenuPosition.top, left: photoMenuPosition.left }}><div className="patient-photo-menu__header"><strong>{draft.avatarUrl ? 'Change image' : 'Add image'}</strong><button type="button" onClick={() => setPhotoMenuOpen(false)} aria-label="Close image options">×</button></div><div className="patient-photo-menu__actions"><button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || saving || !profile}>{uploading ? 'Uploading…' : 'Upload image'}</button><button type="button" disabled>Use webcam <span>Coming soon</span></button>{draft.avatarUrl ? <button type="button" disabled={uploading || saving} onClick={() => void removeAvatar()}>Remove image</button> : null}</div></div>, document.body) : null}</div></fieldset>
      <fieldset className="settings-group"><legend>Identity</legend><div className="profile-form-grid"><label><span>Display name</span><input required maxLength={120} value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /></label><label><span>Role</span><input value={profile ? ROLE_LABELS[profile.role] ?? profile.role : ''} disabled aria-describedby="profile-role-help" /><small id="profile-role-help">Your clinic manages roles and permissions.</small></label><label><span>Email</span><input value={profile?.email ?? ''} disabled /></label><label><span>Phone</span><input type="tel" maxLength={50} value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Add a contact number" /></label></div></fieldset>
      <div className="profile-save-row">{message ? <p role="status">{message}</p> : <span />}<button className="button-primary" disabled={saving || uploading || !draft.displayName.trim() || !hasUnsavedChanges}>{saving ? 'Saving…' : 'Save'}</button></div>
    </form>
  </section>;
}
