'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '../lib/use-current-user';

export function VisitExamHandoff({ visitId, clinician }: { visitId: string; clinician: string }) {
  const { user } = useCurrentUser();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const authorized = ['OWNER', 'VETERINARIAN'].includes(user?.role ?? '');
  async function start() {
    setStarting(true); setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/exam/start`, { method: 'POST' });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Could not start exam.');
      router.refresh();
      // The exam replaces this screen; open it from the top, not at this button's scroll offset.
      section.current?.closest('.visit-workspace')?.scrollTo({ top: 0 });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start exam.'); }
    finally { setStarting(false); }
  }
  return <section ref={section} className="exam-findings-card" aria-label="Exam handoff"><h2>Ready for exam</h2><p>Intake is complete. Assigned clinician: {clinician}. Starting the exam does not change record signoff responsibility.</p>{authorized ? <button type="button" className="button-primary" disabled={starting} onClick={() => void start()}>{starting ? 'Starting exam…' : 'Start exam'}</button> : <p>An owner or veterinarian can start the exam.</p>}{error ? <p role="alert">{error}</p> : null}</section>;
}
