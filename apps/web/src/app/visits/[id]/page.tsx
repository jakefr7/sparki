import { VisitCareSections } from '../../../components/visit-care-sections';
import { notFound } from 'next/navigation';
import { ExamFindingsPanel } from '../../../components/exam-findings-panel';
import { VisitIntakeWorkspace } from '../../../components/visit-intake-workspace';
import { VisitDischargePanel } from '../../../components/visit-discharge-panel';
import { VisitWorkItemsPanel } from '../../../components/visit-work-items-panel';
import { PostExamReview } from '../../../components/post-exam-review';
import { VisitJourneyStatus } from '../../../components/visit-journey-status';
import { VisitRecordPanel } from '../../../components/visit-record-panel';
import { ClinicalAttachmentsPanel } from '../../../components/clinical-attachments-panel';
import { VisitResumeLocation } from '../../../components/visit-resume-location';
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
  searchParams: Promise<{ from?: string; view?: string }>;
}) {
  const { id } = await params;
  const { from, view } = await searchParams;
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
  const examComplete = Boolean(visit.examFindings?.completedAt);
  const reviewingExam = examComplete && view === 'exam';
  const showClinicalWork = examComplete && !reviewingExam;

  const visitHref = `/visits/${encodeURIComponent(visit.id)}`;
  const originQuery = openedFromCommandCenter ? '&from=command-center' : '';
  const projectedSection = visit.phase === 'RecordClosure' ? 'visit-record' : visit.phase === 'Discharge' ? 'visit-discharge' : 'visit-care-plan';
  const recordSigned = visit.soapNotes.some((note) => note.status === 'Locked');
  const openClinicalWork = visit.workItems.some((item) => {
    if (!['Diagnostic', 'Treatment', 'Medication'].includes(item.type)) return false;
    return ['Pending', 'InProgress'].includes(item.status);
  });
  const attachmentsPanel = (
    <ClinicalAttachmentsPanel
      patientId={visit.patient.id}
      visitId={visit.id}
      attachments={visit.clinicalAttachments}
      finalized={recordSigned}
    />
  );

  return (
    <DashboardShell
      activeHref="/today"
      eyebrow="Visit workspace"
      title={visit.patient.name}
      workspace
    >
      <div className={`visit-workspace${examComplete ? ' visit-workspace--post-exam' : ''}`}>
        {!examComplete ? <VisitResumeLocation visitId={visit.id} projectedSection={projectedSection} /> : null}
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

        <VisitJourneyStatus visit={visit} />

        {visit.state === 'VeterinarianExamInProgress' || reviewingExam ? <ExamFindingsPanel returnToCarePlan={reviewingExam ? `${visitHref}?view=plan${originQuery}` : undefined} visitId={visit.id} state={visit.state} examFindings={visit.examFindings} intake={visit.intake} /> : null}

        {showClinicalWork && !recordSigned ? <VisitCareSections
          examHref={`${visitHref}?view=exam${originQuery}`}
          canContinueToDischarge={!openClinicalWork}
          initialSection={view === 'plan' ? 0 : view === 'care' ? 1 : view === 'discharge' ? 2 : view === 'record' ? 3 : visit.phase === 'RecordClosure' ? 3 : visit.phase === 'Discharge' ? 2 : 0}
          plan={<div className="care-plan-workspace care-plan-workspace--focused"><details className="visit-exam-reference"><summary>Exam findings</summary><PostExamReview visit={visit} /></details><VisitWorkItemsPanel visit={visit} /></div>}
          care={<VisitWorkItemsPanel visit={visit} mode="care" />}
          discharge={<VisitDischargePanel visit={visit} />}
          record={<VisitRecordPanel visit={visit} attachments={attachmentsPanel} />}
        /> : null}
        {showClinicalWork && recordSigned ? (
          <div className="visit-signed-record">
            <p className={`visit-signed-record__status${visit.checkout ? '' : ' visit-signed-record__status--pending'}`}>
              {visit.checkout
                ? 'Visit complete — record signed and patient checked out.'
                : 'Clinical work is done. Front-desk checkout is the only step left.'}
            </p>
            <VisitRecordPanel visit={visit} attachments={attachmentsPanel} />
            {!visit.checkout ? <VisitDischargePanel visit={visit} /> : null}
          </div>
        ) : null}
        {!examComplete && visit.state !== 'VeterinarianExamInProgress' ? attachmentsPanel : null}
      </div>
    </DashboardShell>
  );
}
