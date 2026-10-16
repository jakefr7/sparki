'use client';
import { useState } from 'react';
export type RecordsTask = {
  id: string;
  patientId: string | null;
  title: string;
  status: string;
  assignee: string;
  emailTo: string | null;
  emailSubject: string | null;
  emailBody: string | null;
};
export function TaskEmailDraft({ task, canEdit = true }: { task: RecordsTask; canEdit?: boolean }) {
  const [draft, setDraft] = useState({
    emailTo: task.emailTo ?? '',
    emailSubject: task.emailSubject ?? '',
    emailBody: task.emailBody ?? '',
  });
  const [saved, setSaved] = useState(draft);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  async function save() {
    setBusy(true);
    setError('');
    setSavedMessage('');
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!response.ok)
        throw new Error('Could not save the email draft. Check the recipient and try again.');
      setSaved(draft);
      setSavedMessage('Email draft saved.');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="records-email-draft">
      <summary>Records-request email draft</summary>
      <p>
        Review the request and confirm permission to share patient information before sending.
        Opening your email app does not mark this task complete.
      </p>
      <fieldset disabled={!canEdit || busy}>
        <label>
          To
          <input
            type="email"
            value={draft.emailTo}
            onChange={(event) => setDraft({ ...draft, emailTo: event.target.value })}
            maxLength={254}
          />
        </label>
        <label>
          Subject
          <input
            value={draft.emailSubject}
            onChange={(event) => setDraft({ ...draft, emailSubject: event.target.value })}
            maxLength={300}
          />
        </label>
        <label>
          Email body
          <textarea
            value={draft.emailBody}
            onChange={(event) => setDraft({ ...draft, emailBody: event.target.value })}
            maxLength={10000}
            rows={8}
          />
        </label>
        <button
          type="button"
          className="button-secondary"
          disabled={!dirty}
          onClick={() => void save()}
        >
          Save email draft
        </button>
      </fieldset>
      {!dirty && saved.emailTo ? (
        <a
          className="button-secondary"
          href={`mailto:${encodeURIComponent(saved.emailTo)}?subject=${encodeURIComponent(saved.emailSubject)}&body=${encodeURIComponent(saved.emailBody)}`}
        >
          Open in email app
        </a>
      ) : (
        <p>
          {dirty
            ? 'Save your edits before opening the email.'
            : 'Add and save a recipient email address.'}
        </p>
      )}
      {savedMessage ? <p role="status">{savedMessage}</p> : null}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </details>
  );
}
