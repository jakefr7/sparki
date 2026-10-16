'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ProviderFields,
  contactLabel,
  emptyProviders,
  providerPayload,
  type ProviderValue,
  type ReferralContact,
} from './provider-fields';
import { TaskEmailDraft, type RecordsTask } from './task-email-draft';
import { useCurrentUser } from '../lib/use-current-user';

type Link = { kind: string; contact: ReferralContact };
type PatientTask = RecordsTask & { assigneeId: string | null; createdById: string };
export function PatientProvidersPanel({ patientId }: { patientId: string }) {
  const { user } = useCurrentUser();
  const [saved, setSaved] = useState<ProviderValue>(emptyProviders);
  const [draft, setDraft] = useState<ProviderValue>(emptyProviders);
  const [editing, setEditing] = useState(false);
  const [tasks, setTasks] = useState<PatientTask[]>([]);
  const [staff, setStaff] = useState<Array<{ id: string; displayName: string; role: string }>>([]);
  const [contactId, setContactId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const requestKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [linksResponse, tasksResponse, staffResponse] = await Promise.all([
        fetch(`/api/patients/${patientId}/providers`),
        fetch('/api/tasks'),
        fetch('/api/staff'),
      ]);
      for (const [response, name] of [[linksResponse, 'patient providers'], [tasksResponse, 'records-request tasks'], [staffResponse, 'staff choices']] as const) {
        if (!response.ok) throw new Error(`Could not load ${name}. Please try again.`);
      }
      const links = (await linksResponse.json()) as Link[];
      const value = {
        referring: links.find((link) => link.kind === 'REFERRING')?.contact ?? null,
        additional: links.filter((link) => link.kind === 'ADDITIONAL').map((link) => link.contact),
      };
      setSaved(value);
      setDraft(value);
      setTasks(
        ((await tasksResponse.json()) as PatientTask[]).filter(
          (task) => task.patientId === patientId,
        ),
      );
      setStaff(
        ((await staffResponse.json()) as typeof staff).sort(
          (a, b) => Number(b.role === 'RECEPTIONIST') - Number(a.role === 'RECEPTIONIST'),
        ),
      );
      setLoaded(true);
      setError('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [patientId]);
  useEffect(() => {
    void load();
  }, [load]);
  const contacts = [saved.referring, ...saved.additional].filter((item): item is ReferralContact =>
    Boolean(item),
  );
  async function save() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/patients/${patientId}/providers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerPayload(draft)),
      });
      if (!response.ok) throw new Error('Could not save providers. Your changes are still here.');
      setSaved(draft);
      setEditing(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function request() {
    if (!contactId || !assigneeId) {
      setError('Choose a hospital and a staff assignee.');
      return;
    }
    requestKey.current ??= crypto.randomUUID();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/patients/${patientId}/records-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, assigneeId, requestKey: requestKey.current }),
      });
      if (!response.ok)
        throw new Error('Could not create the records request. Retry to recover the same task.');
      const task = (await response.json()) as PatientTask;
      setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
      requestKey.current = null;
      setRequesting(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleTask(task: PatientTask) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: task.status === 'Completed' ? 'Pending' : 'Completed' }),
      });
      if (!response.ok) throw new Error('Could not update the records-request task.');
      const updated = (await response.json()) as PatientTask;
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function canEditTask(task: PatientTask) {
    return Boolean(
      user && (!task.assigneeId || task.assigneeId === user.id || task.createdById === user.id),
    );
  }
  return (
    <section
      className="profile-card patient-providers"
      id="providers"
      aria-label="Providers and records"
    >
      <div className="profile-card__header">
        <p className="eyebrow">Care connections</p>
        <h2>Providers & records</h2>
        <p className="patient-providers__intro">Keep referring hospitals and outside medical records connected to this patient.</p>
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {loading ? <p className="patient-providers__loading" role="status">Loading care connections…</p> : null}
      {!loaded ? (
        !loading && error ? <button type="button" className="button-secondary" onClick={() => void load()}>Try again</button> : null
      ) : (
        <>
          {editing ? (
            <fieldset disabled={busy}>
              <legend>Patient providers</legend>
              <ProviderFields value={draft} onChange={setDraft} onBusyChange={setProviderBusy} />
              <button
                type="button"
                className="button-primary"
                disabled={providerBusy}
                onClick={() => void save()}
              >
                Save providers
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setDraft(saved);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </fieldset>
          ) : (
            <>
              {contacts.length ? (
                <ul>
                  {contacts.map((contact, index) => (
                    <li key={`${contact.id}-${index}`}>
                      <strong>
                        {saved.referring?.id === contact.id
                          ? 'Referring vet: '
                          : 'Additional provider: '}
                      </strong>
                      {contactLabel(contact)}
                      {contact.email ? ` · ${contact.email}` : ''}
                      {contact.phone ? ` · ${contact.phone}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="profile-compact-empty"><strong>No providers recorded</strong><span>Add a referring vet or another hospital to keep care coordinated and request past records.</span></div>
              )}
              <button type="button" className="button-secondary" onClick={() => setEditing(true)}>
                Edit providers
              </button>
              {contacts.length ? (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setContactId(contacts[0]!.id);
                    setAssigneeId('');
                    setRequesting(true);
                  }}
                >
                  Request records
                </button>
              ) : null}
            </>
          )}
          {requesting ? (
            <fieldset disabled={busy}>
              <legend>Request records</legend>
              <p>
                Creates a patient-linked task and an editable email draft. Nothing is sent
                automatically.
              </p>
              <label>
                Hospital
                <select
                  value={contactId}
                  onChange={(event) => {
                    setContactId(event.target.value);
                    requestKey.current = null;
                  }}
                >
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contactLabel(contact)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assign to
                <select
                  value={assigneeId}
                  onChange={(event) => {
                    setAssigneeId(event.target.value);
                    requestKey.current = null;
                  }}
                >
                  <option value="">Choose staff</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName} ·{' '}
                      {member.role === 'RECEPTIONIST'
                        ? 'Reception / CSR'
                        : member.role.toLowerCase().replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="button-primary" onClick={() => void request()}>
                Create records-request task
              </button>
              <button type="button" className="button-secondary" onClick={() => setRequesting(false)}>
                Cancel
              </button>
            </fieldset>
          ) : null}
          {tasks.map((task) => (
            <article key={task.id}>
              <h3>{task.title}</h3>
              <p>
                {task.status} · Assigned to {task.assignee}
              </p>
              <TaskEmailDraft task={task} canEdit={canEditTask(task)} />
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !canEditTask(task)}
                onClick={() => void toggleTask(task)}
              >
                {task.status === 'Completed'
                  ? 'Reopen records request'
                  : 'Mark records request complete'}
              </button>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
