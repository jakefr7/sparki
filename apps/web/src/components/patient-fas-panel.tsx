'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useCurrentUser } from '../lib/use-current-user';

interface Assessment {
  id: string;
  visitId: string;
  score: number;
  handlingNotes: string | null;
  authorName: string;
  createdAt: string;
}
interface AssessmentPage {
  items: Assessment[];
  nextCursor: string | null;
  timeZone?: string;
}
interface PendingAssessment {
  requestId: string;
  score: number;
  handlingNotes: string;
}

const FAS_SCORES = [0, 1, 2, 3, 4, 5] as const;
// Same clinical roles the API accepts; it remains the authority.
const RECORDING_ROLES = ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'];

function useFasHistory(patientId: string, timeZone?: string) {
  const [historyTimeZone, setHistoryTimeZone] = useState(timeZone);
  const [items, setItems] = useState<Assessment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const current = ++generation.current;
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(
          `/api/patients/${encodeURIComponent(patientId)}/fas${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error('Could not load handling history.');
        const result = (await response.json()) as AssessmentPage;
        if (current !== generation.current) return;
        setItems((previous) =>
          cursor
            ? [...previous, ...result.items].filter(
                (item, index, all) => all.findIndex((other) => other.id === item.id) === index,
              )
            : result.items,
        );
        setNextCursor(result.nextCursor);
        setHistoryTimeZone(result.timeZone ?? timeZone);
      } catch {
        if (current === generation.current)
          setLoadError('Could not load handling history. Try again.');
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [patientId, timeZone],
  );
  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);
  // A saved assessment supersedes any history request still in flight.
  const prepend = useCallback((assessment: Assessment) => {
    generation.current += 1;
    setLoading(false);
    setItems((previous) => [assessment, ...previous.filter((item) => item.id !== assessment.id)]);
  }, []);
  return { items, nextCursor, loading, loadError, historyTimeZone, load, prepend };
}

type FasHistory = ReturnType<typeof useFasHistory>;

function FasTime({ value, timeZone }: { value: string; timeZone: string | undefined }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString([], {
        ...(timeZone ? { timeZone } : {}),
        dateStyle: 'medium',
        timeStyle: 'short',
      })}
    </time>
  );
}

function FasHistoryList({ history, visitId }: { history: FasHistory; visitId?: string }) {
  const { items, nextCursor, loading, historyTimeZone, load } = history;
  return (
    <details>
      <summary>
        Handling history ({items.length}
        {nextCursor ? '+' : ''})
      </summary>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.score}/5</strong> — {item.authorName} ·{' '}
            <FasTime value={item.createdAt} timeZone={historyTimeZone} />
            {visitId && item.visitId === visitId ? ' · This visit' : ''}
            {item.handlingNotes ? (
              <p style={{ whiteSpace: 'pre-wrap' }}>{item.handlingNotes}</p>
            ) : null}
          </li>
        ))}
      </ol>
      {nextCursor ? (
        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={() => void load(nextCursor)}
        >
          {loading ? 'Loading…' : 'Load older assessments'}
        </button>
      ) : null}
    </details>
  );
}

function FasLoadError({ history }: { history: FasHistory }) {
  const { items, nextCursor, loading, loadError, load } = history;
  if (!loadError) return null;
  return (
    <p role="alert">
      {loadError}{' '}
      <button
        type="button"
        disabled={loading}
        onClick={() => void load(items.length ? (nextCursor ?? undefined) : undefined)}
      >
        Retry history
      </button>
    </p>
  );
}

/** Read-only handling history for the patient profile. */
export function PatientFasPanel({ patientId }: { patientId: string }) {
  const history = useFasHistory(patientId);
  const { items, loading, loadError, historyTimeZone } = history;
  const latest = items[0];
  return (
    <section className="profile-card profile-card--wide" aria-label="Fear, anxiety and stress">
      <h2>Fear, anxiety and stress</h2>
      <p>
        {latest
          ? `Latest recorded FAS score: ${latest.score}/5`
          : loading
            ? 'Loading handling history…'
            : loadError
              ? 'Handling history unavailable'
              : 'No FAS score recorded'}
      </p>
      {latest ? (
        <p>
          <small>
            Recorded by {latest.authorName} ·{' '}
            <FasTime value={latest.createdAt} timeZone={historyTimeZone} />
          </small>
        </p>
      ) : null}
      {latest?.handlingNotes ? (
        <p style={{ whiteSpace: 'pre-wrap' }}>{latest.handlingNotes}</p>
      ) : null}
      {items.length ? <FasHistoryList history={history} /> : null}
      <FasLoadError history={history} />
    </section>
  );
}

/**
 * The latest handling observation as one line inside a visit form, with the
 * score entry opened on request. Each save appends an attributed assessment.
 */
export function VisitFasAssessment({
  patientId,
  visitId,
  readOnly = false,
  timeZone,
}: {
  patientId: string;
  visitId: string;
  readOnly?: boolean;
  timeZone?: string | undefined;
}) {
  const { user } = useCurrentUser();
  const history = useFasHistory(patientId, timeZone);
  const { items, loading, loadError, historyTimeZone } = history;
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  // Kept after an unconfirmed save so the retry resends the identical request.
  const [pending, setPending] = useState<PendingAssessment | null>(null);
  const canRecord = !readOnly && RECORDING_ROLES.includes(user?.role ?? '');
  const latest = items[0];

  function closeEditor() {
    setPending(null);
    setEditing(false);
    setScore(null);
    setNotes('');
    setSaveError(null);
  }

  function cancel() {
    // An unconfirmed save may already be stored; show what the server kept.
    if (pending) void history.load();
    closeEditor();
  }

  async function save() {
    if (!canRecord || saving || score === null) return;
    const payload = pending ?? {
      requestId: crypto.randomUUID(),
      score,
      handlingNotes: notes.trim(),
    };
    setPending(payload);
    setSaving(true);
    setSaveError(null);
    setSavedMessage('');
    try {
      const response = await fetch(`/api/visits/${encodeURIComponent(visitId)}/fas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (response.status < 500) {
          // A definite validation/conflict rejection can be corrected and resubmitted.
          setPending(null);
          setSaveError(body.message ?? 'Could not save the score.');
        } else {
          setSaveError('Could not confirm the save. Retry to finish recording this score.');
        }
        return;
      }
      const assessment = (await response.json()) as Assessment;
      history.prepend(assessment);
      closeEditor();
      setSavedMessage(`FAS score ${assessment.score}/5 recorded.`);
    } catch {
      setSaveError('Could not confirm the save. Retry to finish recording this score.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="visit-fas" role="group" aria-labelledby={headingId}>
      <div className="visit-fas__summary">
        <div>
          <span className="visit-fas__label" id={headingId}>
            Fear, anxiety and stress
          </span>
          <p className="visit-fas__latest">
            {latest ? (
              <>
                <strong>{latest.score}/5</strong>
                {latest.visitId !== visitId ? ' · Earlier visit' : ''} · Recorded by{' '}
                {latest.authorName} ·{' '}
                <FasTime value={latest.createdAt} timeZone={historyTimeZone} />
              </>
            ) : loading ? (
              'Loading…'
            ) : loadError ? (
              'Handling history unavailable'
            ) : (
              'No FAS score recorded'
            )}
          </p>
          {latest?.handlingNotes ? (
            <p className="visit-fas__notes">{latest.handlingNotes}</p>
          ) : null}
        </div>
        {canRecord && !editing && !(loading && !items.length) ? (
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setSavedMessage('');
              setEditing(true);
            }}
          >
            {latest ? 'Reassess' : 'Add score'}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="visit-fas__editor">
          <fieldset className="physical-exam-pill-field" disabled={saving || Boolean(pending)}>
            <legend>FAS score (0–5)</legend>
            <div className="physical-exam-pills physical-exam-pills--score">
              {FAS_SCORES.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={score === value}
                  className={score === value ? 'is-selected' : ''}
                  onClick={() => setScore(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="visit-fas__field">
            <span>Handling notes (optional)</span>
            <textarea
              value={notes}
              maxLength={2000}
              rows={2}
              disabled={saving || Boolean(pending)}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Observed behavior and handling that helped"
            />
          </label>
          {saveError ? (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="visit-fas__editor-actions">
            <button type="button" className="button-secondary" disabled={saving} onClick={cancel}>
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={saving || score === null}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : pending ? 'Retry save' : 'Save score'}
            </button>
          </div>
        </div>
      ) : null}
      <span className="sr-only" role="status">
        {savedMessage}
      </span>
      {items.length > 1 ? <FasHistoryList history={history} visitId={visitId} /> : null}
      <FasLoadError history={history} />
    </div>
  );
}
