'use client';

import { useState, type CSSProperties } from 'react';
import {
  DASHBOARD_STATUS_LABELS,
  useDashboardStatusColors,
  type DashboardStatusColor,
  type DashboardStatusKey,
} from '../../lib/use-dashboard-status-colors';

const STATUS_DESCRIPTIONS: Record<DashboardStatusKey, string> = {
  Upcoming: 'Appointments scheduled but not yet arrived.',
  CheckedIn: 'Patients checked in and waiting.',
  InRoom: 'Patients roomed for intake or exam.',
  ReadyForCheckout: 'Patients ready for payment and checkout.',
  Completed: 'Visits that have finished.',
};

export function DashboardStatusColorsSection() {
  const { colors, canManage, loading, reload } = useDashboardStatusColors();
  const [editingStatus, setEditingStatus] = useState<DashboardStatusKey | null>(null);
  const [draftColor, setDraftColor] = useState('#000000');
  const [saving, setSaving] = useState<DashboardStatusKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function beginEdit(entry: DashboardStatusColor) {
    setEditingStatus(entry.status);
    setDraftColor(entry.color);
    setMessage(null);
  }

  async function saveColor(status: DashboardStatusKey) {
    setSaving(status);
    setMessage(null);
    const response = await fetch('/api/dashboard-status-colors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, color: draftColor }),
    });
    if (response.ok) {
      await reload();
      setEditingStatus(null);
      setMessage('Status color updated.');
    } else {
      setMessage('Could not update status color.');
    }
    setSaving(null);
  }

  return (
    <section className="settings-section" aria-labelledby="settings-dashboard-colors-heading">
      <h1 id="settings-dashboard-colors-heading">Dashboard Status Colors</h1>
      <p className="settings-section__intro">
        Set the pill color shown for each Currently in Clinic status on the dashboard.
      </p>

      {!loading && !canManage ? (
        <div className="scheduler-settings-lock">
          <strong>View only</strong>
          <span>
            You can view dashboard status colors, but only users with admin settings permission can
            edit them.
          </span>
        </div>
      ) : null}

      <div className="scheduler-type-list">
        {(colors ?? []).map((entry) => {
          const isEditing = editingStatus === entry.status;
          const displayColor = isEditing ? draftColor : entry.color;
          return (
            <article key={entry.status} className="scheduler-type-card">
              <div className="scheduler-type-card__main">
                <span
                  className="scheduler-type-card__swatch"
                  style={{ backgroundColor: displayColor }}
                  aria-hidden="true"
                />
                <div>
                  <strong>{DASHBOARD_STATUS_LABELS[entry.status]}</strong>
                  <span>{STATUS_DESCRIPTIONS[entry.status]}</span>
                </div>
              </div>
              <span
                className="scheduler-type-preview"
                style={{ '--scheduler-preview-color': displayColor } as CSSProperties}
              >
                Preview
              </span>
              <span className={entry.isCustom ? 'scheduler-type-state scheduler-type-state--active' : 'scheduler-type-state'}>
                {entry.isCustom ? 'Custom' : 'Default'}
              </span>
              {canManage ? (
                <button type="button" className="button-secondary" onClick={() => beginEdit(entry)}>
                  Edit
                </button>
              ) : null}
              {isEditing ? (
                <form
                  className="scheduler-type-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveColor(entry.status);
                  }}
                >
                  <label>
                    <span>Color</span>
                    <input
                      type="color"
                      value={draftColor}
                      onChange={(event) => setDraftColor(event.target.value)}
                    />
                  </label>
                  <div className="scheduler-type-editor__actions">
                    <button type="submit" className="scheduler-primary-action" disabled={saving === entry.status}>
                      {saving === entry.status ? 'Saving...' : 'Save changes'}
                    </button>
                    <button type="button" className="button-secondary" onClick={() => setEditingStatus(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>

      {message ? <p className="settings-save-message">{message}</p> : null}
    </section>
  );
}
