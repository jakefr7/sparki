import { notFound } from 'next/navigation';
import { ExamFindingsPanel } from '../../../components/exam-findings-panel';
import { VisitIntakeWorkspace } from '../../../components/visit-intake-workspace';
import { VisitDischargePanel } from '../../../components/visit-discharge-panel';
import { VisitWorkItemsPanel } from '../../../components/visit-work-items-panel';
import { PostExamReview } from '../../../components/post-exam-review';
import { DashboardShell } from '../../../components/dashboard-shell';
import { env } from '../../../lib/env';
import { authenticatedServerFetch } from '../../../lib/server-api';
import { clientDisplayName, type VisitDetail } from '../../../lib/patient-types';

async function getVisit(id: string): Promise<VisitDetail | null> {
  const response = await authenticatedServerFetch(new URL(`/visits/${id}`, env.API_URL));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load visit (${response.status})`);
  }
  return response.json() as Promise<VisitDetail>;
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
  return person.displayName ?? `${person.firstName} ${person.lastName}`;
}

function examStatusForState(state: string): { label: string; detail: string } | null {
  if (state === 'VeterinarianExamReady') {
    return {
      label: 'Ready for doctor',
      detail: 'The intake details are complete and the patient is waiting for the exam.',
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
  const backHref = openedFromCommandCenter ? '/' : '/today';
  const examStatus = examStatusForState(visit.state);
  // Care-plan execution begins only after the veterinarian completes the
  // exam. Showing it during ExamInProgress competes with exam documentation
  // and implies downstream work should be ordered before the exam is done.
  const showClinicalWork = Boolean(visit.examFindings?.completedAt);
  const showDischarge = Boolean(visit.examFindings?.completedAt);

  return (
    <DashboardShell
      activeHref="/today"
      eyebrow="Visit workspace"
      title={visit.patient.name}
      workspace
    >
      <div className="visit-workspace">
        <VisitIntakeWorkspace
          visitId={visit.id}
          visitType={visit.visitType}
          state={visit.state}
          intake={visit.intake}
          patientAlerts={visit.patient.patientAlerts}
          patientMedications={visit.patient.medications}
          assignedTechnician={personLabel(visit.assignedTechnician)}
          primaryVeterinarian={personLabel(visit.primaryVeterinarian)}
          room={visit.appointment?.room ?? null}
          appointment={visit.appointment}
          patient={{
            name: visit.patient.name,
            species: visit.patient.species,
            breed: visit.patient.breed,
            sex: visit.patient.sex,
            imageUrl: visit.patient.imageUrl,
            estimatedAge: visit.patient.estimatedAge,
            weight: visit.patient.weight,
          }}
          clientName={visit.client ? clientDisplayName(visit.client) : null}
          reason={visit.reason}
          backHref={backHref}
          examStatusNote={examStatus?.label ?? null}
          headerOnly={Boolean(visit.examFindings?.completedAt)}
        />

        {visit.state === 'VeterinarianExamInProgress' ? <ExamFindingsPanel visitId={visit.id} state={visit.state} examFindings={visit.examFindings} intake={visit.intake} /> : null}

        {showClinicalWork ? <PostExamReview visit={visit} /> : null}

        {showClinicalWork ? <VisitWorkItemsPanel visit={visit} /> : null}
        {showDischarge ? <VisitDischargePanel visit={visit} /> : null}
      </div>
    </DashboardShell>
  );
}
