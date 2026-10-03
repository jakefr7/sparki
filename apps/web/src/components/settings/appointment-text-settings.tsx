'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  communicationRequest as request,
  communicationError,
} from '../../lib/client-communication';
import './appointment-text-settings.css';

type Kind = 'CONFIRMATION' | 'REMINDER' | 'RESCHEDULED' | 'CANCELLED';
interface Rule {
  id: string | null;
  kind: Kind;
  enabled: boolean;
  offsetMinutes: number | null;
  template: string;
}
interface TextSettings {
  saved: boolean;
  timeZone: string;
  updatedAt: string | null;
  sendWindow: { startMinute: number; endMinute: number };
  rules: Rule[];
  appointmentTypes: { id: string; name: string; isActive: boolean; automatedMessages: boolean }[];
  texting: { mode: string; visible: boolean };
  placeholders: Record<Kind, string[]>;
  limits: {
    maxTemplateLength: number;
    maxReminders: number;
    minReminderOffsetMinutes: number;
    maxReminderOffsetMinutes: number;
  };
}
const titles: Record<Kind, string> = {
  CONFIRMATION: 'Booking confirmation',
  REMINDER: 'Appointment reminder',
  RESCHEDULED: 'Rescheduled appointment',
  CANCELLED: 'Cancellation notice',
};
const descriptions: Record<Kind, string> = {
  CONFIRMATION: 'After a new appointment is booked.',
  REMINDER: 'Before the appointment starts.',
  RESCHEDULED: 'When the appointment time changes.',
  CANCELLED: 'When an appointment is cancelled.',
};
function clock(minute: number) {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
function minute(value: string) {
  const [hour, minutes] = value.split(':').map(Number);
  return hour! * 60 + minutes!;
}

export function AppointmentTextSettings() {
  const [settings, setSettings] = useState<TextSettings | null>(null);
  const [original, setOriginal] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [previews, setPreviews] = useState<
    Record<number, { text: string; segments: number; problems: string[] }>
  >({});
  const dirty = !!settings && JSON.stringify(settings) !== original;
  useEffect(() => {
    const controller = new AbortController();
    void request<TextSettings>('notification-settings', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setSettings(result);
          setOriginal(JSON.stringify(result));
          setError('');
        }
      })
      .catch((issue) => {
        if (!controller.signal.aborted) setError(communicationError(issue));
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function updateRule(index: number, changes: Partial<Rule>) {
    setSettings(
      (current) =>
        current && {
          ...current,
          rules: current.rules.map((rule, n) => (n === index ? { ...rule, ...changes } : rule)),
        },
    );
    setPreviews((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setNotice('');
  }
  async function preview(index: number) {
    if (!settings) return;
    const rule = settings.rules[index]!;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ text: string; segments: number; problems: string[] }>(
        'notification-settings/preview',
        { method: 'POST', body: JSON.stringify({ kind: rule.kind, template: rule.template }) },
      );
      setPreviews((current) => ({ ...current, [index]: result }));
    } catch (issue) {
      setError(communicationError(issue));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request<TextSettings>('notification-settings', {
        method: 'PUT',
        body: JSON.stringify({
          sendWindow: settings.sendWindow,
          rules: settings.rules.map((rule) => ({ ...rule, id: rule.id ?? undefined })),
          appointmentTypes: settings.appointmentTypes.map(({ id, automatedMessages }) => ({
            id,
            automatedMessages,
          })),
        }),
      });
      setSettings(result);
      setOriginal(JSON.stringify(result));
      setPreviews({});
      setNotice(
        'Appointment text settings saved. Existing reminders will be updated in the background.',
      );
    } catch (issue) {
      setError(communicationError(issue));
    } finally {
      setBusy(false);
    }
  }
  if (!settings)
    return (
      <section className="ats">
        <h2>Appointment texts</h2>
        {error ? (
          <p role="alert">
            {error} <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
          </p>
        ) : (
          <p role="status">Loading clinic settings…</p>
        )}
      </section>
    );
  return (
    <section className="ats">
      <header>
        <div>
          <p className="ats-eyebrow">Client communication</p>
          <h2>Appointment texts</h2>
          <p>Choose what clients receive, when it goes, and how it sounds.</p>
        </div>
        <span>
          {settings.texting.mode === 'SIMULATED'
            ? 'Simulation only'
            : settings.texting.visible
              ? 'Texting active'
              : 'Texting unavailable'}
        </span>
      </header>
      <div className="ats-notice">
        Only clients with staff-recorded agreement receive automated texts. Booking succeeds
        regardless of texting. The clinic name and “Reply STOP to opt out” are always included.
      </div>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy} className="ats-hours">
          <legend>Sending hours</legend>
          <p>
            Clinic time · {settings.timeZone}. Messages due outside these hours wait; notices that
            would arrive after the appointment are skipped.
          </p>
          <div>
            <label>
              Send from
              <input
                type="time"
                required
                value={clock(settings.sendWindow.startMinute)}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sendWindow: { ...settings.sendWindow, startMinute: minute(event.target.value) },
                  })
                }
              />
            </label>
            <label>
              Send until
              <input
                type="time"
                required
                value={clock(settings.sendWindow.endMinute)}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sendWindow: {
                      ...settings.sendWindow,
                      endMinute: minute(event.target.value) || 1440,
                    },
                  })
                }
              />
            </label>
          </div>
          {settings.sendWindow.endMinute === 1440 && (
            <small>12:00 AM means midnight at the end of the day.</small>
          )}
        </fieldset>
        <div className="ats-rules">
          {settings.rules.map((rule, index) => (
            <fieldset
              key={rule.id ?? `${rule.kind}-${index}`}
              disabled={busy}
              className={`ats-rule${rule.enabled ? ' ats-rule--enabled' : ''}`}
            >
              <legend>{titles[rule.kind]}</legend>
              <div className="ats-rule-heading">
                <p>{descriptions[rule.kind]}</p>
                <label className="ats-toggle">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) => updateRule(index, { enabled: event.target.checked })}
                  />
                  {rule.enabled ? 'On' : 'Off'}
                </label>
              </div>
              {rule.kind === 'REMINDER' && (
                <div className="ats-offset">
                  <label>
                    Send reminder
                    <select
                      value={
                        [60, 120, 1440, 2880, 10080].includes(rule.offsetMinutes ?? 0)
                          ? String(rule.offsetMinutes)
                          : 'custom'
                      }
                      onChange={(event) =>
                        updateRule(index, {
                          offsetMinutes:
                            event.target.value === 'custom' ? 30 : Number(event.target.value),
                        })
                      }
                    >
                      <option value="60">1 hour before</option>
                      <option value="120">2 hours before</option>
                      <option value="1440">1 day before</option>
                      <option value="2880">2 days before</option>
                      <option value="10080">1 week before</option>
                      <option value="custom">Custom timing</option>
                    </select>
                  </label>
                  {![60, 120, 1440, 2880, 10080].includes(rule.offsetMinutes ?? 0) && (
                    <label>
                      Custom minutes before appointment
                      <input
                        type="number"
                        required
                        min={settings.limits.minReminderOffsetMinutes}
                        max={settings.limits.maxReminderOffsetMinutes}
                        value={rule.offsetMinutes ?? 30}
                        onChange={(event) =>
                          updateRule(index, { offsetMinutes: Number(event.target.value) })
                        }
                      />
                    </label>
                  )}
                </div>
              )}
              <label>
                Message wording
                <textarea
                  maxLength={settings.limits.maxTemplateLength}
                  required
                  value={rule.template}
                  rows={3}
                  onChange={(event) => updateRule(index, { template: event.target.value })}
                />
              </label>
              <details>
                <summary>Available message fields</summary>
                <div className="ats-fields">
                  {settings.placeholders[rule.kind].map((field) => (
                    <button
                      key={field}
                      type="button"
                      onClick={() => updateRule(index, { template: rule.template + `{${field}}` })}
                    >{`{${field}}`}</button>
                  ))}
                </div>
              </details>
              <div className="ats-rule-actions">
                <button type="button" onClick={() => void preview(index)}>
                  Preview client text
                </button>
                {rule.kind === 'REMINDER' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSettings({
                        ...settings,
                        rules: settings.rules.filter((_, n) => n !== index),
                      });
                      setPreviews({});
                    }}
                  >
                    Remove reminder
                  </button>
                )}
              </div>
              {previews[index] && (
                <div className="ats-preview">
                  <strong>Example only · {previews[index]!.segments} SMS segment(s)</strong>
                  <p>{previews[index]!.text}</p>
                  {previews[index]!.problems.map((problem) => (
                    <p className="ats-error" key={problem}>
                      {problem}
                    </p>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
        </div>
        <button
          type="button"
          disabled={
            busy ||
            settings.rules.filter((rule) => rule.kind === 'REMINDER').length >=
              settings.limits.maxReminders
          }
          onClick={() => {
            const reminder = settings.rules.find((rule) => rule.kind === 'REMINDER');
            const used = new Set(
              settings.rules
                .filter((rule) => rule.kind === 'REMINDER')
                .map((rule) => rule.offsetMinutes),
            );
            let offset = 1440;
            while (used.has(offset)) offset += 1440;
            setSettings({
              ...settings,
              rules: [
                ...settings.rules,
                {
                  id: null,
                  kind: 'REMINDER',
                  enabled: false,
                  offsetMinutes: offset,
                  template:
                    reminder?.template ??
                    '{patient_name} has an appointment on {appointment_date} at {appointment_time}.',
                },
              ],
            });
          }}
        >
          Add reminder
        </button>
        <fieldset disabled={busy} className="ats-types">
          <legend>Appointment types</legend>
          <p>
            Enabled messages apply only to selected types. Carefully choose whether sensitive
            appointments should receive routine notices.
          </p>
          {!settings.appointmentTypes.length && (
            <p>No appointment types have been configured yet.</p>
          )}
          {settings.appointmentTypes.map((type) => (
            <label key={type.id}>
              <input
                type="checkbox"
                checked={type.automatedMessages}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    appointmentTypes: settings.appointmentTypes.map((current) =>
                      current.id === type.id
                        ? { ...current, automatedMessages: event.target.checked }
                        : current,
                    ),
                  })
                }
              />
              {type.name}
              {!type.isActive ? ' (inactive)' : ''}
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="ats-error" role="alert">
            {error} Your changes are still here.
          </p>
        )}
        {notice && (
          <p className="ats-success" role="status">
            {notice}
          </p>
        )}
        <footer>
          <span>
            {dirty
              ? 'Unsaved changes'
              : settings.saved
                ? 'Saved clinic settings'
                : 'Nothing enabled until you save'}
          </span>
          <button className="ats-save" type="submit" disabled={busy || !dirty}>
            {busy ? 'Working…' : 'Save text settings'}
          </button>
        </footer>
      </form>
    </section>
  );
}
