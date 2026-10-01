'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  retailPrice: string | null;
  markupPercent: string | null;
  taxable: boolean;
}

const EMPTY = { name: '', description: '', price: '', markupPercent: '', taxable: false };

function money(value: string | null) {
  if (value == null) return 'Price not set';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(value),
  );
}

function errorMessage(value: unknown, fallback: string) {
  return value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : fallback;
}

export function ServicesSection() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/inventory/items?type=SERVICE', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, 'Could not load hospital services.'));
      setServices(payload as ServiceItem[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load hospital services.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function beginEdit(service: ServiceItem) {
    setEditing(service.id);
    setForm({
      name: service.name,
      description: service.description ?? '',
      price: service.retailPrice ?? '',
      markupPercent: service.markupPercent ?? '',
      taxable: service.taxable,
    });
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setError(null);
    const creating = editing === 'new';
    const body = creating
      ? {
          name: form.name,
          description: form.description || null,
          primaryType: 'SERVICE',
          status: 'ACTIVE',
          billable: true,
          inventoryTracked: false,
          taxable: form.taxable,
          retailPrice: form.price,
          markupPercent: form.markupPercent || null,
          species: [],
          tags: [],
          barcodes: [],
          lotTracking: false,
          expirationTracking: false,
          controlledSubstance: false,
        }
      : {
          name: form.name,
          description: form.description || null,
          taxable: form.taxable,
          retailPrice: form.price,
          markupPercent: form.markupPercent || null,
          billable: true,
        };
    try {
      const response = await fetch(
        creating ? '/api/inventory/items' : `/api/inventory/items/${editing}`,
        {
          method: creating ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, 'Could not save this service.'));
      setEditing(null);
      setForm(EMPTY);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this service.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="settings-card settings-services"
      aria-labelledby="hospital-services-heading"
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="hospital-services-heading">Services</h2>
          <p>
            Manage the exams and services charged on invoices. Appointment types control scheduling
            separately; markup is reference only.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              setEditing('new');
              setForm(EMPTY);
            }}
          >
            Add service
          </button>
        ) : null}
      </div>
      {editing ? (
        <form className="settings-form" onSubmit={submit}>
          <div className="settings-form-grid">
            <label>
              <span>Service name</span>
              <input
                autoFocus
                required
                maxLength={200}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Initial consultation"
              />
            </label>
            <label>
              <span>Price</span>
              <input
                required
                inputMode="decimal"
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({ ...current, price: event.target.value }))
                }
                placeholder="395.00"
              />
            </label>
            <label>
              <span>
                Markup % <small>optional, reference only</small>
              </span>
              <input
                inputMode="decimal"
                value={form.markupPercent}
                onChange={(event) =>
                  setForm((current) => ({ ...current, markupPercent: event.target.value }))
                }
                placeholder="0"
              />
            </label>
          </div>
          <label>
            <span>
              Description <small>optional</small>
            </span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={form.taxable}
              onChange={(event) =>
                setForm((current) => ({ ...current, taxable: event.target.checked }))
              }
            />
            <span>Taxable service</span>
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="settings-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={saving}
              onClick={() => {
                setEditing(null);
                setError(null);
              }}
            >
              Cancel
            </button>
            <button className="button-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save service'}
            </button>
          </div>
        </form>
      ) : null}
      {!editing ? (
        loading ? (
          <p role="status">Loading services…</p>
        ) : services.length ? (
          <div className="settings-service-list">
            {services.map((service) => (
              <article key={service.id}>
                <div>
                  <strong>{service.name}</strong>
                  <span>{service.description || 'No description'}</span>
                </div>
                <div>
                  <strong>{money(service.retailPrice)}</strong>
                  <span>
                    {service.taxable ? 'Taxable' : 'Non-taxable'}
                    {service.markupPercent ? ` · ${service.markupPercent}% markup` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => beginEdit(service)}
                >
                  Edit
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No hospital services configured.</p>
        )
      ) : null}
      {error && !editing ? (
        <div className="admin-feedback admin-feedback--error" role="alert">
          <p>{error}</p>
          <button
            className="button-secondary"
            type="button"
            disabled={loading}
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : null}
    </section>
  );
}
