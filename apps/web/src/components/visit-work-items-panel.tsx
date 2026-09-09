'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

const CARE_TYPES = [['Treatment', 'Treatment'], ['Medication', 'Medication'], ['Diagnostic', 'Diagnostic'], ['FollowUp', 'Follow-up']] as const;
type Json = Record<string, unknown>;

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
  const [error, setError] = useState<string | null>(null);
  const items = visit.workItems.filter((item) => CARE_TYPES.some(([type]) => type === item.type) && (mode === 'plan' || ['Diagnostic', 'Treatment', 'Medication'].includes(item.type)));
  const mayPlan = user?.role === 'OWNER' || user?.role === 'VETERINARIAN';
  const mayPerformClinicalWork = ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? '');
  const closed = ['Archived', 'ArchivedWithExceptions', 'Cancelled', 'NoShow'].includes(visit.state);

  async function request(url: string, method: string, body: Json) {
    setSaving(true); setError(null);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Could not save care-plan work.');
      setHasUnsavedChanges(false);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save care-plan work.'); }
    finally { setSaving(false); }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const type = String(form.get('type'));
    return request(`/api/visits/${visit.id}/work-items`, 'POST', {
      type, title: form.get('title'), assigneeRole: type === 'FollowUp' ? 'VETERINARIAN' : 'TECHNICIAN',
      plan: { recommendation: form.get('recommendation'), ...(type === 'Medication' ? { medication: {
        orderedDose: form.get('orderedDose') || undefined, route: form.get('route') || undefined,
        frequency: form.get('frequency') || undefined, duration: form.get('duration') || undefined,
        disposition: form.get('disposition') || undefined,
      } } : {}) },
    });
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
    <header className="visit-work-panel__header"><div><h2 id={headingId}>{mode === 'plan' ? 'Care plan' : 'Care'}</h2><p>{mode === 'plan' ? 'Add the treatments, diagnostics, medications, and follow-up this patient needs.' : 'Document the care completed from the veterinarian’s plan.'}</p></div>{items.length > 0 ? <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span> : null}</header>
    {mode === 'plan' && mayPlan && !closed ? <form className="visit-work-create" onSubmit={(event) => void create(event)}>
      <label>Type<select name="type" value={careType} onChange={(event) => setCareType(event.target.value)}>{CARE_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Name<input name="title" required placeholder="Enter treatment, test, or medication" /></label>
      <label className="visit-work-create__recommendation">Plan details<textarea name="recommendation" rows={3} required placeholder="What are you recommending, and why?" /></label>
      <details className="visit-medication-options" hidden={careType !== 'Medication'}><summary>Medication details (optional)</summary><fieldset><legend className="sr-only">Medication details</legend><div><label>Ordered dose<input name="orderedDose" /></label><label>Route<input name="route" /></label><label>Frequency<input name="frequency" /></label><label>Duration<input name="duration" /></label><label>Disposition<select name="disposition"><option value="">Not applicable</option><option value="AdministeredInClinic">Administered in clinic</option><option value="DispensedTakeHome">Dispensed / take home</option></select></label></div></fieldset></details>
      <div className="visit-work-create__actions"><span className={`autosave-indicator autosave-indicator--${saving ? 'saving' : error ? 'error' : hasUnsavedChanges ? 'saving' : 'saved'}`} role="status"><span className="autosave-indicator__dot" aria-hidden="true" />{saving ? 'Saving…' : error ? 'Changes not saved' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}</span><button className="button-primary" disabled={saving}>{saving ? 'Adding…' : 'Add to plan'}</button></div>
    </form> : null}
    <div className="visit-work-list">{items.length === 0 ? <div className="visit-work-empty"><strong>{mode === 'plan' ? 'No care added yet' : 'No care to complete'}</strong><span>{mode === 'plan' ? 'Add the first item above.' : 'Return to the care plan to add an order.'}</span></div> : items.map((item) => {
      const result = object(item.result); const plan = object(result.plan); const execution = object(result.execution);
      const canDocumentCare = mode === 'care' && mayPerformClinicalWork && !closed && ['Pending', 'InProgress'].includes(item.status);
      return <article key={item.id} className="visit-work-item"><div><div className="visit-work-item__meta"><span>{item.type}</span>{mode === 'care' || item.status === 'Completed' ? <small className={`visit-work-item__status visit-work-item__status--${item.status.toLowerCase()}`}>{statusLabel(item.status)}</small> : null}</div><strong>{item.title}</strong><p>{text(plan.recommendation)}</p></div>
        {canDocumentCare ? <details><summary>{item.type === 'Diagnostic' ? 'Record test performed' : item.type === 'Medication' ? 'Record administration' : 'Record treatment performed'}</summary><form onSubmit={(event) => void execute(event, item.id)}>{item.type === 'Medication' ? <fieldset><legend>Administration details</legend><label>Actual dose<input name="actualDose" /></label><label>Concentration<input name="concentration" /></label><label>Quantity<input name="quantity" /></label><label>Unit<input name="unit" /></label><label>Route<input name="route" /></label><label>Site<input name="site" /></label></fieldset> : null}<label>Note <span className="field-optional">Optional—use only for a variance, complication, or useful handoff detail</span><textarea name="note" /></label><button className="button-primary" disabled={saving}>{item.type === 'Diagnostic' ? 'Mark test performed' : item.type === 'Medication' ? 'Record administration' : 'Mark treatment performed'}</button></form></details> : null}
        {item.status === 'Completed' ? <p><strong>Performed</strong>{text(execution.note) || text(execution.outcome) ? ` · ${text(execution.note) || text(execution.outcome)}` : ''}{item.completedAt ? ` · ${new Date(item.completedAt).toLocaleString()}` : ''}</p> : null}
      </article>;
    })}</div>{error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
