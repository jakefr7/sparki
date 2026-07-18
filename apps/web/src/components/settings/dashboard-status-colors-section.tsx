'use client';

import { Fragment, useState, type CSSProperties, type FormEvent } from 'react';
import { useDashboardStatusColors, type DashboardStatusColor } from '../../lib/use-dashboard-status-colors';

const EMPTY_STATUS: DashboardStatusColor = { id: '', status: '', name: '', description: '', color: '#1FA9A0', sortOrder: 100, isEnabled: true, isInClinic: false, allowedTransitionKeys: [], lifecyclePhase: 'Arrived' };

const LIFECYCLE_PHASES: Array<{ value: DashboardStatusColor['lifecyclePhase']; label: string }> = [
  { value: 'Arrived', label: 'Arrival / waiting' },
  { value: 'Intake', label: 'Intake' },
  { value: 'Exam', label: 'Veterinarian exam' },
  { value: 'PlanAndApproval', label: 'Plan and client approval' },
  { value: 'CareInProgress', label: 'Diagnostics / treatment' },
  { value: 'Discharge', label: 'Discharge / checkout' },
  { value: 'RecordClosure', label: 'Medical record closure' },
];

function PlusIcon() { return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function PencilIcon() { return <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true"><path d="M13.4 3.6a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7.5 15.5l-3.3.8.8-3.3L13.4 3.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>; }
function TrashIcon() { return <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true"><path d="M4.5 6h11M8 6V4.6c0-.55.45-1 1-1h2c.55 0 1 .45 1 1V6m-6.5 0 .6 9.1c.04.7.62 1.2 1.32 1.2h5.16c.7 0 1.28-.5 1.32-1.2L14.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>; }

export function DashboardStatusColorsSection() {
  const { colors, canManage, loading, reload } = useDashboardStatusColors();
  const [draft, setDraft] = useState<DashboardStatusColor | null>(null);
  const [editorClosing, setEditorClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.name.trim()) return;
    setSaving(true);
    const response = await fetch('/api/dashboard-status-colors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draft.id || undefined, name: draft.name, description: draft.description, color: draft.color, sortOrder: draft.sortOrder, isEnabled: draft.isEnabled, isInClinic: draft.isInClinic, allowedTransitionKeys: draft.allowedTransitionKeys, lifecyclePhase: draft.lifecyclePhase }),
    });
    if (response.ok) { await reload(); setDraft(null); setMessage('Status saved.'); }
    else {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(body?.message ?? 'Could not save status.');
    }
    setSaving(false);
  }

  async function remove(entry: DashboardStatusColor) {
    if (!window.confirm(`Delete “${entry.name}”?`)) return;
    const response = await fetch(`/api/dashboard-status-colors/${entry.id}`, { method: 'DELETE' });
    if (response.ok) { await reload(); setMessage('Status deleted.'); }
    else {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(body?.message ?? 'Could not delete status.');
    }
  }

  function openEditor(entry: DashboardStatusColor) {
    setEditorClosing(false);
    setDraft(entry);
  }

  function closeEditor() {
    setEditorClosing(true);
  }

  const positionStatuses = [...(colors ?? [])]
    .filter((entry) => entry.status !== draft?.status)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function placeDraftAfter(statusKey: string) {
    if (!draft) return;
    if (statusKey === '__first__') {
      setDraft({ ...draft, sortOrder: (positionStatuses[0]?.sortOrder ?? 10) - 10 });
      return;
    }
    const index = positionStatuses.findIndex((entry) => entry.status === statusKey);
    const current = positionStatuses[index];
    if (!current) return;
    const next = positionStatuses[index + 1];
    setDraft({ ...draft, sortOrder: next ? Math.floor((current.sortOrder + next.sortOrder) / 2) : current.sortOrder + 10 });
  }

  const positionValue = (() => {
    if (!draft || positionStatuses.length === 0 || draft.sortOrder < positionStatuses[0]!.sortOrder) return '__first__';
    return [...positionStatuses].reverse().find((entry) => entry.sortOrder < draft.sortOrder)?.status ?? '__first__';
  })();

  const editor = draft ? <form className={editorClosing ? 'scheduler-type-editor status-editor status-editor--closing' : 'scheduler-type-editor status-editor'} onSubmit={save} onAnimationEnd={() => { if (editorClosing) { setDraft(null); setEditorClosing(false); } }}>
    <div className="status-editor__heading"><div><span className="eyebrow">Status settings</span><h2>{draft.id ? `Edit ${draft.name}` : 'Create status'}</h2><p>Control how this status appears and where patients can move next.</p></div><span className="status-editor__preview" style={{ '--status-editor-color': draft.color } as CSSProperties}>{draft.name || 'Status preview'}</span></div>
    <div className="status-editor__details">
      <label className="status-editor__name"><span>Status name</span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
      <label className="status-editor__description"><span>Description</span><input value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Explain when this status is used" /></label>
      <label className="status-editor__phase"><span>Protected visit phase</span><select value={draft.lifecyclePhase} onChange={(event) => setDraft({ ...draft, lifecyclePhase: event.target.value as DashboardStatusColor['lifecyclePhase'] })}>{LIFECYCLE_PHASES.map((phase) => <option key={phase.value} value={phase.value}>{phase.label}</option>)}</select></label>
      <label className="status-editor__order"><span>Position in status workflow</span><select value={positionValue} onChange={(event) => placeDraftAfter(event.target.value)}><option value="__first__">Before {positionStatuses[0]?.name ?? 'all statuses'}</option>{positionStatuses.map((entry) => <option key={entry.status} value={entry.status}>After {entry.name}</option>)}</select></label>
      <label className="status-editor__color"><span>Color</span><span className="status-editor__color-control"><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /><strong>{draft.color.toUpperCase()}</strong></span></label>
    </div>
    <div className="status-editor__behavior"><div><h3>Behavior</h3><p>Choose where this status appears operationally.</p></div><label className="status-editor__switch"><input type="checkbox" checked={draft.isEnabled} onChange={(event) => setDraft({ ...draft, isEnabled: event.target.checked })} /><span aria-hidden="true"/><div><strong>Enabled</strong><small>Show this status throughout the application.</small></div></label><label className="status-editor__switch"><input type="checkbox" checked={draft.isInClinic} onChange={(event) => setDraft({ ...draft, isInClinic: event.target.checked })} /><span aria-hidden="true"/><div><strong>Include in Currently in Clinic</strong><small>Show patients here in the clinic list and count.</small></div></label></div>
    <fieldset className="status-editor__transitions"><legend>Allowed transitions</legend><p>Select the statuses staff may move to directly from {draft.name || 'this status'}.</p><div>{(colors ?? []).filter((entry) => entry.status !== draft.status).map((entry) => { const checked = draft.allowedTransitionKeys.includes(entry.status); return <label key={entry.status} className={checked ? 'status-editor__transition status-editor__transition--selected' : 'status-editor__transition'} style={{ '--status-editor-color': entry.color } as CSSProperties}><input type="checkbox" checked={checked} onChange={(event) => setDraft({ ...draft, allowedTransitionKeys: event.target.checked ? [...draft.allowedTransitionKeys, entry.status] : draft.allowedTransitionKeys.filter((key) => key !== entry.status) })} /><span aria-hidden="true"/><strong>{entry.name}</strong><small>{checked ? 'Allowed' : 'Not allowed'}</small></label>; })}</div></fieldset>
    <div className="scheduler-type-editor__actions status-editor__actions"><button className="scheduler-primary-action" disabled={saving || editorClosing}>{saving ? 'Saving…' : 'Save Status'}</button><button type="button" className="button-secondary" disabled={editorClosing} onClick={closeEditor}>Cancel</button></div>
  </form> : null;

  return <section className="settings-section" aria-labelledby="settings-statuses-heading">
    <div className="scheduler-settings-card__header">
      <div><h1 id="settings-statuses-heading">Statuses</h1><p className="settings-section__intro">Customize the workflow statuses used across the dashboard.</p></div>
      <div className="settings-section-header-actions">
        {canManage ? <button type="button" className="schedule-block-icon-button schedule-block-icon-button--add" aria-label="Add status" title="Add status" onClick={() => { setExpanded(true); openEditor({ ...EMPTY_STATUS, sortOrder: ((colors?.length ?? 0) + 1) * 10 }); }}><PlusIcon /></button> : null}
        <button type="button" className={expanded ? 'settings-collapse-button settings-collapse-button--expanded' : 'settings-collapse-button'} aria-expanded={expanded} aria-controls="status-settings-content" aria-label={expanded ? 'Collapse statuses' : 'Expand statuses'} onClick={() => setExpanded((current) => !current)}><span aria-hidden="true" /></button>
      </div>
    </div>
    <div id="status-settings-content" hidden={!expanded}>
    {!loading && !canManage ? <div className="scheduler-settings-lock"><strong>View only</strong><span>Only users with admin settings permission can change statuses.</span></div> : null}
    <div className="scheduler-type-list">
      {(colors ?? []).map((entry) => <Fragment key={entry.id}><article className={draft?.id === entry.id ? 'scheduler-type-card scheduler-type-card--editing' : 'scheduler-type-card'}>
        <div className="scheduler-type-card__main"><span className="scheduler-type-card__swatch" style={{ backgroundColor: entry.color }} aria-hidden="true"/><div><strong>{entry.name}</strong><span>{entry.description || 'No description'} · {entry.isEnabled ? 'Enabled' : 'Disabled'}{entry.isInClinic ? ' · In clinic' : ''}</span></div></div>
        <span className="scheduler-type-preview" style={{ '--scheduler-preview-color': entry.color } as CSSProperties}>Preview</span>
        {canManage ? <div className="settings-row-icon-actions"><button type="button" className="schedule-block-icon-button" aria-label={`Edit ${entry.name}`} title="Edit" onClick={() => openEditor(entry)}><PencilIcon /></button><button type="button" className="schedule-block-icon-button schedule-block-icon-button--danger" aria-label={`Delete ${entry.name}`} title="Delete" onClick={() => void remove(entry)}><TrashIcon /></button></div> : null}
      </article>{draft?.id === entry.id ? editor : null}</Fragment>)}
    </div>
    {draft && !draft.id ? <div className={editorClosing ? 'status-editor-modal status-editor-modal--closing' : 'status-editor-modal'} role="presentation" onMouseDown={closeEditor}><div className="status-editor-modal__panel" role="dialog" aria-modal="true" aria-label="Create status" onMouseDown={(event) => event.stopPropagation()}>{editor}</div></div> : null}
    {message ? <p className="settings-save-message" role="status">{message}</p> : null}
    </div>
  </section>;
}
