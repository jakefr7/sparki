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
      const [nextMembers, nextInvitations] = await Promise.all([
        clinicRequest<TeamMember[]>('/team/members'),
        clinicRequest<TeamInvitation[]>('/team/invitations'),
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
      setError(null);
    } catch (caught) {
      setError(friendlyClinicError(caught));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy('invite');
    setError(null);
    setNotice(null);
    try {
      await clinicRequest('/team/invitations', { method: 'POST', body: JSON.stringify({ email: email.trim(), role }) });
      setEmail('');
      setNotice('Invitation sent.');
      await load();
    } catch (caught) {
      setError(friendlyClinicError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function action(path: string, method: 'POST' | 'PATCH' | 'DELETE', key: string, body?: object, success?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await clinicRequest(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      await load();
      if (success) setNotice(success);
    } catch (caught) {
      setError(friendlyClinicError(caught));
    } finally {
      setBusy(null);
    }
  }

  const availableRoles = TEAM_ROLES.filter((item) => isOwner || item !== 'OWNER');
  const pending = invitations.filter((item) => item.status === 'PENDING');

  return (
    <section className="settings-section" aria-labelledby="settings-team-heading">
      <h1 id="settings-team-heading">Team</h1>
      <p className="settings-section__intro">Manage the people who work in your clinic.</p>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="settings-save-message" role="status">{notice}</p>}

      {loading ? (
        <p role="status">Loading team…</p>
      ) : (
        <>
          <fieldset className="settings-group">
            <legend>Active team</legend>
            {members.length ? (
              <div className="team-roster">
                {members.map((member) => {
                  const protectedRow = member.userId === user.id || (!isOwner && member.role === 'OWNER');
                  return (
                    <div key={member.membershipId} className="settings-account-row team-roster__row" data-disabled={member.status === 'DISABLED'}>
                      <div className="settings-account-row__identity">
                        <strong>{member.displayName}</strong>
                        <span>{member.email}</span>
                      </div>
                      <div className="team-roster__controls">
                        {protectedRow ? (
                          <span className="settings-account-row__role">{ROLE_LABELS[member.role]}</span>
                        ) : (
                          <select
                            aria-label={`Role for ${member.displayName}`}
                            value={member.role}
                            disabled={busy !== null}
                            onChange={(event) => void action(
                              `/team/members/${encodeURIComponent(member.membershipId)}/role`,
                              'PATCH',
                              member.membershipId,
                              { role: event.target.value as TeamRole },
                              'Role updated.',
                            )}
                          >
                            <option value={member.role}>{ROLE_LABELS[member.role]}</option>
                            {availableRoles.filter((item) => item !== member.role).map((item) => (
                              <option key={item} value={item}>{ROLE_LABELS[item]}</option>
                            ))}
                          </select>
                        )}
                        <span className="team-roster__status" data-active={member.status === 'ACTIVE'}>
                          {member.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                        </span>
                        {!protectedRow && (
                          <button
                            type="button"
                            className="settings-text-button"
                            disabled={busy !== null}
                            onClick={() => void action(
                              `/team/members/${encodeURIComponent(member.membershipId)}/${member.status === 'ACTIVE' ? 'disable' : 'enable'}`,
                              'POST',
                              member.membershipId,
                              undefined,
                              member.status === 'ACTIVE' ? 'Team member disabled.' : 'Team member re-enabled.',
                            )}
                          >
                            {member.status === 'ACTIVE' ? 'Disable' : 'Re-enable'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="settings-section__intro">No team members yet.</p>
            )}
          </fieldset>

          <fieldset className="settings-group">
            <legend>Pending invitations</legend>
            {pending.length ? (
              <div className="team-roster">
                {pending.map((invite) => (
                  <div key={invite.id} className="settings-account-row team-roster__row">
                    <div className="settings-account-row__identity">
                      <strong>{invite.email}</strong>
                      <span>Sent {new Date(invite.createdAt).toLocaleDateString()} · Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                    </div>
                    <div className="team-roster__controls">
                      <span className="settings-account-row__role">{ROLE_LABELS[invite.role]}</span>
                      <button
                        type="button"
                        className="settings-text-button"
                        disabled={busy !== null}
                        onClick={() => void action(`/team/invitations/${encodeURIComponent(invite.id)}/resend`, 'POST', invite.id, undefined, 'Invitation resent.')}
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        className="settings-text-button"
                        disabled={busy !== null}
                        onClick={() => {
                          if (window.confirm(`Cancel the invitation for ${invite.email}? The link will stop working.`)) {
                            void action(`/team/invitations/${encodeURIComponent(invite.id)}`, 'DELETE', invite.id, undefined, 'Invitation canceled.');
                          }
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="settings-section__intro">No pending invitations.</p>
            )}
          </fieldset>

          <fieldset className="settings-group">
            <legend>Invite a team member</legend>
            <form className="team-invite-row" onSubmit={(event) => void invite(event)}>
              <label>
                <span>Email</span>
                <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@clinic.com" />
              </label>
              <label>
                <span>Role</span>
                <select value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>
                  {availableRoles.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
                </select>
              </label>
              <div className="team-invite-row__submit-wrap">
                <span className="team-invite-row__submit-spacer" aria-hidden="true">&nbsp;</span>
                <button type="submit" className="button-primary team-invite-row__submit" disabled={busy !== null || !email.trim()}>
                  {busy === 'invite' ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </form>
          </fieldset>
        </>
      )}
    </section>
  );
}
