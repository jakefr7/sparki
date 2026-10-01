'use client';
import { VisitDocumentDownload } from './visit-document-download';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useNewAppointmentModal } from '../hooks/use-new-appointment-modal';

type Money = number;
type PaymentMethod = 'CARD' | 'CASH' | 'CHECK' | 'OTHER';

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number | string;
  unitAmountCents: Money;
  totalAmountCents: Money;
}

interface Payment {
  id: string;
  amountCents: Money;
  method: PaymentMethod;
  recordedAt: string;
}

interface Invoice {
  id: string;
  status: string;
  version: number;
  editable: boolean;
  canRecordPayment: boolean;
  totalCents: Money;
  amountPaidCents: Money;
  remainingBalanceCents: Money;
  lines: InvoiceLine[];
  payments: Payment[];
}

interface CheckoutState {
  client: { firstName: string; lastName: string } | null;
  patient: { id: string; name: string; species: string; breed: string | null; sex: string | null; imageUrl: string | null };
  readiness: { ready: boolean; blockers: string[] };
  invoice: Invoice;
  followUp: { required: boolean; plan: string | null };
  checkoutCompletion: { completed: boolean; completedAt: string | null; balanceStatus: string | null };
  allowCheckoutWithOutstandingBalance: boolean;
}

interface CatalogItem {
  id: string;
  name: string;
  billable: boolean;
  status: string;
  retailPrice: string | number | null;
}

interface Receipt {
  organization: { name: string };
  location: { name: string };
  patient: { name: string };
  client: { firstName: string; lastName: string } | null;
  lines: InvoiceLine[];
  payments: Payment[];
  totalCents: Money;
  amountPaidCents: Money;
  remainingBalanceCents: Money;
}

function dollars(cents: Money) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function paymentMethodLabel(method: PaymentMethod) {
  return { CARD: 'Card', CASH: 'Cash', CHECK: 'Check', OTHER: 'Other' }[method];
}

function centsFromInput(value: string): number | null {
  const normalized = value.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function readError(payload: unknown, fallback: string) {
  return payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
    ? payload.message
    : fallback;
}

export function VisitCheckoutWorkspace({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [state, setState] = useState<CheckoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'review' | 'payment' | 'done'>('review');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [addingLine, setAddingLine] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentKey, setPaymentKey] = useState('');
  const [completing, setCompleting] = useState(false);
  const [contactConfirmed, setContactConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [scheduledFollowUp, setScheduledFollowUp] = useState<{ id: string; scheduledAt: string; reason: string; provider?: { displayName: string } | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/visits/${visitId}/checkout`, { cache: 'no-store' });
      const payload = await response.json() as CheckoutState & { message?: string };
      if (!response.ok) throw new Error(readError(payload, 'Could not load checkout.'));
      setState(payload);
      if (payload.checkoutCompletion.completed) setStep('done');
      else if (payload.invoice.remainingBalanceCents === 0 && !payload.invoice.editable) setStep('done');
      setPaymentAmount((current) => current || (payload.invoice.remainingBalanceCents / 100).toFixed(2));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load checkout.');
    } finally { setLoading(false); }
  }, [visitId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!state?.invoice.editable) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/inventory/items?search=${encodeURIComponent(catalogQuery)}`, { cache: 'no-store' })
        .then(async (response) => response.ok ? await response.json() as CatalogItem[] : [])
        .then((items) => setCatalog(items.filter((item) => item.billable && item.status === 'ACTIVE' && item.retailPrice != null).slice(0, 8)))
        .catch(() => setCatalog([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [catalogQuery, state?.invoice.editable]);

  const { openNewAppointment, newAppointmentModal } = useNewAppointmentModal((appointment) => {
    setScheduledFollowUp({ id: appointment.id, scheduledAt: appointment.scheduledAt, reason: appointment.reason, provider: appointment.provider });
    void load();
  });
  const visibleCatalog = useMemo(() => catalog.filter((item) => item.name.toLowerCase().includes(catalogQuery.toLowerCase())), [catalog, catalogQuery]);
  const tenderedCents = centsFromInput(cashTendered);
  const enteredPaymentCents = centsFromInput(paymentAmount);
  const changeCents = paymentMethod === 'CASH' && tenderedCents != null && enteredPaymentCents != null ? Math.max(tenderedCents - enteredPaymentCents, 0) : null;

  async function addCatalogLine(item: CatalogItem) {
    const retailPrice = Number(item.retailPrice);
    if (!Number.isFinite(retailPrice)) return;
    setAddingLine(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/invoice/lines`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: item.name, quantity: 1, unitAmountCents: Math.round(retailPrice * 100), catalogItemId: item.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not add this charge.'));
      setState((current) => current ? { ...current, invoice: payload as Invoice } : current);
      setCatalogQuery(''); setCatalog([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add this charge.'); }
    finally { setAddingLine(false); }
  }

  async function removeLine(lineId: string) {
    setAddingLine(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/invoice/lines/${lineId}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not remove this charge.'));
      setState((current) => current ? { ...current, invoice: payload as Invoice } : current);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove this charge.'); }
    finally { setAddingLine(false); }
  }

  async function continueToPayment() {
    if (!state) return;
    if (!state.readiness.ready) { setError('Checkout is waiting on the clinical team.'); return; }
    if (state.invoice.totalCents === 0) { setStep('done'); return; }
    setFinalizing(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/invoice/finalize`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not prepare charges for payment.'));
      const invoice = payload as Invoice;
      setState((current) => current ? { ...current, invoice } : current);
      setPaymentAmount((invoice.remainingBalanceCents / 100).toFixed(2));
      setStep(invoice.remainingBalanceCents === 0 ? 'done' : 'payment');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not prepare charges for payment.'); }
    finally { setFinalizing(false); }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    const amountCents = centsFromInput(paymentAmount);
    if (!amountCents || amountCents <= 0) { setError('Enter a payment amount greater than $0.'); return; }
    const idempotencyKey = paymentKey || crypto.randomUUID();
    setPaymentKey(idempotencyKey); setRecordingPayment(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/invoice/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents, method: paymentMethod, idempotencyKey, expectedInvoiceVersion: state.invoice.version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not record payment.'));
      const invoice = payload as Invoice;
      setState((current) => current ? { ...current, invoice } : current);
      setPaymentKey('');
      setPaymentAmount((invoice.remainingBalanceCents / 100).toFixed(2));
      setCashTendered('');
      if (invoice.remainingBalanceCents === 0) setStep('done');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not record payment.';
      setError(message);
      if (/already paid|changed since/i.test(message)) void load();
    } finally { setRecordingPayment(false); }
  }

  async function showReceipt() {
    setReceiptError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/invoice/receipt`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Receipt is not available yet.'));
      setReceipt(payload as Receipt);
    } catch (caught) { setReceiptError(caught instanceof Error ? caught.message : 'Receipt is not available yet.'); }
  }

  async function finishCheckout() {
    if (!state) return;
    setCompleting(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/checkout/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientContactConfirmed: contactConfirmed }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not finish checkout.'));
      await load();
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not finish checkout.'); }
    finally { setCompleting(false); }
  }

  if (loading) return <div className="checkout-workspace checkout-workspace--loading" role="status">Loading checkout…</div>;
  if (!state) return <div className="checkout-workspace"><p className="form-error" role="alert">{error ?? 'Checkout is unavailable.'}</p></div>;

  const clientName = state.client ? `${state.client.firstName} ${state.client.lastName}` : 'No client on file';
  const canFinish = state.readiness.ready && state.invoice.remainingBalanceCents === 0 && !state.checkoutCompletion.completed;

  return <div className="checkout-workspace">
    <p className="visit-step-caption">Checkout · {step === 'review' ? 'Review' : step === 'payment' ? 'Payment' : 'Done'}</p>
    <section className="checkout-card" aria-labelledby="checkout-heading">
      <header className="checkout-card__header">
        <div><p className="eyebrow">Reception checkout</p><h2 id="checkout-heading">{state.checkoutCompletion.completed ? 'Checkout complete' : state.readiness.ready ? 'Ready to checkout' : 'Checkout needs attention'}</h2><p>{state.patient.name} · {clientName}</p></div>
        {state.checkoutCompletion.completed ? <span className="checkout-status checkout-status--complete">Complete</span> : null}
      </header>

      {!state.readiness.ready ? <div className="checkout-blockers" role="alert"><strong>Before this visit can be checked out</strong><ul>{state.readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul><p>The clinical team can resolve these items.</p></div> : null}

      {step === 'review' && !state.checkoutCompletion.completed ? <div className="checkout-review">
        <div className="checkout-invoice-heading"><div><h3>Today’s charges</h3><p>{state.invoice.editable ? 'Review or adjust charges before continuing.' : 'Charges are ready for payment.'}</p></div><strong>{dollars(state.invoice.totalCents)}</strong></div>
        {state.invoice.lines.length ? <ul className="checkout-lines">{state.invoice.lines.map((line) => <li key={line.id}><span>{line.description}{Number(line.quantity) !== 1 ? <small> × {line.quantity}</small> : null}</span><span>{dollars(line.totalAmountCents)}{state.invoice.editable ? <button type="button" onClick={() => void removeLine(line.id)} disabled={addingLine} aria-label={`Remove ${line.description}`}>Remove</button> : null}</span></li>)}</ul> : <p className="checkout-empty">No charges have been added for this visit.</p>}
        {state.invoice.editable ? <div className="checkout-add-charge"><label><span>Add a service or item</span><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search billable services or items" /></label>{catalogQuery ? <div className="checkout-catalog-results">{visibleCatalog.length ? visibleCatalog.map((item) => <button type="button" key={item.id} onClick={() => void addCatalogLine(item)} disabled={addingLine}><span>{item.name}</span><strong>{dollars(Math.round(Number(item.retailPrice) * 100))}</strong></button>) : <p>No billable catalog items found.</p>}</div> : null}</div> : null}
        <div className="checkout-total"><span>Total due today</span><strong>{dollars(state.invoice.totalCents)}</strong></div>
        {state.followUp.required ? <section className="checkout-followup"><div><span className="eyebrow">Follow-up</span><h3>{scheduledFollowUp ? 'Follow-up scheduled' : 'Recheck required'}</h3><p>{scheduledFollowUp ? `${new Date(scheduledFollowUp.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}${scheduledFollowUp.provider ? ` · ${scheduledFollowUp.provider.displayName}` : ''}` : state.followUp.plan ?? 'Clinical follow-up requested.'}</p></div><button type="button" className="button-secondary" onClick={() => openNewAppointment({ patient: { ...state.patient, primaryClient: state.client ? { id: '', ...state.client, phone: null, email: null, preferredContactMethod: null } : null }, appointmentTypeId: 'Recheck', source: 'Checkout follow-up' })}>{scheduledFollowUp ? 'Change follow-up' : 'Schedule follow-up'}</button></section> : null}
      </div> : null}

      {step === 'payment' ? <form id="checkout-payment" className="checkout-payment" onSubmit={recordPayment}><div className="checkout-amount"><span>Amount due</span><strong>{dollars(state.invoice.remainingBalanceCents)}</strong><p>Process this amount using the clinic’s payment system, then record the payment below.</p></div><fieldset><legend>Payment method</legend><div className="checkout-methods">{(['CARD', 'CASH', 'CHECK', 'OTHER'] as PaymentMethod[]).map((method) => <button type="button" key={method} aria-pressed={paymentMethod === method} onClick={() => setPaymentMethod(method)}>{paymentMethodLabel(method)}</button>)}</div></fieldset><label className="checkout-amount-input"><span>Amount</span><span className="checkout-money-input"><b>$</b><input inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} aria-label="Payment amount" /></span></label>{paymentMethod === 'CASH' ? <label className="checkout-cash-input"><span>Cash tendered <small>Optional</small></span><span className="checkout-money-input"><b>$</b><input inputMode="decimal" value={cashTendered} onChange={(event) => setCashTendered(event.target.value)} /></span>{changeCents != null ? <small>Change due: {dollars(changeCents)}</small> : null}</label> : null}{state.invoice.amountPaidCents > 0 ? <p className="checkout-payment-summary">Paid {dollars(state.invoice.amountPaidCents)} · Remaining {dollars(state.invoice.remainingBalanceCents)}</p> : null}</form> : null}

      {step === 'done' ? <div className="checkout-done"><div><span className="checkout-done__mark" aria-hidden="true">✓</span><h3>{state.checkoutCompletion.completed ? 'Visit checkout is complete' : 'Payment recorded'}</h3><p>{state.invoice.payments.length ? state.invoice.payments.map((payment) => `${dollars(payment.amountCents)} · ${paymentMethodLabel(payment.method)}`).join(' · ') : 'No payment was needed for this visit.'}</p></div>{!state.invoice.editable ? <div className="checkout-receipt-actions"><button type="button" className="button-secondary" onClick={() => void showReceipt()}>View receipt</button>{receipt ? <VisitDocumentDownload visitId={visitId} kind="receipt">Download receipt PDF</VisitDocumentDownload> : null}</div> : null}{receipt ? <div className="checkout-receipt"><h4>{receipt.organization.name}</h4><p>{receipt.patient.name}{receipt.client ? ` · ${receipt.client.firstName} ${receipt.client.lastName}` : ''}</p>{receipt.lines.map((line) => <p key={line.id}><span>{line.description}</span><strong>{dollars(line.totalAmountCents)}</strong></p>)}<p className="checkout-receipt__total"><span>Total</span><strong>{dollars(receipt.totalCents)}</strong></p></div> : null}{receiptError ? <p className="form-error" role="alert">{receiptError}</p> : null}<label className="checkout-contact-confirmation"><input type="checkbox" checked={contactConfirmed} onChange={(event) => setContactConfirmed(event.target.checked)} disabled={state.checkoutCompletion.completed} /> Client contact details confirmed</label></div> : null}
      {error ? <p className="form-error checkout-error" role="alert">{error}</p> : null}
    </section>
    {!state.checkoutCompletion.completed ? <footer className="visit-step-actions checkout-actions"><span>{step === 'payment' ? <button type="button" className="visit-stage-navigation__link" onClick={() => setStep('review')} disabled={recordingPayment}>← Back to review</button> : null}</span>{step === 'review' ? <button type="button" className="button-primary" onClick={() => void continueToPayment()} disabled={!state.readiness.ready || finalizing}>{finalizing ? 'Preparing payment…' : state.invoice.totalCents === 0 ? 'Continue to checkout →' : 'Continue to payment →'}</button> : step === 'payment' ? <button type="submit" form="checkout-payment" className="button-primary" disabled={recordingPayment}>{recordingPayment ? 'Recording…' : 'Record payment'}</button> : <button type="button" className="button-primary" onClick={() => void finishCheckout()} disabled={!canFinish || !contactConfirmed || completing}>{completing ? 'Finishing…' : 'Finish checkout'}</button>}</footer> : null}
    {newAppointmentModal}
  </div>;
}
