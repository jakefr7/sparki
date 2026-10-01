'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Prescription = { id: string; version: number; status: string; medicationName: string; strength: string; directions: string; quantity: string; quantityUnit: string; allowedRefills: number; expiresAt: string; authorizedByName: string | null };
export function PatientPrescriptionsPanel({ patientId }: { patientId: string }) {
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; strength: string | null }>>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [canAuthorize, setCanAuthorize] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const url = `/api/patients/${encodeURIComponent(patientId)}/prescriptions`;
  const load = useCallback(async () => {
    const response = await fetch(url);
    const body = await response.json() as { prescriptions?: Prescription[]; canAuthorize?: boolean; catalog?: Array<{ id: string; name: string; strength: string | null }>; message?: string };
    if (!response.ok) throw new Error(body.message ?? 'Could not load prescriptions.');
    setCatalog(body.catalog ?? []); setPrescriptions(body.prescriptions ?? []); setCanAuthorize(Boolean(body.canAuthorize));
  }, [url]);
  useEffect(() => { void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load prescriptions.')).finally(() => setLoading(false)); }, [load]);
  async function send(path: string, body: unknown) {
    setBusy(true); setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not save prescription.');
      await load(); setPreparing(false); setCancelling(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save prescription.'); }
    finally { setBusy(false); }
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void send(url, { ...(form.get('catalogItemId') ? { catalogItemId: form.get('catalogItemId') } : {}), medicationName: form.get('medicationName'), strength: form.get('strength'), directions: form.get('directions'), quantity: form.get('quantity'), quantityUnit: form.get('quantityUnit'), allowedRefills: Number(form.get('allowedRefills')), expiresAt: `${form.get('expiresAt')}T23:59:59Z` });
  }
  return <section className="profile-card profile-card--wide profile-card--medications" aria-label="Prescriptions">
    <div className="profile-card__header profile-card__header--with-action"><div><p className="eyebrow">Clinician orders</p><h2>Prescriptions</h2></div>{!loading && !preparing ? <button type="button" className="button-primary" onClick={() => setPreparing(true)}>Prepare prescription</button> : null}</div>
    <p>Prepare an order for clinician review and authorization.</p>
    {loading ? <p role="status">Loading prescriptions…</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {preparing ? <form className="patient-inline-form patient-medication-form" onSubmit={prepare}>
      <label>Hospital medication <small>Optional</small><select name="catalogItemId" onChange={(event) => {
        const selected = catalog.find((item) => item.id === event.target.value);
        const form = event.currentTarget.form;
        if (selected && form) {
          const name = form.elements.namedItem('medicationName'); const strength = form.elements.namedItem('strength');
          if (name instanceof HTMLInputElement) name.value = selected.name;
          if (strength instanceof HTMLInputElement) strength.value = selected.strength ?? '';
        }
      }}><option value="">Enter a medication manually</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name}{item.strength ? ` · ${item.strength}` : ''}</option>)}</select></label>
      <label>Medication<input name="medicationName" required maxLength={200} /></label><label>Strength<input name="strength" required maxLength={100} /></label>
      <label>Patient directions<textarea name="directions" required maxLength={10000} /></label>
      <label>Quantity<input name="quantity" required type="number" min="0.00000001" max="1000000" step="any" /></label><label>Quantity unit<input name="quantityUnit" required placeholder="tablets, capsules, mL" maxLength={50} /></label>
      <label>Allowed refills<input name="allowedRefills" required type="number" min="0" max="99" defaultValue="0" /></label><label>Expiration date<input name="expiresAt" required type="date" /></label>
      <div><button className="button-primary" disabled={busy}>Save draft</button><button type="button" className="button-secondary" onClick={() => setPreparing(false)}>Cancel</button></div>
    </form> : null}
    {prescriptions.map((prescription) => <article className="patient-medication-card" key={prescription.id}>
      <div><h4>{prescription.medicationName} · {prescription.strength}</h4><p>{prescription.directions}</p>
      <small>{prescription.status.toLowerCase()} · {prescription.quantity} {prescription.quantityUnit} · {prescription.allowedRefills} allowed refills · Expires {new Date(prescription.expiresAt).toLocaleDateString()}{prescription.authorizedByName ? ` · ${prescription.authorizedByName}` : ''}</small></div>
      <div className="patient-medication-card__actions">
        {canAuthorize && prescription.status === 'DRAFT' ? <button className="button-primary" disabled={busy} onClick={() => void send(`${url}/${prescription.id}/authorize`, { version: prescription.version })}>Authorize prescription</button> : null}
        {prescription.status === 'AUTHORIZED' && new Date(prescription.expiresAt) > new Date() ? <a className="button-secondary" href={`${url}/${prescription.id}/pdf`}>Download prescription PDF</a> : null}
        {canAuthorize && prescription.status !== 'CANCELLED' ? <button className="button-secondary" disabled={busy} onClick={() => setCancelling(prescription.id)}>Cancel prescription</button> : null}
      </div>
      {cancelling === prescription.id ? <form className="patient-medication-action" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void send(`${url}/${prescription.id}/cancel`, { version: prescription.version, reason: form.get('reason') }); }}>
        <label>Reason for cancellation<textarea name="reason" required minLength={3} maxLength={1000} autoFocus /></label>
        <div><button className="button-primary" disabled={busy}>Confirm cancellation</button><button type="button" className="button-secondary" onClick={() => setCancelling(null)}>Keep prescription</button></div>
      </form> : null}
    </article>)}
  </section>;
}
