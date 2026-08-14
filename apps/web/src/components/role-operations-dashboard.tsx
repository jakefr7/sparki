'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { dashboardRoleForUserRole, type DashboardRole } from '../lib/dashboard-role';
import type { DashboardVisitSummary, OperationsDashboard } from '../lib/patient-types';
import { useCurrentUser } from '../lib/use-current-user';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';
import { DashboardCard } from './dashboard-shell';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';

interface OpenRecordWorkItem {
  id: string;
  dueAt: string | null;
  assignee?: { id: string; displayName: string | null; firstName: string; lastName: string } | null;
  visit: {
    id: string;
    reason: string;
    departedAt: string | null;
    patient: { name: string };
    soapNotes: Array<{ status: string; updatedAt: string }>;
  };
}

const ROLE_COPY: Record<DashboardRole, { kicker: string; title: string; description: string }> = {
  receptionist: {
    kicker: 'Front desk command',
    title: 'Keep arrivals and departures moving',
    description: 'The patients that need a front-desk action now, ordered by urgency.',
  },
  technician: {
    kicker: 'Clinical support command',
    title: 'Own the next patient handoff',
    description: 'Intake, treatment, and discharge work in one calm, prioritized queue.',
  },
  veterinarian: {
    kicker: 'Medical command',
    title: 'See the next clinical decision',
    description: 'Patients waiting for an exam, plan, or record signoff—without hunting.',
  },
  manager: {
    kicker: 'Clinic command',
    title: 'Find friction before it becomes delay',
    description: 'Live bottlenecks, ownership gaps, and exceptions across today’s flow.',
  },
};

const ARRIVAL_STATES = new Set([
  'Arrived',
  'CheckInInProgress',
  'ArrivedWithExceptions',
  'Triaged',
  'Waiting',
  'ReadyForIntake',
]);
const CHECKOUT_STATES = new Set([
  'CheckoutReady',
  'CheckoutInProgress',
  'PaymentPending',
  'PaymentComplete',
]);
const INTAKE_STATES = new Set([
  'Arrived',
  'CheckInInProgress',
  'ArrivedWithExceptions',
  'Triaged',
  'Waiting',
  'ReadyForIntake',
  'IntakeInProgress',
]);
const EXAM_STATES = new Set(['VeterinarianExamReady', 'VeterinarianExamInProgress']);
const PLAN_STATES = new Set([
  'PlanDrafted',
  'EstimateNeeded',
  'EstimatePrepared',
  'ClientApprovalPending',
  'Approved',
  'PartiallyApproved',
  'DiagnosticsPending',
  'DiagnosticsInProgress',
  'ResultsPending',
  'ResultsReady',
  'VeterinarianReviewPending',
]);
const CARE_STATES = new Set([
  'TreatmentPending',
  'TreatmentInProgress',
  'TreatmentComplete',
  'MedicationPending',
  'ClientCommunicationPending',
  'FollowUpPending',
]);

function workItemsFor(visit: DashboardVisitSummary) {
  return visit.openWorkItems ?? [];
}

function exceptionsFor(visit: DashboardVisitSummary) {
  return visit.openExceptions ?? [];
}

function elapsedLabel(minutes: number) {
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function stageLabel(visit: DashboardVisitSummary) {
  if (CHECKOUT_STATES.has(visit.state)) return 'Checkout';
  if (INTAKE_STATES.has(visit.state))
    return visit.state === 'IntakeInProgress' ? 'Intake in progress' : 'Waiting for intake';
  if (EXAM_STATES.has(visit.state))
    return visit.state === 'VeterinarianExamReady' ? 'Ready for doctor' : 'Exam in progress';
  if (PLAN_STATES.has(visit.state)) return 'Plan & approval';
  if (CARE_STATES.has(visit.state)) return 'Treatment';
  if (visit.phase === 'Discharge') return 'Discharge';
  if (visit.phase === 'RecordClosure') return 'Record completion';
  return visit.phase ? visit.phase.replace(/([a-z])([A-Z])/g, '$1 $2') : 'In clinic';
}

function actionLabel(visit: DashboardVisitSummary, role: DashboardRole) {
  if (role === 'receptionist') {
    if (CHECKOUT_STATES.has(visit.state)) return 'Open checkout';
    if (ARRIVAL_STATES.has(visit.state)) return 'Continue check-in';
  }
  if (role === 'technician') {
    if (INTAKE_STATES.has(visit.state))
      return visit.state === 'IntakeInProgress' ? 'Continue intake' : 'Start intake';
    if (visit.phase === 'Discharge') return 'Prepare discharge';
    if (CARE_STATES.has(visit.state)) return 'Open treatment';
  }
  if (role === 'veterinarian') {
    if (EXAM_STATES.has(visit.state))
      return visit.state === 'VeterinarianExamReady' ? 'Start exam' : 'Continue exam';
    if (PLAN_STATES.has(visit.state) || CARE_STATES.has(visit.state)) return 'Review care plan';
    if (visit.phase === 'RecordClosure') return 'Finish record';
  }
  return 'Open visit';
}

function resumeSection(visit: DashboardVisitSummary, role: DashboardRole) {
  if (role === 'receptionist' && CHECKOUT_STATES.has(visit.state)) return 'visit-discharge';
  if (role === 'technician' && visit.phase === 'Discharge') return 'visit-discharge';
  if (role === 'veterinarian' && visit.phase === 'RecordClosure') return 'visit-record';
  return 'visit-care-plan';
}

function priorityFor(visit: DashboardVisitSummary) {
  let score = visit.elapsedMinutes;
  if (exceptionsFor(visit).some((exception) => exception.severity === 'Critical')) score += 240;
  if (!visit.currentOwner) score += 100;
  if (workItemsFor(visit).some((item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now()))
    score += 120;
  if (CHECKOUT_STATES.has(visit.state)) score += 40;
  return score;
}

function roleVisits(role: DashboardRole, visits: DashboardVisitSummary[], userId?: string) {
  const relevant = visits.filter((visit) => {
    if (role === 'receptionist')
      return ARRIVAL_STATES.has(visit.state) || CHECKOUT_STATES.has(visit.state);
    if (role === 'technician') {
      const owned = !userId || !visit.assignedTechnician || visit.assignedTechnician.id === userId;
      return (
        owned &&
        (INTAKE_STATES.has(visit.state) ||
          CARE_STATES.has(visit.state) ||
          visit.phase === 'Discharge')
      );
    }
    if (role === 'veterinarian') {
      const owned =
        !userId || !visit.primaryVeterinarian || visit.primaryVeterinarian.id === userId;
      return (
        owned &&
        (EXAM_STATES.has(visit.state) ||
          PLAN_STATES.has(visit.state) ||
          CARE_STATES.has(visit.state) ||
          visit.phase === 'RecordClosure')
      );
    }
    return visit.elapsedMinutes >= 30 || !visit.currentOwner || exceptionsFor(visit).length > 0;
  });
  return [...relevant].sort((a, b) => priorityFor(b) - priorityFor(a));
}

function metricData(
  role: DashboardRole,
  dashboard: OperationsDashboard,
  records: OpenRecordWorkItem[],
  roleQueue: DashboardVisitSummary[],
) {
  const visits = role === 'veterinarian' ? roleQueue : dashboard.activeVisits;
  if (role === 'receptionist')
    return [
      {
        value: visits.filter((visit) => ARRIVAL_STATES.has(visit.state)).length,
        label: 'Need check-in',
        tone: 'teal',
      },
      {
        value: visits.filter((visit) => CHECKOUT_STATES.has(visit.state)).length,
        label: 'At checkout',
        tone: 'amber',
      },
      {
        value: visits.filter((visit) => visit.client?.contactReady === false).length,
        label: 'Contact gaps',
        tone: 'rose',
      },
      { value: dashboard.summary.scheduledToday, label: 'Still scheduled', tone: 'blue' },
    ];
  if (role === 'technician')
    return [
      {
        value: visits.filter((visit) => INTAKE_STATES.has(visit.state)).length,
        label: 'Intake queue',
        tone: 'teal',
      },
      {
        value: visits
          .flatMap(workItemsFor)
          .filter((item) => ['Treatment', 'Medication', 'Diagnostic'].includes(item.type)).length,
        label: 'Clinical tasks',
        tone: 'blue',
      },
      {
        value: visits.filter((visit) => visit.phase === 'Discharge').length,
        label: 'Discharges',
        tone: 'amber',
      },
      {
        value: visits.filter((visit) => !visit.assignedTechnician).length,
        label: 'Need a tech',
        tone: 'rose',
      },
    ];
  if (role === 'veterinarian')
    return [
      {
        value: visits.filter((visit) => visit.state === 'VeterinarianExamReady').length,
        label: 'Ready for exam',
        tone: 'teal',
      },
      {
        value: visits.filter((visit) => PLAN_STATES.has(visit.state)).length,
        label: 'Plans to review',
        tone: 'blue',
      },
      {
        value: visits.filter((visit) =>
          exceptionsFor(visit).some((item) => item.severity === 'Critical'),
        ).length,
        label: 'Critical flags',
        tone: 'rose',
      },
      { value: records.length, label: 'Records open', tone: 'amber' },
    ];
  return [
    { value: visits.length, label: 'Active visits', tone: 'teal' },
    {
      value: visits.filter((visit) => visit.elapsedMinutes >= 45).length,
      label: 'Delayed 45+ min',
      tone: 'amber',
    },
    { value: visits.filter((visit) => !visit.currentOwner).length, label: 'Unowned', tone: 'rose' },
    { value: records.length, label: 'Incomplete records', tone: 'blue' },
  ];
}

function QueueRow({ visit, role }: { visit: DashboardVisitSummary; role: DashboardRole }) {
  const router = useRouter();
  const [startingExam, setStartingExam] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const critical = exceptionsFor(visit).some((exception) => exception.severity === 'Critical');
  const workItems = workItemsFor(visit);
  const overdue = workItems.some(
    (item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now(),
  );

  async function openVisit(event: MouseEvent<HTMLAnchorElement>) {
    if (role !== 'veterinarian' || visit.state !== 'VeterinarianExamReady') return;
    event.preventDefault();
    setStartingExam(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/exam/start`, { method: 'POST' });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Could not start exam.');
      router.push(`/visits/${visit.id}?from=command-center&resume=${resumeSection(visit, role)}`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not start exam.');
      setStartingExam(false);
    }
  }

  return (
    <Link
      href={`/visits/${visit.id}?from=command-center&resume=${resumeSection(visit, role)}`}
      className="role-queue-row"
      data-critical={critical || undefined}
      aria-disabled={startingExam || undefined}
      onClick={(event) => void openVisit(event)}
    >
      <PetPhotoPlaceholder
        name={visit.patient.name}
        species={visit.patient.species}
        imageUrl={visit.patient.imageUrl}
        className="pet-photo-placeholder role-queue-row__avatar"
      />
      <span className="role-queue-row__identity">
        <strong>{visit.patient.name}</strong>
        <small>
          {visit.client ? `${visit.client.firstName} ${visit.client.lastName}` : 'No client linked'}{' '}
          · {visit.reason}
        </small>
      </span>
      <span className="role-queue-row__stage">
        <strong>{stageLabel(visit)}</strong>
        <small>
          {actionError ?? visit.nextAction ?? `${workItems.length} open task${workItems.length === 1 ? '' : 's'}`}
        </small>
      </span>
      <span className="role-queue-row__signals">
        {critical ? <em data-tone="rose">Critical</em> : null}
        {overdue ? <em data-tone="amber">Overdue</em> : null}
        {!visit.currentOwner ? <em>Unowned</em> : null}
      </span>
      <span className="role-queue-row__time">
        <strong>{elapsedLabel(visit.elapsedMinutes)}</strong>
        <small>in clinic</small>
      </span>
      <span className="role-queue-row__action">
        {startingExam ? 'Starting exam…' : actionLabel(visit, role)} <b aria-hidden="true">→</b>
      </span>
    </Link>
  );
}

function RecordsQueue({
  records,
  manager = false,
}: {
  records: OpenRecordWorkItem[];
  manager?: boolean;
}) {
  return (
    <DashboardCard className="role-side-card" aria-labelledby="open-records-heading">
      <div className="role-side-card__header">
        <div>
          <p className="eyebrow">{manager ? 'Clinical closure' : 'Before you leave'}</p>
          <h2 id="open-records-heading">Records to Finish</h2>
        </div>
        <strong>{records.length}</strong>
      </div>
      <div className="role-mini-list">
        {records.slice(0, 5).map((item) => (
          <Link href={`/visits/${item.visit.id}?from=command-center&resume=visit-record`} key={item.id}>
            <span>
              <strong>{item.visit.patient.name}</strong>
              <small>
                {manager
                  ? (item.assignee?.displayName ??
                    ([item.assignee?.firstName, item.assignee?.lastName]
                      .filter(Boolean)
                      .join(' ') ||
                      'Unassigned'))
                  : item.visit.reason}
              </small>
            </span>
            <span>
              {item.visit.soapNotes[0]?.status ?? 'Draft'} <b>→</b>
            </span>
          </Link>
        ))}
        {records.length === 0 ? (
          <p>
            {manager
              ? 'No records are waiting for completion.'
              : 'All assigned records are complete.'}
          </p>
        ) : null}
      </div>
    </DashboardCard>
  );
}

function WatchList({ visits }: { visits: DashboardVisitSummary[] }) {
  const watched = visits
    .filter(
      (visit) =>
        visit.elapsedMinutes >= 30 || !visit.currentOwner || exceptionsFor(visit).length > 0,
    )
    .slice(0, 5);
  return (
    <DashboardCard className="role-side-card" aria-labelledby="watch-list-heading">
      <div className="role-side-card__header">
        <div>
          <p className="eyebrow">Needs awareness</p>
          <h2 id="watch-list-heading">Watch list</h2>
        </div>
        <strong>{watched.length}</strong>
      </div>
      <div className="role-mini-list">
        {watched.map((visit) => (
          <Link href={`/visits/${visit.id}?from=command-center&resume=${resumeSection(visit, 'manager')}`} key={visit.id}>
            <span>
              <strong>{visit.patient.name}</strong>
              <small>
                {!visit.currentOwner
                  ? 'No current owner'
                  : (exceptionsFor(visit)[0]?.reason ??
                    `${elapsedLabel(visit.elapsedMinutes)} in clinic`)}
              </small>
            </span>
            <span>
              {stageLabel(visit)} <b>→</b>
            </span>
          </Link>
        ))}
        {watched.length === 0 ? <p>No visits need extra attention.</p> : null}
      </div>
    </DashboardCard>
  );
}

export function RoleOperationsDashboard({ role }: { role: DashboardRole }) {
  const { user } = useCurrentUser();
  const { dashboard, loading, error } = useOperationsDashboard();
  const [records, setRecords] = useState<OpenRecordWorkItem[]>([]);

  useEffect(() => {
    if (role !== 'veterinarian' && role !== 'manager') return;
    fetch(role === 'manager' ? '/api/visits/records/open' : '/api/visits/records/open/mine', {
      cache: 'no-store',
    })
      .then((response) => (response.ok ? (response.json() as Promise<OpenRecordWorkItem[]>) : []))
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [role, dashboard?.generatedAt]);

  const queueUserId = dashboardRoleForUserRole(user?.role) === role ? user?.id : undefined;
  const queue = useMemo(
    () => roleVisits(role, dashboard?.activeVisits ?? [], queueUserId),
    [dashboard, role, queueUserId],
  );
  const metrics = dashboard ? metricData(role, dashboard, records, queue) : [];
  const copy = ROLE_COPY[role];

  if (loading)
    return (
      <div className="ops-panel-state ops-panel-state--loading">Building your live worklist…</div>
    );
  if (error || !dashboard)
    return (
      <div className="ops-panel-state ops-panel-state--error" role="alert">
        <strong>Dashboard could not load.</strong>
        <span>{error ?? 'Try again.'}</span>
      </div>
    );

  return (
    <div className="role-command-layout">
      <section className="role-command-hero" data-role={role}>
        <div className="role-command-hero__copy">
          <p className="eyebrow">{copy.kicker}</p>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <div className="role-command-hero__metrics">
          {metrics.map((metric) => (
            <div key={metric.label} data-tone={metric.tone}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="role-command-grid">
        <DashboardCard className="role-primary-queue" aria-labelledby="role-primary-queue-heading">
          <div className="role-primary-queue__header">
            <div>
              <p className="eyebrow">Priority order</p>
              <h2 id="role-primary-queue-heading">
                {role === 'manager' ? 'Attention queue' : 'Your next actions'}
              </h2>
              <p>
                {queue.length
                  ? 'Highest-impact work is automatically brought to the top.'
                  : 'There is nothing waiting for this role right now.'}
              </p>
            </div>
            <span className="role-live-pill">
              <i /> Live · {queue.length}
            </span>
          </div>
          <div className="role-queue-list">
            {queue.slice(0, 10).map((visit) => (
              <QueueRow visit={visit} role={role} key={visit.id} />
            ))}
            {queue.length === 0 ? (
              <div className="role-queue-empty">
                <span>✓</span>
                <strong>You’re clear.</strong>
                <p>New work will appear here as the clinic moves.</p>
              </div>
            ) : null}
          </div>
        </DashboardCard>
        <aside className="role-command-rail">
          {role === 'veterinarian' ? (
            <RecordsQueue records={records} />
          ) : (
            <WatchList visits={dashboard.activeVisits} />
          )}
          {role === 'manager' ? <RecordsQueue records={records} manager /> : null}
          <DashboardCard
            className="role-side-card role-side-card--flow"
            aria-labelledby="flow-now-heading"
          >
            <div className="role-side-card__header">
              <div>
                <p className="eyebrow">Clinic pulse</p>
                <h2 id="flow-now-heading">Flow right now</h2>
              </div>
            </div>
            <div className="role-flow-bars">
              {[
                [
                  'Waiting',
                  dashboard.activeVisits.filter((visit) => ARRIVAL_STATES.has(visit.state)).length,
                ],
                [
                  'Exam',
                  dashboard.activeVisits.filter((visit) => EXAM_STATES.has(visit.state)).length,
                ],
                [
                  'Care',
                  dashboard.activeVisits.filter(
                    (visit) => PLAN_STATES.has(visit.state) || CARE_STATES.has(visit.state),
                  ).length,
                ],
                [
                  'Checkout',
                  dashboard.activeVisits.filter((visit) => CHECKOUT_STATES.has(visit.state)).length,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>
                    <b>{label}</b>
                    <strong>{value}</strong>
                  </span>
                  <i>
                    <b style={{ width: `${Math.min(100, Number(value) * 18)}%` }} />
                  </i>
                </div>
              ))}
            </div>
          </DashboardCard>
        </aside>
      </div>
    </div>
  );
}
