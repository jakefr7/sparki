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
  endDate: '',
  days: [] as number[],
  dates: [] as string[],
  mode: 'dates' as 'dates' | 'repeat',
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
    const dates =
      form.mode === 'dates'
        ? [...new Set([...form.dates, ...(form.date ? [form.date] : [])])].sort()
        : [];
    if (form.mode === 'repeat' && form.date && form.endDate && form.date <= form.endDate) {
      const cursor = new Date(`${form.date}T12:00:00Z`);
      for (let i = 0; i < 366 && cursor.toISOString().slice(0, 10) <= form.endDate; i++) {
        if (form.days.includes(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      if (cursor.toISOString().slice(0, 10) <= form.endDate) {
        setError('Choose a range of at most 366 days.');
        return;
      }
    }
    if (!dates.length || dates.length > 366) {
      setError('Choose between 1 and 366 dates.');
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/scheduler-config/date-exceptions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exceptions: dates.map((date) => ({
            date,
            startTime: form.allDay ? null : form.startTime,
            endTime: form.allDay ? null : form.endTime,
            providerId: form.providerId || null,
            reason: form.reason,
          })),
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
      const saved = (await response.json()) as DateException[];
      setItems((current) =>
        [...current.filter((item) => !saved.some((entry) => entry.id === item.id)), ...saved].sort(
          (a, b) => a.date.localeCompare(b.date),
        ),
      );
      setEditing(false);
      setForm(EMPTY);
      setMessage(
        `${saved.length} date exception${saved.length === 1 ? '' : 's'} saved. Existing appointments remain scheduled.`,
      );
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
            <legend>Close booking on selected dates</legend>
            <label>
              Dates to close
              <select
                value={form.mode}
                onChange={(event) =>
                  setForm({ ...form, mode: event.target.value as 'dates' | 'repeat' })
                }
              >
                <option value="dates">Specific dates</option>
                <option value="repeat">Weekdays within a date range</option>
              </select>
            </label>
            <label>
              {form.mode === 'repeat' ? 'Start date' : 'Date'}
              <input
                type="date"
                autoFocus
                required={form.mode === 'repeat' || !form.dates.length}
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </label>
            {form.mode === 'dates' ? (
              <div className="date-selection">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!form.date}
                  onClick={() =>
                    setForm({
                      ...form,
                      dates: [...new Set([...form.dates, form.date])].sort(),
                      date: '',
                    })
                  }
                >
                  Add another date
                </button>
                {form.dates.map((date) => (
                  <button
                    type="button"
                    key={date}
                    className="button-secondary"
                    aria-label={`Remove ${date}`}
                    onClick={() =>
                      setForm({ ...form, dates: form.dates.filter((value) => value !== date) })
                    }
                  >
                    {date} ×
                  </button>
                ))}
              </div>
            ) : (
              <>
                <label>
                  End date
                  <input
                    type="date"
                    required
                    min={form.date}
                    value={form.endDate}
                    onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                  />
                </label>
                <fieldset className="weekday-picker">
                  <legend>Repeat on</legend>
                  <div className="weekday-picker__days">
                    {[
                      'Sunday',
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                    ].map((day, index) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          checked={form.days.includes(index)}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              days: event.target.checked
                                ? [...form.days, index]
                                : form.days.filter((value) => value !== index),
                            })
                          }
                        />
                        {day.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                  <div className="weekday-picker__presets">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setForm({ ...form, days: [0, 6] })}
                    >
                      Weekends
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setForm({ ...form, days: [1, 2, 3, 4, 5] })}
                    >
                      Weekdays
                    </button>
                  </div>
                  <small>
                    Creates individual date exceptions through the end date. Existing appointments
                    stay scheduled.
                  </small>
                </fieldset>
              </>
            )}
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
