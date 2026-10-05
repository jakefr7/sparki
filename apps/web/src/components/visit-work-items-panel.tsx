'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

const CARE_TYPES = [['Treatment', 'Treatment'], ['Medication', 'Medication'], ['Diagnostic', 'Diagnostic'], ['FollowUp', 'Follow-up']] as const;
type Json = Record<string, unknown>;
type CarePlanDraft = { title: string; recommendation: string };

const CARE_TYPE_FIELDS = {
  Treatment: { name: 'Treatment name', placeholder: 'Enter treatment', details: 'What treatment is needed, and why?' },
  Medication: { name: 'Medication name', placeholder: 'Search this patient’s medications', details: 'What medication is needed, and why?' },
  Diagnostic: { name: 'Diagnostic name', placeholder: 'Enter test or diagnostic', details: 'What diagnostic is needed, and why?' },
  FollowUp: { name: 'Follow-up', placeholder: 'Enter follow-up needed', details: 'What follow-up is needed, and when?' },
} as const;

function object(value: unknown): Json { return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}; }
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function statusLabel(status: string) {
  if (status === 'Completed') return 'Completed';
  if (status === 'InProgress') return 'In progress';
  if (['Declined', 'Deferred', 'Cancelled'].includes(status)) return 'Not proceeding';
  return 'Ordered · ready for care';
}

export function VisitWorkItemsPanel({ visit, mode = 'plan' }: { visit: VisitDetail; mode?: 'plan' | 'care' }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [careType, setCareType] = useState('Treatment');
  const [title, setTitle] = useState('');
  const [orderedDose, setOrderedDose] = useState('');
  const [route, setRoute] = useState('');
  const [frequency, setFrequency] = useState('');
  const [medicationSuggestionsOpen, setMedicationSuggestionsOpen] = useState(false);
  const [highlightedMedication, setHighlightedMedication] = useState(0);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDrafts, setItemDrafts] = useState<Record<string, CarePlanDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const items = visit.workItems.filter((item) =>
    item.status !== 'Cancelled' &&
    CARE_TYPES.some(([type]) => type === item.type) &&
    (mode === 'plan' || ['Diagnostic', 'Treatment', 'Medication'].includes(item.type)),
  );
  const mayPlan = user?.role === 'OWNER' || user?.role === 'VETERINARIAN';
  const mayPerformClinicalWork = ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? '');
  const closed = ['Archived', 'ArchivedWithExceptions', 'Cancelled', 'NoShow'].includes(visit.state);
  const activeMedications = visit.patient.medications.filter((medication) => medication.status === 'Active' || !medication.status);
  const careTypeFields = CARE_TYPE_FIELDS[careType as keyof typeof CARE_TYPE_FIELDS];
  const medicationSuggestions = useMemo(() => {
    if (careType !== 'Medication' || !title.trim()) return [];
    return visit.patient.medicationCatalog.filter((name) => name.toLowerCase().includes(title.trim().toLowerCase())).slice(0, 8);
  }, [careType, title, visit.patient.medicationCatalog]);

  function updateMedicationName(value: string) {
    setTitle(value);
    setHighlightedMedication(0);
    if (careType !== 'Medication') return;
    const medication = activeMedications.find((item) =>
      [item.medicationName, item.genericName].filter(Boolean).some((name) => name?.toLowerCase() === value.trim().toLowerCase()),
    );
    if (!medication) return;
    // A medication selected from the patient's active list can safely carry
    // forward its existing directions. Never overwrite a clinician's edits.
    setOrderedDose((current) => current || medication.dose || '');
    setRoute((current) => current || medication.route || '');
    setFrequency((current) => current || medication.frequency || '');
  }

  function selectMedication(value: string) {
    updateMedicationName(value);
    setMedicationSuggestionsOpen(false);
    setHighlightedMedication(0);
  }

  async function request(url: string, method: string, body: Json) {
    setSaving(true); setError(null);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Could not save care-plan work.');
      setHasUnsavedChanges(false);
      router.refresh();
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save care-plan work.'); return false; }
    finally { setSaving(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const type = String(form.get('type'));
    const created = await request(`/api/visits/${visit.id}/work-items`, 'POST', {
      type, title: form.get('title'), assigneeRole: type === 'FollowUp' ? 'VETERINARIAN' : 'TECHNICIAN',
      plan: { recommendation: form.get('recommendation'), ...(type === 'Medication' ? { medication: {
        orderedDose: form.get('orderedDose') || undefined, route: form.get('route') || undefined,
        frequency: form.get('frequency') || undefined, duration: form.get('duration') || undefined,
        disposition: form.get('disposition') || undefined,
      } } : {}) },
    });
    if (created) {
      setCareType('Treatment');
      setTitle('');
      setOrderedDose('');
      setRoute('');
      setFrequency('');
      setMedicationSuggestionsOpen(false);
      formElement.reset();
    }
  }

  function beginEdit(item: VisitDetail['workItems'][number]) {
    const plan = object(object(item.result).plan);
    setItemDrafts((current) => ({ ...current, [item.id]: { title: item.title, recommendation: text(plan.recommendation) } }));
    setEditingItemId(item.id);
  }

  async function savePlanItem(item: VisitDetail['workItems'][number]) {
    const draft = itemDrafts[item.id];
    if (!draft) return;
    const saved = await request(`/api/visits/${visit.id}/work-items/${item.id}`, 'PUT', {
      status: item.status,
      title: draft.title,
      plan: { recommendation: draft.recommendation },
    });
    if (saved) setEditingItemId(null);
  }

  async function cancelPlanItem(item: VisitDetail['workItems'][number]) {
    const cancelled = await request(`/api/visits/${visit.id}/work-items/${item.id}`, 'PUT', {
      status: 'Cancelled',
      reason: 'Removed from treatment plan',
    });
    if (cancelled) setEditingItemId(null);
  }

  function execute(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    return request(`/api/visits/${visit.id}/work-items/${itemId}`, 'PUT', { status: 'Completed', execution: {
      note: form.get('note') || null, actualDose: form.get('actualDose') || null, route: form.get('route') || null,
      site: form.get('site') || null, quantity: form.get('quantity') || null, unit: form.get('unit') || null,
      concentration: form.get('concentration') || null, performedAt: new Date().toISOString(),
    } });
  }

  const headingId = mode === 'plan' ? 'care-plan-heading' : 'care-execution-heading';
  return <section id={mode === 'plan' ? 'visit-care-plan' : 'visit-care'} className={`visit-work-panel visit-work-panel--${mode}`} aria-labelledby={headingId} onChange={() => mode === 'plan' && setHasUnsavedChanges(true)}>
    <header className="visit-work-panel__header"><div><h2 id={headingId}>{mode === 'plan' ? 'Treatment Plan' : 'Care'}</h2><p>{mode === 'plan' ? 'Add the treatments, diagnostics, medications, and follow-up this patient needs.' : 'Document the care completed from the veterinarian’s treatment plan.'}</p></div>{items.length > 0 ? <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span> : null}</header>
    {mode === 'plan' && mayPlan && !closed ? <form className="visit-work-create" autoComplete="off" onSubmit={(event) => void create(event)}>
      <label>Type<select name="type" value={careType} onChange={(event) => setCareType(event.target.value)}>{CARE_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>{careTypeFields.name}<div className="visit-medication-autocomplete"><input name="title" required autoComplete="off" value={title} onFocus={() => setMedicationSuggestionsOpen(true)} onBlur={() => window.setTimeout(() => setMedicationSuggestionsOpen(false), 120)} onChange={(event) => updateMedicationName(event.target.value)} onKeyDown={(event) => { if (!medicationSuggestionsOpen || medicationSuggestions.length === 0) return; if (event.key === 'ArrowDown') { event.preventDefault(); setHighlightedMedication((index) => Math.min(index + 1, medicationSuggestions.length - 1)); } else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlightedMedication((index) => Math.max(index - 1, 0)); } else if (event.key === 'Enter') { const selection = medicationSuggestions[highlightedMedication]; if (selection) { event.preventDefault(); selectMedication(selection); } } else if (event.key === 'Escape') setMedicationSuggestionsOpen(false); }} placeholder={careTypeFields.placeholder} />{careType === 'Medication' && medicationSuggestionsOpen && medicationSuggestions.length ? <div className="visit-medication-suggestions" role="listbox">{medicationSuggestions.map((medication, index) => <button key={medication} type="button" role="option" aria-selected={index === highlightedMedication} className={index === highlightedMedication ? 'is-highlighted' : undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => selectMedication(medication)}>{medication}</button>)}</div> : null}</div></label>
      <label className="visit-work-create__recommendation">Plan details<textarea name="recommendation" rows={3} required autoComplete="off" placeholder={careTypeFields.details} /></label>
      <details className="visit-medication-options" hidden={careType !== 'Medication'}><summary>Medication details (optional)</summary><fieldset><legend className="sr-only">Medication details</legend><div><label>Ordered dose<input name="orderedDose" autoComplete="off" value={orderedDose} onChange={(event) => setOrderedDose(event.target.value)} /></label><label>Route<input name="route" autoComplete="off" value={route} onChange={(event) => setRoute(event.target.value)} /></label><label>Frequency<input name="frequency" autoComplete="off" value={frequency} onChange={(event) => setFrequency(event.target.value)} /></label><label>Duration<input name="duration" autoComplete="off" /></label><label>Disposition<select name="disposition"><option value="">Not applicable</option><option value="AdministeredInClinic">Administered in clinic</option><option value="DispensedTakeHome">Dispensed / take home</option></select></label></div></fieldset></details>
      <div className="visit-work-create__actions"><span className={`autosave-indicator autosave-indicator--${saving ? 'saving' : error ? 'error' : hasUnsavedChanges ? 'saving' : 'saved'}`} role="status"><span className="autosave-indicator__dot" aria-hidden="true" />{saving ? 'Saving…' : error ? 'Changes not saved' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}</span><button className="button-primary" disabled={saving}>{saving ? 'Adding…' : 'Add to treatment plan'}</button></div>
    </form> : null}
    <div className="visit-work-list">{items.length === 0 ? <div className="visit-work-empty"><strong>{mode === 'plan' ? 'No care added yet' : 'No care to complete'}</strong><span>{mode === 'plan' ? 'Add the first item above.' : 'Return to the treatment plan to add an order.'}</span></div> : items.map((item) => {
      const result = object(item.result); const plan = object(result.plan); const execution = object(result.execution);
      const canDocumentCare = mode === 'care' && mayPerformClinicalWork && !closed && ['Pending', 'InProgress'].includes(item.status);
      const canEditPlan = mode === 'plan' && mayPlan && !closed && item.status === 'Pending';
      const editing = editingItemId === item.id;
      const draft = itemDrafts[item.id];
      const dirty = Boolean(draft && (draft.title.trim() !== item.title || draft.recommendation.trim() !== text(plan.recommendation)));
      return <article key={item.id} className={`visit-work-item${editing ? ' visit-work-item--editing' : ''}`}><div><div className="visit-work-item__meta"><span>{item.type}</span>{mode === 'care' || item.status === 'Completed' ? <small className={`visit-work-item__status visit-work-item__status--${item.status.toLowerCase()}`}>{statusLabel(item.status)}</small> : null}</div>{editing && draft ? <div className="visit-work-item__edit-fields"><label>Title<input value={draft.title} autoComplete="off" onChange={(event) => setItemDrafts((current) => ({ ...current, [item.id]: { ...draft, title: event.target.value } }))} /></label><label>Plan details<textarea value={draft.recommendation} autoComplete="off" onChange={(event) => setItemDrafts((current) => ({ ...current, [item.id]: { ...draft, recommendation: event.target.value } }))} /></label></div> : <><strong>{item.title}</strong><p>{text(plan.recommendation)}</p></>}</div>
        {canEditPlan && !editing ? <button type="button" className="visit-work-item__edit" aria-label={`Edit ${item.title}`} title="Edit treatment-plan item" onClick={() => beginEdit(item)}>✎</button> : null}
        {editing ? <button type="button" className="visit-work-item__delete visit-work-item__delete--icon" aria-label={`Remove ${item.title} from the treatment plan`} title="Remove from treatment plan" disabled={saving} onClick={() => void cancelPlanItem(item)}>🗑︎</button> : null}
        {editing ? <div className="visit-work-item__edit-actions"><button type="button" className="visit-work-item__cancel" disabled={saving} onClick={() => setEditingItemId(null)}>Cancel</button><button type="button" className="button-primary" disabled={!dirty || saving || !draft?.title.trim() || !draft?.recommendation.trim()} onClick={() => void savePlanItem(item)}>Save</button></div> : null}
        {canDocumentCare ? <details><summary>{item.type === 'Diagnostic' ? 'Record test performed' : item.type === 'Medication' ? 'Record administration' : 'Record treatment performed'}</summary><form autoComplete="off" onSubmit={(event) => void execute(event, item.id)}>{item.type === 'Medication' ? <fieldset><legend>Administration details</legend><label>Actual dose<input name="actualDose" autoComplete="off" /></label><label>Concentration<input name="concentration" autoComplete="off" /></label><label>Quantity<input name="quantity" autoComplete="off" /></label><label>Unit<input name="unit" autoComplete="off" /></label><label>Route<input name="route" autoComplete="off" /></label><label>Site<input name="site" autoComplete="off" /></label></fieldset> : null}<label>Note <span className="field-optional">Optional—use only for a variance, complication, or useful handoff detail</span><textarea name="note" autoComplete="off" /></label><button className="button-primary" disabled={saving}>{item.type === 'Diagnostic' ? 'Mark test performed' : item.type === 'Medication' ? 'Record administration' : 'Mark treatment performed'}</button></form></details> : null}
        {item.status === 'Completed' ? <p><strong>Performed</strong>{text(execution.note) || text(execution.outcome) ? ` · ${text(execution.note) || text(execution.outcome)}` : ''}{item.completedAt ? ` · ${new Date(item.completedAt).toLocaleString('en-US', { timeZone: visit.location?.timeZone ?? 'UTC', dateStyle: 'medium', timeStyle: 'short' })}` : ''}</p> : null}
      </article>;
    })}</div>{error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
