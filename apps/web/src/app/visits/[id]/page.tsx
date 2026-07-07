import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExamFindingsPanel } from '../../../components/exam-findings-panel';
import { VisitIntakePanel } from '../../../components/visit-intake-panel';
import { VisitWorkflowProgress } from '../../../components/visit-workflow-progress';
import { env } from '../../../lib/env';
import {
  appointmentTypeLabel,
  clientDisplayName,
  type VisitDetail,
} from '../../../lib/patient-types';

async function getVisit(id: string): Promise<VisitDetail | null> {
  const response = await fetch(new URL(`/visits/${id}`, env.API_URL), { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load visit (${response.status})`);
  }
  return response.json() as Promise<VisitDetail>;
}

function enumLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function personLabel(
  person: {
    displayName: string | null;
    firstName: string;
    lastName: string;
    role: string;
  } | null,
): string {
  if (!person) return 'Unassigned';
  const name = person.displayName ?? `${person.firstName} ${person.lastName}`;
  return `${name} · ${enumLabel(person.role)}`;
}

function examStatusForState(state: string): { label: string; detail: string } | null {
  if (state === 'VeterinarianExamReady') {
    return {
      label: 'Ready for doctor',
      detail: 'Technician intake is complete and the patient is waiting for the exam.',
    };
  }
  if (state === 'VeterinarianExamInProgress') {
    return {
      label: 'Exam in progress',
      detail: 'The veterinarian has started the exam.',
    };
  }
  return null;
}

export default async function VisitWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const visit = await getVisit(id);
  if (!visit) {
    notFound();
  }

  const openedFromCommandCenter = from === 'command-center';
  const backHref = openedFromCommandCenter ? '/' : `/patients/${visit.patient.id}`;
  const backLabel = openedFromCommandCenter
    ? 'Back to Command Center'
    : `Back to ${visit.patient.name}`;
  const appointmentContext = visit.appointment
    ? `${appointmentTypeLabel(visit.appointment.type)} · ${new Date(
        visit.appointment.scheduledAt,
      ).toLocaleString()}`
    : 'Walk-in / no appointment';
  const examStatus = examStatusForState(visit.state);

  return (
    <main className="page page--wide">
      <Link href={backHref} className="back-link">
        ← {backLabel}
      </Link>

      <header className="patient-header patient-header--command">
        <div>
          <p className="eyebrow">Visit Workspace</p>
          <h1>{visit.patient.name}</h1>
          <p className="patient-header__subtitle">
            {visit.patient.species}
            {visit.patient.breed ? ` · ${visit.patient.breed}` : ''} · {visit.reason}
          </p>
        </div>
        <div className="patient-header__status">
          <span className="patient-status">{enumLabel(visit.state)}</span>
          <span className="source-label">
            Opened {openedFromCommandCenter ? 'from Command Center' : 'from patient workspace'}
          </span>
        </div>
      </header>

      <VisitWorkflowProgress state={visit.state} compact />

      {examStatus && (
        <section className="visit-exam-status" aria-label="Exam status">
          <span>{examStatus.label}</span>
          <p>{examStatus.detail}</p>
        </section>
      )}

      <ul className="visit-summary-line" aria-label="Visit context summary">
        <li>
          <span className="visit-summary-line__label">Patient</span>
          {visit.patient.name}
        </li>
        <li>
          <span className="visit-summary-line__label">Client</span>
          {visit.client ? clientDisplayName(visit.client) : 'No client linked'}
        </li>
        <li>
          <span className="visit-summary-line__label">Reason</span>
          {visit.reason}
        </li>
        <li>
          <span className="visit-summary-line__label">Provider</span>
          {personLabel(visit.primaryVeterinarian)}
        </li>
        <li>
          <span className="visit-summary-line__label">Technician</span>
          {personLabel(visit.assignedTechnician)}
        </li>
      </ul>

      <VisitIntakePanel visitId={visit.id} state={visit.state} intake={visit.intake} />

      <ExamFindingsPanel
        visitId={visit.id}
        state={visit.state}
        examFindings={visit.examFindings}
      />

      <details className="visit-context-details">
        <summary>Appointment &amp; assignment details</summary>
        <div className="visit-context-details__body">
          <div>
            <span className="visit-context-details__label">Appointment</span>
            <p>{appointmentContext}</p>
          </div>
          <div>
            <span className="visit-context-details__label">Current owner</span>
            <p>{personLabel(visit.currentOwner)}</p>
          </div>
        </div>
      </details>
    </main>
  );
}
