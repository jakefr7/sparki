'use client';
import { useState, type FormEvent } from 'react';
import {
  useDashboardStatusColors,
  type DashboardStatusColor,
} from '../../lib/use-dashboard-status-colors';

export function DashboardStatusColorsSection() {
  const { colors, canManage, loading, error, reload } = useDashboardStatusColors();
  const [draft, setDraft] = useState<DashboardStatusColor | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/dashboard-status-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          description: draft.description,
          color: draft.color,
        }),
      });
      if (!response.ok)
        throw new Error('Could not save status appearance. Your edits are retained.');
      setDraft(null);
      setMessage('Status appearance saved.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save status appearance.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="settings-section" aria-labelledby="settings-statuses-heading">
      <h2 id="settings-statuses-heading">Visit workflow</h2>
      <p>
        Sparki manages the workflow order, transitions, and clinical safeguards. Customize the names
        and colors your team sees.
      </p>
      {loading ? <p role="status">Loading workflow…</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" disabled={loading || saving} onClick={() => void reload()}>Try again</button></div> : null}
      <div className="scheduler-type-list">
        {colors?.map((entry) => (
          <article className="scheduler-type-card" key={entry.id}>
            <div className="scheduler-type-card__main">
              <span
                className="scheduler-type-card__swatch"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <div>
                <strong>{entry.name}</strong>
                <span>
                  {entry.status.replace(/([a-z])([A-Z])/g, '$1 $2')} ·{' '}
                  {entry.description || 'Sparki workflow step'}
                </span>
              </div>
            </div>
            {canManage ? (
              <button
                type="button"
                className="button-secondary"
                disabled={saving}
                onClick={() => {
                  setDraft(entry);
                  setMessage(null);
                }}
              >
                Edit {entry.name}
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {draft ? (
        <form className="scheduler-type-editor" onSubmit={save}>
          <fieldset disabled={saving}>
            <legend>Edit {draft.status.replace(/([a-z])([A-Z])/g, '$1 $2')} appearance</legend>
            <label>
              Status name
              <input
                required
                maxLength={80}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              Description
              <input
                maxLength={240}
                value={draft.description ?? ''}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>
            <label>
              Color
              <input
                type="color"
                value={draft.color}
                onChange={(event) => setDraft({ ...draft, color: event.target.value })}
              />
            </label>
            <button type="submit">{saving ? 'Saving…' : 'Save appearance'}</button>
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </fieldset>
        </form>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
