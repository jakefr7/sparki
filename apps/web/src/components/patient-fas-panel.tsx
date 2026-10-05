'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

export function PatientFasPanel({
  patientId,
  visitId,
  readOnly = false,
  timeZone,
}: {
  patientId: string;
  visitId?: string;
  readOnly?: boolean;
  timeZone?: string | undefined;
}) {
  const { user } = useCurrentUser();
  const [historyTimeZone, setHistoryTimeZone] = useState(timeZone);
  const [items, setItems] = useState<Assessment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef<{ requestId: string; score: number; handlingNotes: string } | null>(null);
  const generation = useRef(0);
  const canRecord = Boolean(
    visitId &&
    !readOnly &&
    ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(user?.role ?? ''),
  );
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
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canRecord || saving || score === '') return;
    const payload = pending.current ?? {
      requestId: crypto.randomUUID(),
      score: Number(score),
      handlingNotes: notes.trim(),
    };
    pending.current = payload;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/visits/${encodeURIComponent(visitId!)}/fas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        // A definite validation/conflict rejection can be corrected and resubmitted.
        if (response.status < 500) pending.current = null;
        throw new Error(body.message ?? 'Could not save the assessment.');
      }
      const assessment = (await response.json()) as Assessment;
      generation.current += 1;
      setLoading(false);
      setItems((previous) => [assessment, ...previous.filter((item) => item.id !== assessment.id)]);
      pending.current = null;
      setScore('');
      setNotes('');
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Could not save. Try again to recover this assessment.',
      );
    } finally {
      setSaving(false);
    }
  }
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
            <time dateTime={latest.createdAt}>
              {new Date(latest.createdAt).toLocaleString([], {
                ...(historyTimeZone ? { timeZone: historyTimeZone } : {}),
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
            {visitId && latest.visitId !== visitId ? ' · Earlier visit' : ''}
          </small>
        </p>
      ) : null}
      {latest?.handlingNotes ? (
        <p style={{ whiteSpace: 'pre-wrap' }}>{latest.handlingNotes}</p>
      ) : null}
      {canRecord ? (
        <form className="patient-inline-form" onSubmit={(event) => void save(event)}>
          <p>
            Record a score from this visit. Add another assessment when behavior changes; earlier
            observations stay in the history.
          </p>
          <label>
            FAS score (0–5)
            <select
              value={score}
              required
              disabled={saving || Boolean(pending.current)}
              onChange={(event) => {
                setScore(event.target.value);
                setSaved(false);
              }}
            >
              <option value="">Choose a score</option>
              {[0, 1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Handling notes (optional)
            <textarea
              value={notes}
              maxLength={2000}
              rows={3}
              disabled={saving || Boolean(pending.current)}
              onChange={(event) => {
                setNotes(event.target.value);
                setSaved(false);
              }}
              placeholder="Observed behavior and handling that helped"
            />
          </label>
          <button className="button-primary" type="submit" disabled={saving || score === ''}>
            {saving ? 'Saving…' : pending.current ? 'Retry assessment save' : 'Record assessment'}
          </button>
          {saveError ? <p role="alert">{saveError}</p> : null}
          {saved ? <p role="status">Assessment recorded.</p> : null}
        </form>
      ) : visitId && readOnly ? (
        <p>This visit is read-only. Record new observations during an active visit.</p>
      ) : null}
      {items.length ? (
        <details>
          <summary>
            Handling history ({items.length}
            {nextCursor ? '+' : ''})
          </summary>
          <ol>
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.score}/5</strong> — {item.authorName} ·{' '}
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString([], {
                    ...(historyTimeZone ? { timeZone: historyTimeZone } : {}),
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
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
      ) : null}
      {loadError ? (
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
      ) : null}
    </section>
  );
}
