'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { clinicRequest, friendlyClinicError } from '../../lib/clinic-api';
import { ROLE_LABELS, TEAM_ROLES, type TeamInvitation, type TeamMember, type TeamRole } from '../../lib/clinic-contracts';
import type { CurrentUser } from '../../lib/use-current-user';

export function TeamSection({ user }: { user: CurrentUser }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('VETERINARIAN');
  const isOwner = user.role === 'OWNER';
  async function load() {
    try {
      const [nextMembers, nextInvitations] = await Promise.all([clinicRequest<TeamMember[]>('/team/members'), clinicRequest<TeamInvitation[]>('/team/invitations')]);
      setMembers(nextMembers); setInvitations(nextInvitations); setError(null);
    } catch (caught) { setError(friendlyClinicError(caught)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy('invite'); setError(null); setNotice(null);
    try { await clinicRequest('/team/invitations', { method: 'POST', body: JSON.stringify({ email: email.trim(), role }) }); setEmail(''); setNotice('Invitation sent.'); await load(); }
    catch (caught) { setError(friendlyClinicError(caught)); } finally { setBusy(null); }
  }
  async function action(path: string, method: 'POST' | 'PATCH' | 'DELETE', key: string, body?: object, success?: string) {
    setBusy(key); setError(null); setNotice(null);
    try { await clinicRequest(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); await load(); if (success) setNotice(success); }
    catch (caught) { setError(friendlyClinicError(caught)); } finally { setBusy(null); }
  }
  const availableRoles = TEAM_ROLES.filter((item) => isOwner || item !== 'OWNER');
  const pending = invitations.filter((item) => item.status === 'PENDING');
  return <section className="team-section" aria-labelledby="team-heading"><div className="team-section__heading"><div><p className="eyebrow">Settings</p><h2 id="team-heading">Team</h2><p>Manage the people who work in your clinic.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="team-notice" role="status">{notice}</p>}
    {loading ? <p role="status">Loading team…</p> : <>
      <section className="team-section__block" aria-labelledby="active-team"><h3 id="active-team">Active team</h3>{members.length ? <div className="team-table-wrap"><table className="team-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{members.map((member) => { const protectedRow = member.userId === user.id || (!isOwner && member.role === 'OWNER'); return <tr key={member.membershipId} data-disabled={member.status === 'DISABLED'}><td data-label="Name">{member.displayName}</td><td data-label="Email">{member.email}</td><td data-label="Role">{protectedRow ? ROLE_LABELS[member.role] : <select aria-label={`Role for ${member.displayName}`} value={member.role} disabled={busy !== null} onChange={(event) => void action(`/team/members/${encodeURIComponent(member.membershipId)}/role`, 'PATCH', member.membershipId, { role: event.target.value as TeamRole }, 'Role updated.')}><option value={member.role}>{ROLE_LABELS[member.role]}</option>{availableRoles.filter((item) => item !== member.role).map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select>}</td><td data-label="Status">{member.status === 'ACTIVE' ? 'Active' : 'Disabled'}</td><td data-label="Actions">{!protectedRow && <button type="button" className="clinic-text-button" disabled={busy !== null} onClick={() => void action(`/team/members/${encodeURIComponent(member.membershipId)}/${member.status === 'ACTIVE' ? 'disable' : 'enable'}`, 'POST', member.membershipId, undefined, member.status === 'ACTIVE' ? 'Team member disabled.' : 'Team member re-enabled.')}>{member.status === 'ACTIVE' ? 'Disable' : 'Re-enable'}</button>}</td></tr>; })}</tbody></table></div> : <p>No team members yet.</p>}</section>
      <section className="team-section__block" aria-labelledby="pending-invites"><h3 id="pending-invites">Pending invitations</h3>{pending.length ? <div className="team-table-wrap"><table className="team-table"><thead><tr><th>Email</th><th>Role</th><th>Sent</th><th>Expires</th><th>Actions</th></tr></thead><tbody>{pending.map((invite) => <tr key={invite.id}><td data-label="Email">{invite.email}</td><td data-label="Role">{ROLE_LABELS[invite.role]}</td><td data-label="Sent">{new Date(invite.createdAt).toLocaleDateString()}</td><td data-label="Expires">{new Date(invite.expiresAt).toLocaleDateString()}</td><td data-label="Actions"><div className="team-actions"><button type="button" className="clinic-text-button" disabled={busy !== null} onClick={() => void action(`/team/invitations/${encodeURIComponent(invite.id)}/resend`, 'POST', invite.id, undefined, 'Invitation resent.')}>Resend</button><button type="button" className="clinic-text-button" disabled={busy !== null} onClick={() => { if (window.confirm(`Revoke the invitation for ${invite.email}? The link will stop working.`)) void action(`/team/invitations/${encodeURIComponent(invite.id)}`, 'DELETE', invite.id, undefined, 'Invitation revoked.'); }}>Revoke</button></div></td></tr>)}</tbody></table></div> : <p>No pending invitations.</p>}</section>
      <section className="team-section__block" aria-labelledby="invite-member"><h3 id="invite-member">Invite a team member</h3><form className="team-invite-form" onSubmit={(event) => void invite(event)}><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@clinic.com" /></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>{availableRoles.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></label><button type="submit" className="button-primary" disabled={busy !== null}>{busy === 'invite' ? 'Sending…' : 'Send invitation'}</button></form></section>
    </>}
  </section>;
}
