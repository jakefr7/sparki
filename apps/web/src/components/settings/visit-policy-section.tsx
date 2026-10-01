'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StaffMember } from '../../lib/patient-types';

export function VisitPolicySection({ mode = 'checkout' }: { mode?: 'checkout' | 'permissions' }) {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signers, setSigners] = useState<StaffMember[]>([]);
  const [medicationClerks, setMedicationClerks] = useState<StaffMember[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    setError(null);
    try {
      if (mode === 'checkout') {
        const response = await fetch('/api/visit-policy', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load checkout preferences.');
        const body = (await response.json()) as { allowCheckoutWithOutstandingBalance: boolean };
        setAllowed(body.allowCheckoutWithOutstandingBalance);
      } else {
        const responses = await Promise.all([
          fetch('/api/staff?role=VETERINARIAN,OWNER', { cache: 'no-store' }),
          fetch('/api/staff?role=RECEPTIONIST,ASSISTANT', { cache: 'no-store' }),
        ]);
        if (responses.some((response) => !response.ok))
          throw new Error('Could not load clinical permissions.');
        const [signerList, clerkList] = (await Promise.all(
          responses.map((response) => response.json()),
        )) as [StaffMember[], StaffMember[]];
        setSigners(signerList);
        setMedicationClerks(clerkList);
      }
      setLoaded(true);
    } catch (caught) {
      setError(
        caught instanceof Error && !(caught instanceof TypeError)
          ? caught.message
          : 'Could not load preferences.',
      );
    } finally {
      setLoading(false);
    }
  }, [mode]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(
    key: string,
    url: string,
    body: Record<string, boolean>,
    onSaved: () => void,
    success: string,
  ) {
    if (pending) return;
    setPending(key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: unknown } | null;
        throw new Error(
          typeof payload?.message === 'string'
            ? payload.message
            : 'Could not save. Your previous setting is unchanged.',
        );
      }
      onSaved();
      setMessage(success);
    } catch (caught) {
      setError(
        caught instanceof Error && !(caught instanceof TypeError)
          ? caught.message
          : 'Could not save. Your previous setting is unchanged.',
      );
    } finally {
      setPending(null);
    }
  }
  const disabled = loading || Boolean(pending);
  return (
    <section
      className="settings-section visit-policy-settings"
      aria-labelledby={`admin-${mode}-heading`}
    >
      <div>
        <h2 id={`admin-${mode}-heading`}>
          {mode === 'checkout' ? 'Checkout preferences' : 'Clinical permissions'}
        </h2>
        <p>
          {mode === 'checkout'
            ? 'Choose how your team handles an outstanding balance at checkout.'
            : 'Manage additional clinical access for eligible staff. Team roles stay unchanged.'}
        </p>
      </div>
      {loading ? (
        <p role="status">
          Loading {mode === 'checkout' ? 'checkout preferences' : 'clinical permissions'}…
        </p>
      ) : null}
      {error ? (
        <div className="admin-feedback admin-feedback--error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button-secondary"
            disabled={disabled}
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {loaded && !loading && mode === 'checkout' ? (
        <label className="visit-policy-settings__toggle">
          <input
            type="checkbox"
            checked={allowed}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.checked;
              void save(
                'checkout',
                '/api/visit-policy',
                { allowCheckoutWithOutstandingBalance: next },
                () => setAllowed(next),
                'Checkout preference saved.',
              );
            }}
          />
          <span>
            <strong>Allow checkout with an outstanding balance</strong>
            <small>The balance stays visible as assigned work until resolved.</small>
          </span>
        </label>
      ) : null}
      {loaded && !loading && mode === 'permissions' ? (
        <>
          <div className="visit-policy-settings__signers">
            <h3>Backup medical-record signers</h3>
            <p>
              Eligible clinicians still need to be assigned to a specific visit before signing for
              its doctor.
            </p>
            {signers.map((staff) => (
              <label className="visit-policy-settings__toggle" key={staff.id}>
                <input
                  type="checkbox"
                  checked={staff.canFinalizeRecordsForOthers}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.checked;
                    void save(
                      staff.id,
                      `/api/staff/${staff.id}/record-signoff-permission`,
                      { canFinalizeRecordsForOthers: next },
                      () =>
                        setSigners((current) =>
                          current.map((entry) =>
                            entry.id === staff.id
                              ? { ...entry, canFinalizeRecordsForOthers: next }
                              : entry,
                          ),
                        ),
                      'Record signer permission saved.',
                    );
                  }}
                />
                <span>
                  <strong>{staff.displayName}</strong>
                  <small>{staff.jobTitle ?? staff.role}</small>
                </span>
              </label>
            ))}
            {!signers.length && !error ? (
              <p className="admin-empty">No eligible clinicians at this location.</p>
            ) : null}
          </div>
          <div className="visit-policy-settings__signers">
            <h3>Licensed medication clerks</h3>
            <p>
              Grant access after verifying medication-clerk authorization. Reception is view-only
              without this grant; technicians, veterinarians, and owners have access by role.
            </p>
            {medicationClerks.map((staff) => (
              <label className="visit-policy-settings__toggle" key={staff.id}>
                <input
                  type="checkbox"
                  checked={staff.canManageMedications}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.checked;
                    void save(
                      staff.id,
                      `/api/staff/${staff.id}/medication-permission`,
                      { canManageMedications: next },
                      () =>
                        setMedicationClerks((current) =>
                          current.map((entry) =>
                            entry.id === staff.id
                              ? { ...entry, canManageMedications: next }
                              : entry,
                          ),
                        ),
                      'Medication-clerk permission saved.',
                    );
                  }}
                />
                <span>
                  <strong>{staff.displayName}</strong>
                  <small>{staff.jobTitle ?? staff.role}</small>
                </span>
              </label>
            ))}
            {!medicationClerks.length && !error ? (
              <p className="admin-empty">No reception or assistant staff at this location.</p>
            ) : null}
          </div>
        </>
      ) : null}
      {pending ? <p role="status">Saving…</p> : null}
      {message ? (
        <p className="admin-feedback" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
