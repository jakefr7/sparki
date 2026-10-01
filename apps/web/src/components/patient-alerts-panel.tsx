'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PatientAlertSummary } from '../lib/patient-types';

const CATEGORIES = ['Behavior', 'Allergy', 'Handling', 'Medical', 'BillingAdmin', 'Other'];
const SEVERITIES = ['Info', 'Caution', 'Critical'];

function categoryLabel(category: string) {
  return category === 'BillingAdmin' ? 'Billing / Admin' : category;
}

function dateLine(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PatientAlertsPanel({
  patientId,
  alerts,
  legacyAlert,
}: {
  patientId: string;
  alerts: PatientAlertSummary[];
  legacyAlert: string | null;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('Handling');
  const [severity, setSeverity] = useState('Caution');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function beginCreate(initialMessage = '') {
    setEditingId('new');
    setMessage(initialMessage);
    setCategory('Handling');
    setSeverity('Caution');
    setError(null);
  }

  function beginEdit(alert: PatientAlertSummary) {
    setEditingId(alert.id);
    setMessage(alert.message);
    setCategory(alert.category);
    setSeverity(alert.severity);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    if (!message.trim()) {
      setError('Enter alert text.');
      return;
    }
    setSaving(true);
    setError(null);

    const url =
      editingId === 'new'
        ? `/api/patients/${patientId}/alerts`
        : `/api/patients/${patientId}/alerts/${editingId}`;
    const method = editingId === 'new' ? 'POST' : 'PATCH';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, category, severity }),
      });
      if (!response.ok) throw new Error('alert save failed');
      setEditingId(null);
      router.refresh();
    } catch {
      setError('Something went wrong saving this alert. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function archiveAlert(alertId: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/patients/${patientId}/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!response.ok) throw new Error('alert archive failed');
      router.refresh();
    } catch {
      setError('Something went wrong archiving this alert. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="profile-card profile-card--wide patient-alerts-panel"
      aria-labelledby="patient-alerts-heading"
    >
      <div className="profile-card__header profile-card__header--with-action">
        <div>
          <p className="eyebrow">Care flags</p>
          <h2 id="patient-alerts-heading">Care Alerts</h2>
        </div>
        {!editingId ? (
          <button
            type="button"
            className="button-primary"
            onClick={() => beginCreate()}
            disabled={saving}
          >
            Add Alert
          </button>
        ) : null}
      </div>

      {editingId ? (
        <form className="patient-inline-form patient-alert-form" onSubmit={submit}>
          <label>
            Alert text
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="e.g. Caution handling - owner reports biting when nervous"
              autoFocus
              required
            />
          </label>
          <div className="patient-inline-form__grid">
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {categoryLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Severity
              <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                {SEVERITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="front-desk-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setEditingId(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? 'Saving...' : editingId === 'new' ? 'Add alert' : 'Save alert'}
            </button>
          </div>
        </form>
      ) : null}

      {error && !editingId ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {!editingId ? (
        alerts.length > 0 ? (
          <div className="patient-alert-card-list">
            {alerts.map((alert) => (
              <article
                key={alert.id}
                className={`patient-alert-card patient-alert-card--${alert.severity.toLowerCase()}`}
              >
                <div className="patient-alert-card__body">
                  <div className="patient-alert-card__chips">
                    <span>{alert.severity}</span>
                    <span>{categoryLabel(alert.category)}</span>
                  </div>
                  <p>{alert.message}</p>
                  <small>
                    Updated {dateLine(alert.updatedAt)}
                    {alert.createdAt !== alert.updatedAt
                      ? ` - Created ${dateLine(alert.createdAt)}`
                      : ''}
                  </small>
                </div>
                <div className="patient-alert-card__actions">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => beginEdit(alert)}
                    disabled={saving}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => archiveAlert(alert.id)}
                    disabled={saving}
                  >
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : legacyAlert ? (
          <div className="patient-alert-card-list">
            <article className="patient-alert-card patient-alert-card--legacy">
              <div className="patient-alert-card__body">
                <div className="patient-alert-card__chips">
                  <span>Caution</span>
                  <span>Legacy note</span>
                </div>
                <p>{legacyAlert}</p>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => beginCreate(legacyAlert)}
              >
                Convert to alert
              </button>
            </article>
          </div>
        ) : (
          <div className="profile-compact-empty profile-compact-empty--roomy">
            <strong>No active alerts</strong>
            <span>
              Add an alert for handling notes, allergies, behavior warnings, or care precautions.
            </span>
          </div>
        )
      ) : null}
    </section>
  );
}
