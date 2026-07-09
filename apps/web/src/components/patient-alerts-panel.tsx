'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_LENGTH = 2000;

/** Patient profile "Alerts" tab — the only place a patient's alert text is
 *  entered/edited. The header badge and the alert strip on the profile page
 *  both just read patient.alerts; this is where it's written. */
export function PatientAlertsPanel({
  patientId,
  alerts,
}: {
  patientId: string;
  alerts: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alerts ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function beginEdit() {
    setDraft(alerts ?? '');
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts: draft.trim() || null }),
      });
      if (!response.ok) {
        throw new Error('alerts update failed');
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError('Something went wrong saving this alert. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-card profile-card--wide" aria-labelledby="patient-alerts-heading">
      <div className="profile-card__header">
        <p className="eyebrow">Care flags</p>
        <h2 id="patient-alerts-heading">Alerts</h2>
      </div>

      {editing ? (
        <form className="front-desk-form" onSubmit={handleSave}>
          <label htmlFor="patient-alerts-textarea">
            Allergies, handling notes, and care cautions
            <textarea
              id="patient-alerts-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_LENGTH}
              rows={6}
              placeholder="e.g. Allergic to penicillin. Muzzle for nail trims."
              autoFocus
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="front-desk-actions">
            <button type="button" className="button-secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save alert'}
            </button>
          </div>
        </form>
      ) : alerts ? (
        <div className="patient-alerts-current">
          <p>{alerts}</p>
          <button type="button" className="button-secondary" onClick={beginEdit}>
            Edit alert
          </button>
        </div>
      ) : (
        <div className="profile-compact-empty">
          <strong>No alerts on file.</strong>
          <span>Allergies, handling notes, and care cautions can be recorded here.</span>
          <button type="button" className="button-primary" onClick={beginEdit}>
            Add alert
          </button>
        </div>
      )}
    </section>
  );
}
