'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MedicationsSummary, PatientMedicationSummary } from '../lib/patient-types';
import { MedicationPrescriberField } from './medication-prescriber-field';

const EMPTY_FORM = { catalogItemId: '', medicationName: '', genericName: '', strength: '', dose: '', route: '', frequency: '', instructions: '', startDate: '', endDate: '', status: 'Active', prescribedBy: '', source: '' };

function dateLine(value: string | null) {
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : null;
}

function formFromMedication(medication: PatientMedicationSummary) {
  return {
    catalogItemId: medication.catalogItemId ?? '', medicationName: medication.medicationName,
    genericName: medication.genericName ?? '', strength: medication.strength ?? '', dose: medication.dose ?? '',
    route: medication.route ?? '', frequency: medication.frequency ?? '', instructions: medication.instructions ?? '',
    startDate: medication.startDate ? medication.startDate.slice(0, 10) : '', endDate: medication.endDate ? medication.endDate.slice(0, 10) : '',
    status: medication.status, prescribedBy: medication.prescribedBy ?? '', source: medication.source ?? '',
  };
}

function readError(value: unknown, fallback: string) {
  return value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' ? value.message : fallback;
}

export function PatientMedicationsPanel({ patientId, medications }: { patientId: string; medications: MedicationsSummary }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [refillReview, setRefillReview] = useState<PatientMedicationSummary | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);
  const [action, setAction] = useState<{ medicationId: string; type: 'discontinue' | 'reaction'; text: string } | null>(null);

  const activeMedications = medications.items.filter((item) => item.status === 'Active');
  const pastMedications = medications.items.filter((item) => item.status !== 'Active');
  const suggestions = useMemo(() => {
    const query = form.medicationName.trim().toLowerCase();
    if (!query) return medications.catalog.slice(0, 8);
    return medications.catalog.filter((item) => [item.name, item.strength, item.form].filter(Boolean).join(' ').toLowerCase().includes(query)).slice(0, 8);
  }, [form.medicationName, medications.catalog]);
  const selectedCatalogItem = medications.catalog.find((item) => item.id === form.catalogItemId) ?? null;

  function selectMedication(item: MedicationsSummary['catalog'][number]) {
    setForm((current) => ({ ...current, catalogItemId: item.id, medicationName: item.name, strength: item.strength ?? '', route: item.route ?? '', frequency: item.defaultFrequency ?? '' }));
    setSuggestionsOpen(false); setHighlightedSuggestion(0);
  }

  function beginCreate() { setRefillReview(null); setEditingId('new'); setForm(EMPTY_FORM); setError(null); }
  function beginEdit(medication: PatientMedicationSummary) { setEditingId(medication.id); setForm(formFromMedication(medication)); setError(null); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    if (editingId === 'new' && !form.catalogItemId) { setError('Select a medication configured in Hospital Inventory.'); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch(editingId === 'new' ? `/api/patients/${patientId}/medications` : `/api/patients/${patientId}/medications/${editingId}`, {
        method: editingId === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not save this medication.'));
      setRefillReview((current) => current?.id === editingId ? { ...current, ...payload } : current);
      setEditingId(null); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this medication.'); }
    finally { setSaving(false); }
  }

  async function perform(url: string, body?: object) {
    setSaving(true); setError(null);
    try {
      const response = await fetch(url, { method: 'POST', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not update this medication.'));
      setAction(null); router.refresh();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this medication.'); }
    finally { setSaving(false); }
  }

  // Render inline so typing does not recreate a component type and remount its textarea.
  function renderMedicationList({ items, empty, discontinued = false }: { items: PatientMedicationSummary[]; empty: string; discontinued?: boolean }) {
    if (!items.length) return <p className="empty-state">{empty}</p>;
    return <div className={`patient-medication-list${discontinued ? ' patient-medication-list--discontinued' : ''}`}>{items.map((medication) => (
      <article key={medication.id} className={`patient-medication-card${medication.status === 'Discontinued' ? ' patient-medication-card--discontinued' : ''}`}>
        <div><div className="patient-medication-card__title"><strong>{medication.medicationName}</strong><span className={`medication-status medication-status--${medication.status.toLowerCase()}`}>{medication.status}</span></div>
          {[medication.strength, medication.form, medication.route, medication.frequency].filter(Boolean).length ? <p>{[medication.strength, medication.form, medication.route, medication.frequency].filter(Boolean).join(' · ')}</p> : null}
          {medication.dose || medication.instructions ? <p>{[medication.dose, medication.instructions].filter(Boolean).join(' · ')}</p> : null}
          <small>Started {dateLine(medication.startDate) ?? 'date not recorded'}{medication.lastRefilledAt ? ` · Last refill ${dateLine(medication.lastRefilledAt)} (${medication.refillCount})` : ''}{medication.endDate ? ` · Ended ${dateLine(medication.endDate)}` : ''}</small>
          {medication.discontinueReason ? <p className="patient-medication-card__reason"><strong>Discontinued:</strong> {medication.discontinueReason}</p> : null}
          {medication.reactionNotes ? <p className="patient-medication-card__reaction"><strong>Reaction:</strong> {medication.reactionNotes}</p> : null}
        </div>
        {medications.permissions.canManage ? <div className="patient-medication-card__actions"><button type="button" className="button-secondary" onClick={() => beginEdit(medication)}>Edit</button>{medication.status === 'Active' ? <><button type="button" className="button-secondary" disabled={saving} onClick={() => { setRefillReview(medication); setError(null); }}>Refill</button><button type="button" className="button-secondary" onClick={() => setAction({ medicationId: medication.id, type: 'reaction', text: '' })}>Flag reaction</button><button type="button" className="button-secondary" onClick={() => setAction({ medicationId: medication.id, type: 'discontinue', text: '' })}>Discontinue</button></> : null}</div> : null}
        {action?.medicationId === medication.id ? <form className="patient-medication-action" onSubmit={(event) => { event.preventDefault(); void perform(`/api/patients/${patientId}/medications/${medication.id}/${action.type}`, action.type === 'reaction' ? { reaction: action.text } : { reason: action.text }); }}><label>{action.type === 'reaction' ? 'Describe the reaction' : 'Reason for discontinuation'}<textarea required autoFocus value={action.text} onChange={(event) => setAction({ ...action, text: event.target.value })} /></label><div><button type="button" className="button-secondary" onClick={() => setAction(null)}>Cancel</button><button className="button-primary" disabled={saving}>{saving ? 'Saving…' : action.type === 'reaction' ? 'Flag reaction' : 'Discontinue medication'}</button></div></form> : null}
      </article>
    ))}</div>;
  }

  return <section className="profile-card profile-card--wide profile-card--medications" aria-label="Medications">
    <div className="profile-card__header profile-card__header--with-action"><div><p className="eyebrow">Medication profile</p><h2 id="medications-heading">Medications</h2></div>{!editingId && !refillReview && medications.permissions.canManage ? <button type="button" className="button-primary" onClick={beginCreate}>Add Medication</button> : null}</div>
    {!medications.permissions.canManage ? <p className="profile-permission-note">Medication details are view-only. A medication clerk, technician, veterinarian, or owner can make changes.</p> : null}
    {editingId ? <form className="patient-inline-form patient-medication-form" onSubmit={submit}>
      <label>Medication<div className="patient-medication-autocomplete"><input value={form.medicationName} onChange={(event) => { setForm((current) => ({ ...current, catalogItemId: '', medicationName: event.target.value })); setHighlightedSuggestion(0); setSuggestionsOpen(true); }} onFocus={() => setSuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)} onKeyDown={(event) => { if (event.key === 'Escape') { setSuggestionsOpen(false); return; } if (!suggestionsOpen || !suggestions.length) return; if (event.key === 'ArrowDown') { event.preventDefault(); setHighlightedSuggestion((value) => Math.min(value + 1, suggestions.length - 1)); } else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlightedSuggestion((value) => Math.max(value - 1, 0)); } else if (event.key === 'Enter') { event.preventDefault(); const item = suggestions[highlightedSuggestion]; if (item) selectMedication(item); } }} role="combobox" aria-activedescendant={suggestionsOpen && suggestions[highlightedSuggestion] ? `patient-medication-option-${suggestions[highlightedSuggestion]!.id}` : undefined} aria-controls="patient-medication-catalog-options" aria-expanded={suggestionsOpen && suggestions.length > 0} required autoFocus placeholder="Search hospital medication inventory" />{suggestionsOpen && suggestions.length ? <div id="patient-medication-catalog-options" className="patient-medication-suggestions" role="listbox">{suggestions.map((item, index) => <button key={item.id} id={`patient-medication-option-${item.id}`} type="button" role="option" aria-selected={index === highlightedSuggestion} className={index === highlightedSuggestion ? 'is-highlighted' : undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMedication(item)}><strong>{item.name}</strong><small>{[item.strength, item.form, item.route, item.defaultFrequency].filter(Boolean).join(' · ')}</small></button>)}</div> : null}</div></label>
      {suggestionsOpen && suggestions.length === 0 ? <p role="status">{medications.catalog.length ? 'No matching hospital medications. Try a different name.' : 'No hospital medications are configured yet.'}</p> : null}
      {selectedCatalogItem ? <div className="patient-medication-preset"><span>Hospital preset</span><strong>{[selectedCatalogItem.strength, selectedCatalogItem.form].filter(Boolean).join(' · ') || 'No strength/form set'}</strong><small>{[selectedCatalogItem.route, selectedCatalogItem.defaultFrequency].filter(Boolean).join(' · ') || 'No route/frequency set'}</small></div> : null}
      <div className="patient-inline-form__grid"><label>Dose<input value={form.dose} onChange={(event) => setForm((current) => ({ ...current, dose: event.target.value }))} /></label><MedicationPrescriberField value={form.prescribedBy} onChange={(value) => setForm((current) => ({ ...current, prescribedBy: value }))} /></div>
      <label>Instructions<textarea rows={3} value={form.instructions} onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}<div className="front-desk-actions"><button type="button" className="button-secondary" onClick={() => setEditingId(null)} disabled={saving}>Cancel</button><button className="button-primary" disabled={saving}>{saving ? 'Saving…' : editingId === 'new' ? 'Add medication' : 'Save medication'}</button></div>
    </form> : null}
    {error && !editingId ? <p className="form-error" role="alert">{error}</p> : null}
    {!editingId && refillReview ? <section className="patient-refill-review" aria-label="Review refill">
      <h3>Review refill</h3>
      <strong>{[refillReview.medicationName, refillReview.strength, refillReview.form].filter(Boolean).join(' · ')}</strong>
      <dl>
        <div><dt>Dose</dt><dd>{refillReview.dose || 'Not recorded'}</dd></div>
        <div><dt>Route / frequency</dt><dd>{[refillReview.route, refillReview.frequency].filter(Boolean).join(' · ') || 'Not recorded'}</dd></div>
        <div><dt>Prescribed by</dt><dd>{refillReview.prescribedBy || 'Not recorded'}</dd></div>
        <div><dt>Instructions</dt><dd>{refillReview.instructions || 'Not recorded'}</dd></div>
      </dl>
      <p>Recording adds a refill to medication history and may add a charge to the active visit. Stock dispensing and label printing are not available here yet.</p>
      <div className="front-desk-actions">
        <button type="button" className="button-secondary" disabled={saving} onClick={() => { setRefillReview(null); setError(null); }}>Cancel</button>
        <button type="button" className="button-secondary" disabled={saving} onClick={() => beginEdit(refillReview)}>Edit medication</button>
        <button type="button" className="button-primary" disabled={saving || refillReview.status !== 'Active'} onClick={async () => { if (await perform(`/api/patients/${patientId}/medications/${refillReview.id}/refill`)) setRefillReview(null); }}>{saving ? 'Recording…' : 'Record refill'}</button>
      </div>
    </section> : null}
    {!editingId && !refillReview ? medications.items.length === 0 && !medications.legacyNotes ? <div className="profile-compact-empty profile-compact-empty--roomy"><strong>No active medications on file</strong><span>Recorded medications and their history will appear here.</span></div> : <div className="patient-medications-sections"><section><h3>Active medications</h3>{renderMedicationList({ items: activeMedications, empty: 'No active medications.' })}</section><section className="patient-medications-discontinued"><h3>Discontinued medications</h3>{renderMedicationList({ items: pastMedications, empty: 'No discontinued medications.', discontinued: true })}</section>{medications.legacyNotes ? <aside className="patient-medication-legacy"><strong>Legacy medication / allergy note</strong><p>{medications.legacyNotes.notes}</p><Link href={`/visits/${medications.legacyNotes.visitId}`}>Updated {dateLine(medications.legacyNotes.recordedAt)}</Link></aside> : null}</div> : null}
  </section>;
}
