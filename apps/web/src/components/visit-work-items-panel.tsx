'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { VisitDetail } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';

const CARE_TYPES = [['Treatment', 'Treatment'], ['Medication', 'Medication'], ['Diagnostic', 'Diagnostic'], ['FollowUp', 'Follow-up']] as const;
type Json = Record<string, unknown>;

function object(value: unknown): Json { return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}; }
function text(value: unknown) { return typeof value === 'string' ? value : ''; }

export function VisitWorkItemsPanel({ visit }: { visit: VisitDetail }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = visit.workItems.filter((item) => CARE_TYPES.some(([type]) => type === item.type));
  const mayPlan = user?.role === 'OWNER' || user?.role === 'VETERINARIAN';
  const mayPerformClinicalWork = ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? '');
  const closed = ['Archived', 'ArchivedWithExceptions', 'Cancelled', 'NoShow'].includes(visit.state);

  async function request(url: string, method: string, body: Json) {
    setSaving(true); setError(null);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Could not save care-plan work.');
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

  function decide(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const decision = String(form.get('decision'));
    const status = decision === 'Declined' ? 'Declined' : decision === 'DecideLater' ? 'Deferred' : 'Pending';
    return request(`/api/visits/${visit.id}/work-items/${itemId}`, 'PUT', { status, reason: form.get('note') || `${decision} by client`, clientDecision: { decision, method: form.get('method'), note: form.get('note') || null } });
  }

  function execute(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    return request(`/api/visits/${visit.id}/work-items/${itemId}`, 'PUT', { status: 'Completed', execution: {
      outcome: form.get('outcome'), actualDose: form.get('actualDose') || null, route: form.get('route') || null,
      site: form.get('site') || null, quantity: form.get('quantity') || null, unit: form.get('unit') || null,
      concentration: form.get('concentration') || null, performedAt: new Date().toISOString(),
    } });
  }

  return <section id="visit-care-plan" className="visit-work-panel" aria-labelledby="care-plan-heading">
    <header className="visit-work-panel__header"><div><p className="eyebrow">Plan and approval</p><h2 id="care-plan-heading">Care plan</h2><p>Turn the exam findings into clear recommendations, capture the client’s decision, and document completed care.</p></div><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></header>
    {mayPlan && !closed ? <details className="visit-work-add" open={items.length === 0}><summary><span><strong>Add recommendation</strong><small>Medication, treatment, diagnostic, or follow-up</small></span><b aria-hidden="true">＋</b></summary><form className="visit-work-create" onSubmit={(event) => void create(event)}>
      <label>Care type<select name="type">{CARE_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Item<input name="title" required placeholder="Medication, treatment, diagnostic, or follow-up" /></label>
      <label className="visit-work-create__recommendation">Clinical recommendation<textarea name="recommendation" required placeholder="Explain what you recommend and why" /></label>
      <fieldset><legend>Medication details <span>optional</span></legend><div><label>Ordered dose<input name="orderedDose" /></label><label>Route<input name="route" /></label><label>Frequency<input name="frequency" /></label><label>Duration<input name="duration" /></label><label>Disposition<select name="disposition"><option value="">Not applicable</option><option value="AdministeredInClinic">Administered in clinic</option><option value="DispensedTakeHome">Dispensed / take home</option></select></label></div></fieldset>
      <div className="visit-work-create__actions"><button className="button-primary" disabled={saving}>{saving ? 'Adding…' : 'Add recommendation'}</button></div>
    </form></details> : null}
    <div className="visit-work-list">{items.length === 0 ? <div className="visit-work-empty"><span aria-hidden="true">＋</span><strong>No recommendations yet</strong><p>Add the first recommendation to begin the client approval workflow.</p></div> : items.map((item) => {
      const result = object(item.result); const plan = object(result.plan); const decision = object(result.clientDecision); const execution = object(result.execution); const authorized = decision.decision === 'Authorized';
      return <article key={item.id} className="visit-work-item"><div><div className="visit-work-item__meta"><span>{item.type}</span><small className={`visit-work-item__status visit-work-item__status--${item.status.toLowerCase()}`}>{item.status}</small></div><strong>{item.title}</strong><p>{text(plan.recommendation)}</p></div>
        <dl><div><dt>Client decision</dt><dd>{text(decision.decision) || 'Pending'}</dd></div>{decision.method ? <div><dt>Method</dt><dd>{text(decision.method)}</dd></div> : null}{decision.attestedAt ? <div><dt>Attested</dt><dd>{new Date(text(decision.attestedAt)).toLocaleString()}</dd></div> : null}</dl>
        {mayPerformClinicalWork && !closed && item.status !== 'Completed' ? <details><summary>Record client decision</summary><form onSubmit={(event) => void decide(event, item.id)}><label>Decision<select name="decision"><option>Authorized</option><option>Declined</option><option value="DecideLater">Decide later</option></select></label><label>Communication method<select name="method"><option value="InPerson">In person</option><option>Phone</option><option>Video</option><option>Text</option><option>Email</option></select></label><label>Note<textarea name="note" /></label><button className="button-secondary" disabled={saving}>Attest decision</button></form></details> : null}
        {mayPerformClinicalWork && authorized && !closed && item.status !== 'Completed' ? <details><summary>Document care execution</summary><form onSubmit={(event) => void execute(event, item.id)}><label>Outcome<textarea name="outcome" required /></label>{item.type === 'Medication' ? <fieldset><legend>Medication execution</legend><label>Actual dose<input name="actualDose" /></label><label>Concentration<input name="concentration" /></label><label>Quantity<input name="quantity" /></label><label>Unit<input name="unit" /></label><label>Route<input name="route" /></label><label>Site<input name="site" /></label></fieldset> : null}<button className="button-primary" disabled={saving}>Complete authorized care</button></form></details> : null}
        {item.status === 'Completed' ? <p><strong>Performed:</strong> {text(execution.outcome) || 'Completed'}{item.completedAt ? ` · ${new Date(item.completedAt).toLocaleString()}` : ''}</p> : null}
      </article>;
    })}</div>{error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
