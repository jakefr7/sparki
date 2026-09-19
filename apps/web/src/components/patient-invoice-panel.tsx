'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number | string;
  unitAmountCents: number;
  totalAmountCents: number;
}

interface Invoice {
  id: string;
  visitId: string;
  status: string;
  version: number;
  editable: boolean;
  finalizedAt?: string | null;
  createdAt?: string;
  totalCents: number;
  amountPaidCents: number;
  remainingBalanceCents: number;
  lines: InvoiceLine[];
  visit?: { id: string; reason: string; visitType: string; createdAt: string; state: string };
}

interface CatalogItem {
  id: string;
  name: string;
  primaryType: string;
  billable: boolean;
  status: string;
  retailPrice: string | number | null;
}

function dollars(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function invoiceDate(invoice: Invoice) {
  const value = invoice.visit?.createdAt ?? invoice.createdAt;
  return value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
}

function readError(payload: unknown, fallback: string) {
  return payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
    ? payload.message
    : fallback;
}

export function PatientInvoicePanel({ patientId, activeVisitId }: { patientId: string; activeVisitId: string | null }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [history, setHistory] = useState<Invoice[]>([]);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [historyResponse, activeResponse] = await Promise.all([
        fetch(`/api/patients/${patientId}/invoices`, { cache: 'no-store' }),
        activeVisitId ? fetch(`/api/visits/${activeVisitId}/invoice`, { cache: 'no-store' }) : Promise.resolve(null),
      ]);
      const historyPayload = await historyResponse.json() as Invoice[] & { message?: string };
      if (!historyResponse.ok) throw new Error(readError(historyPayload, 'Could not load invoice history.'));
      setHistory(historyPayload);
      if (activeResponse) {
        const activePayload = await activeResponse.json() as Invoice & { message?: string };
        if (!activeResponse.ok) throw new Error(readError(activePayload, 'Could not load the current invoice.'));
        setInvoice({ ...activePayload, visitId: activeVisitId! });
      } else setInvoice(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load invoices.');
    } finally { setLoading(false); }
  }, [activeVisitId, patientId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!invoice?.editable || !query.trim()) { setCatalog([]); return; }
    const timer = window.setTimeout(() => {
      fetch(`/api/inventory/items?search=${encodeURIComponent(query)}`, { cache: 'no-store' })
        .then(async (response) => response.ok ? await response.json() as CatalogItem[] : [])
        .then((items) => setCatalog(items.filter((item) => item.billable && item.status === 'ACTIVE' && item.retailPrice != null).slice(0, 8)))
        .catch(() => setCatalog([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [invoice?.editable, query]);

  const visibleCatalog = useMemo(() => catalog.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())), [catalog, query]);
  const pastInvoices = history.filter((item) => item.visitId !== activeVisitId);

  async function addLine(item: CatalogItem) {
    if (!activeVisitId || item.retailPrice == null) return;
    const price = Number(item.retailPrice);
    if (!Number.isFinite(price)) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${activeVisitId}/invoice/lines`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: item.name, quantity: 1, unitAmountCents: Math.round(price * 100), catalogItemId: item.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not add this invoice item.'));
      setInvoice({ ...(payload as Invoice), visitId: activeVisitId });
      setQuery(''); setCatalog([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add this invoice item.'); }
    finally { setSaving(false); }
  }

  async function removeLine(lineId: string) {
    if (!activeVisitId) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${activeVisitId}/invoice/lines/${lineId}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Could not remove this invoice item.'));
      setInvoice({ ...(payload as Invoice), visitId: activeVisitId });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove this invoice item.'); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="profile-card profile-card--wide"><p role="status">Loading invoices…</p></section>;

  return (
    <div className="patient-invoice-workspace">
      <section className="profile-card profile-card--wide" aria-labelledby="patient-current-invoice-heading">
        <div className="profile-card__header profile-card__header--with-action">
          <div><p className="eyebrow">Current balance</p><h2 id="patient-current-invoice-heading">Active Invoice</h2></div>
          {activeVisitId ? <Link className="button-secondary" href={`/visits/${activeVisitId}?view=checkout`}>Open checkout</Link> : null}
        </div>
        {!activeVisitId || !invoice ? (
          <div className="profile-compact-empty profile-compact-empty--roomy"><strong>No active visit invoice</strong><span>Past invoices remain available below. A new invoice starts with the next visit.</span></div>
        ) : (
          <div className="patient-invoice-receipt">
            <div className="checkout-invoice-heading"><div><h3>Current visit charges</h3><p>{invoice.editable ? 'Changes save immediately and remain editable until checkout.' : 'This invoice has been finalized.'}</p></div><strong>{dollars(invoice.totalCents)}</strong></div>
            {invoice.lines.length ? <ul className="checkout-lines">{invoice.lines.map((line) => <li key={line.id}><span>{line.description}{Number(line.quantity) !== 1 ? <small> × {line.quantity}</small> : null}</span><span>{dollars(line.totalAmountCents)}{invoice.editable ? <button type="button" disabled={saving} onClick={() => void removeLine(line.id)} aria-label={`Remove ${line.description}`}>Remove</button> : null}</span></li>)}</ul> : <p className="checkout-empty">No charges have been added.</p>}
            {invoice.editable ? <div className="checkout-add-charge"><label><span>Add a service, medication, diagnostic, or item</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search hospital catalog" /></label>{query.trim() ? <div className="checkout-catalog-results">{visibleCatalog.length ? visibleCatalog.map((item) => <button type="button" key={item.id} disabled={saving} onClick={() => void addLine(item)}><span>{item.name}<small>{item.primaryType.toLowerCase()}</small></span><strong>{dollars(Math.round(Number(item.retailPrice) * 100))}</strong></button>) : <p>No billable catalog items found.</p>}</div> : null}</div> : null}
            <div className="checkout-total"><span>{invoice.remainingBalanceCents === invoice.totalCents ? 'Invoice total' : `Remaining after ${dollars(invoice.amountPaidCents)} recorded`}</span><strong>{dollars(invoice.remainingBalanceCents)}</strong></div>
          </div>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>

      <section className="profile-card profile-card--wide" aria-labelledby="past-invoices-heading">
        <div className="profile-card__header"><p className="eyebrow">Billing history</p><h2 id="past-invoices-heading">Past Invoices</h2></div>
        {pastInvoices.length ? <div className="patient-invoice-history">{pastInvoices.map((item) => <article key={item.id}><div><strong>{item.visit?.reason ?? 'Patient visit'}</strong><span>{invoiceDate(item)} · {item.status.replaceAll('_', ' ')}</span></div><div><strong>{dollars(item.totalCents)}</strong><span>{item.remainingBalanceCents ? `${dollars(item.remainingBalanceCents)} remaining` : 'Paid / settled'}</span></div><Link href={`/visits/${item.visitId}?view=checkout`}>View</Link></article>)}</div> : <p className="empty-state">No past invoices.</p>}
      </section>
    </div>
  );
}
