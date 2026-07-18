'use client';

import { useEffect, useState } from 'react';
import type { StaffMember } from '../../lib/patient-types';

export function VisitPolicySection() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [signers, setSigners] = useState<StaffMember[]>([]);
  useEffect(() => {
    fetch('/api/visit-policy', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { allowCheckoutWithOutstandingBalance: boolean }) => setAllowed(body.allowCheckoutWithOutstandingBalance))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    fetch('/api/staff?role=VETERINARIAN,OWNER', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: StaffMember[]) => setSigners(body))
      .catch(() => setMessage('Could not load record signer permissions.'));
  }, []);

  async function save(next: boolean) {
    setAllowed(next); setMessage(null);
    const response = await fetch('/api/visit-policy', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowCheckoutWithOutstandingBalance: next }),
    });
    if (!response.ok) {
      setAllowed(!next);
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(body?.message ?? 'Could not update visit policy.');
    } else setMessage('Visit policy saved.');
  }

  async function setSignerPermission(staff: StaffMember, next: boolean) {
    setMessage(null);
    setSigners((current) => current.map((entry) => entry.id === staff.id ? { ...entry, canFinalizeRecordsForOthers: next } : entry));
    const response = await fetch(`/api/staff/${staff.id}/record-signoff-permission`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canFinalizeRecordsForOthers: next }),
    });
    if (!response.ok) {
      setSigners((current) => current.map((entry) => entry.id === staff.id ? { ...entry, canFinalizeRecordsForOthers: !next } : entry));
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(body?.message ?? 'Could not update signer permission.');
    } else {
      setMessage('Record signer permission saved.');
    }
  }

  return (
    <section className="settings-section-card visit-policy-settings">
      <div><p className="eyebrow">Visit lifecycle</p><h2>Checkout Policy</h2><p>Choose whether reception may finish checkout while a balance remains open.</p></div>
      <label className="visit-policy-settings__toggle">
        <input type="checkbox" checked={allowed} disabled={loading} onChange={(event) => void save(event.target.checked)} />
        <span><strong>Allow checkout with an outstanding balance</strong><small>The balance remains visible as assigned work until resolved.</small></span>
      </label>
      <div className="visit-policy-settings__signers">
        <h3>Backup medical-record signers</h3>
        <p>Permission makes a clinician eligible. They must still be assigned to a specific visit before signing for its doctor.</p>
        {signers.map((staff) => (
          <label className="visit-policy-settings__toggle" key={staff.id}>
            <input
              type="checkbox"
              checked={staff.canFinalizeRecordsForOthers}
              onChange={(event) => void setSignerPermission(staff, event.target.checked)}
            />
            <span><strong>{staff.displayName}</strong><small>{staff.jobTitle ?? staff.role}</small></span>
          </label>
        ))}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
