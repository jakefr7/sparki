'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type DateException = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  providerId: string | null;
  reason: string;
};
type Provider = { id: string; displayName: string };
const EMPTY = {
  date: '',
  startTime: '09:00',
  endTime: '17:00',
  providerId: '',
  reason: '',
  allDay: true,
};

export function DateExceptionsSection() {
  const [items, setItems] = useState<DateException[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [exceptions, staff] = await Promise.all([
        fetch('/api/scheduler-config/date-exceptions', { cache: 'no-store' }),
        fetch('/api/scheduler-config/appointment-types/eligible-providers', { cache: 'no-store' }),
      ]);
      if (!exceptions.ok || !staff.ok)
        throw new Error('Could not load date exceptions and providers.');
      setItems((await exceptions.json()) as DateException[]);
      setProviders((await staff.json()) as Provider[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load date exceptions.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/scheduler-config/date-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          startTime: form.allDay ? null : form.startTime,
          endTime: form.allDay ? null : form.endTime,
          providerId: form.providerId || null,
          reason: form.reason,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
        throw new Error(
          typeof body?.message === 'string'
            ? body.message
            : 'Could not save date exception. Check the date and times.',
        );
      }
      const saved = (await response.json()) as DateException;
      setItems((current) => [...current, saved].sort((a, b) => a.date.localeCompare(b.date)));
      setEditing(false);
      setForm(EMPTY);
      setMessage('Date exception saved. Existing appointments remain scheduled.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save date exception.');
    } finally {
      setPending(false);
    }
  }
  async function remove(item: DateException) {
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/scheduler-config/date-exceptions/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Could not remove date exception.');
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setMessage('Exception removed. Weekly booking availability applies again.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove date exception.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="settings-section" aria-labelledby="date-exceptions-heading">
      <h2 id="date-exceptions-heading">Date exceptions</h2>
      <p>
        Plan holidays and provider leave without changing your weekly schedule. Times use the clinic
        time zone; existing appointments stay scheduled.
      </p>
      {loading ? <p role="status">Loading date exceptions…</p> : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          {!editing ? (
            <button type="button" disabled={pending} onClick={() => void load()}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading && !error && !items.length ? (
        <p className="admin-empty">No date exceptions. Booking follows weekly availability.</p>
      ) : null}
      <button
        type="button"
        className="button-secondary"
        disabled={loading || pending || Boolean(error) || editing}
        onClick={() => {
          setEditing(true);
          setMessage(null);
        }}
      >
        Add date exception
      </button>
      {editing ? (
        <form className="date-exceptions-editor" onSubmit={submit}>
          <fieldset disabled={pending} className="settings-form-grid">
            <legend>Close booking on a date</legend>
            <label>
              Date
              <input
                type="date"
                autoFocus
                required
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </label>
            <label>
              Provider
              <select
                value={form.providerId}
                onChange={(event) => setForm({ ...form, providerId: event.target.value })}
              >
                <option value="">Whole clinic</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(event) => setForm({ ...form, allDay: event.target.checked })}
              />
              All day
            </label>
            {!form.allDay ? (
              <>
                <label>
                  Start time
                  <input
                    type="time"
                    required
                    value={form.startTime}
                    onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                  />
                </label>
                <label>
                  End time
                  <input
                    type="time"
                    required
                    value={form.endTime}
                    onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                  />
                </label>
              </>
            ) : null}
            <label>
              Reason
              <input
                required
                maxLength={240}
                placeholder="Holiday closure or provider leave"
                value={form.reason}
                onChange={(event) => setForm({ ...form, reason: event.target.value })}
              />
            </label>
            <div className="admin-form-actions">
              <button className="button-primary" type="submit">
                {pending ? 'Saving…' : 'Save date exception'}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}
      <div className="scheduler-type-list date-exceptions-list">
        {items.map((item) => (
          <article className="scheduler-type-card" key={item.id}>
            <div>
              <strong>
                {item.date} · {item.startTime ? `${item.startTime}–${item.endTime}` : 'All day'}
              </strong>
              <p>
                {item.providerId
                  ? (providers.find((provider) => provider.id === item.providerId)?.displayName ??
                    'Assigned provider')
                  : 'Whole clinic'}{' '}
                · {item.reason}
              </p>
            </div>
            <button
              type="button"
              className="button-secondary"
              disabled={pending}
              onClick={() => void remove(item)}
            >
              Remove exception
            </button>
          </article>
        ))}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
