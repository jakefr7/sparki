'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useDashboardStatusColors, type DashboardStatusColor } from '../../lib/use-dashboard-status-colors';

const EMPTY_STATUS: DashboardStatusColor = { id: '', status: '', name: '', description: '', color: '#1FA9A0', sortOrder: 100 };

export function DashboardStatusColorsSection() {
  const { colors, canManage, loading, reload } = useDashboardStatusColors();
  const [draft, setDraft] = useState<DashboardStatusColor | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.name.trim()) return;
    setSaving(true);
    const response = await fetch('/api/dashboard-status-colors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draft.id || undefined, name: draft.name, description: draft.description, color: draft.color, sortOrder: draft.sortOrder }),
    });
    if (response.ok) { await reload(); setDraft(null); setMessage('Status saved.'); }
    else setMessage('Could not save status.');
    setSaving(false);
  }

  async function remove(entry: DashboardStatusColor) {
    if (!window.confirm(`Delete “${entry.name}”?`)) return;
    const response = await fetch(`/api/dashboard-status-colors/${entry.id}`, { method: 'DELETE' });
    if (response.ok) { await reload(); setMessage('Status deleted.'); }
    else setMessage('Could not delete status.');
  }

  return <section className="settings-section" aria-labelledby="settings-statuses-heading">
    <div className="scheduler-settings-card__header">
      <div><h1 id="settings-statuses-heading">Statuses</h1><p className="settings-section__intro">Customize the workflow statuses used across the dashboard.</p></div>
      {canManage ? <button type="button" className="scheduler-primary-action" onClick={() => setDraft({ ...EMPTY_STATUS, sortOrder: ((colors?.length ?? 0) + 1) * 10 })}>Add Status</button> : null}
    </div>
    {!loading && !canManage ? <div className="scheduler-settings-lock"><strong>View only</strong><span>Only users with admin settings permission can change statuses.</span></div> : null}
    <div className="scheduler-type-list">
      {(colors ?? []).map((entry) => <article key={entry.id} className="scheduler-type-card">
        <div className="scheduler-type-card__main"><span className="scheduler-type-card__swatch" style={{ backgroundColor: entry.color }} aria-hidden="true"/><div><strong>{entry.name}</strong><span>{entry.description || 'No description'}</span></div></div>
        <span className="scheduler-type-preview" style={{ '--scheduler-preview-color': entry.color } as CSSProperties}>Preview</span>
        {canManage ? <><button type="button" className="button-secondary" onClick={() => setDraft(entry)}>Edit</button><button type="button" className="button-secondary" onClick={() => void remove(entry)}>Delete</button></> : null}
      </article>)}
    </div>
    {draft ? <form className="scheduler-type-editor status-editor" onSubmit={save}>
      <label><span>Status name</span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
      <label><span>Description</span><input value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label><span>Color</span><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label>
      <label><span>Order</span><input type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} /></label>
      <div className="scheduler-type-editor__actions"><button className="scheduler-primary-action" disabled={saving}>{saving ? 'Saving…' : 'Save Status'}</button><button type="button" className="button-secondary" onClick={() => setDraft(null)}>Cancel</button></div>
    </form> : null}
    {message ? <p className="settings-save-message" role="status">{message}</p> : null}
  </section>;
}
