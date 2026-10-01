'use client';
import { useRef, useState, type FormEvent } from 'react';
import {
  useDashboardStatusColors,
  type DashboardStatusColor,
} from '../../lib/use-dashboard-status-colors';

export function DashboardStatusColorsSection() {
  const { colors, canManage, loading, error, reload } = useDashboardStatusColors();
  const editButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  function closeEditor() {
    if (draft) editButtons.current[draft.id]?.focus();
    setDraft(null);
  }
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
      closeEditor();
      setMessage('Status appearance saved.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save status appearance.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="settings-section admin-workflow"
      aria-labelledby="settings-statuses-heading"
    >
      <h2 id="settings-statuses-heading">Visit workflow</h2>
      <p>
        Personalize how each step appears to your team. Sparki keeps the order and clinical
        safeguards consistent.
      </p>
      {loading ? <p role="status">Loading workflow…</p> : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" disabled={loading || saving} onClick={() => void reload()}>
            Try again
          </button>
        </div>
      ) : null}
      <div className="admin-workflow__list">
        {colors?.map((entry, index) => (
          <article className="admin-workflow__row" key={entry.id}>
            <span className="admin-workflow__number" aria-label={`Step ${index + 1}`}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="scheduler-type-card__main">
              <span
                className="scheduler-type-card__swatch"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <div>
                <strong>{entry.name}</strong>
                <span>
                  {entry.description ||
                    (entry.name !== entry.status.replace(/([a-z])([A-Z])/g, '$1 $2')
                      ? entry.status.replace(/([a-z])([A-Z])/g, '$1 $2')
                      : null)}
                </span>
              </div>
            </div>
            {canManage ? (
              <button
                type="button"
                className="button-secondary"
                disabled={saving || Boolean(draft && draft.id !== entry.id)}
                ref={(node) => {
                  editButtons.current[entry.id] = node;
                }}
                aria-label={`Edit ${entry.name}`}
                aria-expanded={draft?.id === entry.id}
                onClick={() => {
                  if (draft) return;
                  setDraft(entry);
                  setMessage(null);
                }}
              >
                Edit
              </button>
            ) : null}
            {draft?.id === entry.id ? (
              <form className="admin-inline-editor" onSubmit={save}>
                <fieldset disabled={saving} className="admin-form-grid">
                  <legend>
                    Edit {draft.status.replace(/([a-z])([A-Z])/g, '$1 $2')} appearance
                  </legend>
                  <label>
                    Status name
                    <input
                      autoFocus
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
                  <div className="admin-form-actions">
                    <button className="button-primary" type="submit">
                      {saving ? 'Saving…' : 'Save appearance'}
                    </button>
                    <button className="button-secondary" type="button" onClick={closeEditor}>
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : null}
          </article>
        ))}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
