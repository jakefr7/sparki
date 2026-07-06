'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { appointmentTypeLabel, clientDisplayName } from '../lib/patient-types';
import { PatientSearch } from './patient-search';

const REFRESH_INTERVAL_MS = 45_000;
const STALE_AFTER_MS = 60_000;

/** Mirrors VisitsService's STARTABLE_VISIT_STATES — the only states where
 *  POST /visits/:id/start does anything (see apps/api/src/visits). */
const STARTABLE_STATES = new Set(['Arrived', 'ReadyForIntake']);
const CHECKOUT_STATES = new Set(['CheckoutReady', 'CheckoutInProgress']);

interface DashboardPersonSummary {
  id: string;
  displayName: string;
  role: string;
}

interface DashboardPatientSummary {
  id: string;
  name: string;
  species: string;
}

interface DashboardClientSummary {
  id: string;
  firstName: string;
  lastName: string;
}

interface DashboardAppointmentSummary {
  id: string;
  type: string;
  reason: string;
  state: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  patient: DashboardPatientSummary | null;
  client: DashboardClientSummary | null;
  provider: DashboardPersonSummary | null;
}

interface DashboardVisitSummary {
  id: string;
  visitType: string;
  reason: string;
  state: string;
  createdAt: string;
  elapsedMinutes: number;
  patient: DashboardPatientSummary;
  client: DashboardClientSummary | null;
  appointment: { id: string; scheduledAt: string; type: string } | null;
  primaryVeterinarian: DashboardPersonSummary | null;
  assignedTechnician: DashboardPersonSummary | null;
  currentOwner: DashboardPersonSummary | null;
}

interface OperationsDashboard {
  generatedAt: string;
  summary: {
    scheduledToday: number;
    arrived: number;
    active: number;
    checkoutReady: number;
    completedToday: number;
    totalToday: number;
  };
  todaysAppointments: DashboardAppointmentSummary[];
  upcomingAppointments: DashboardAppointmentSummary[];
  activeVisits: DashboardVisitSummary[];
  arrivedOrWaiting: DashboardVisitSummary[];
  visitsByState: { state: string; count: number }[];
}

const CHECKOUT_READY_STATE = 'CheckoutReady';
const WAITING_STATES = new Set([
  'Arrived',
  'CheckInInProgress',
  'ArrivedWithExceptions',
  'Triaged',
  'Waiting',
  'ReadyForIntake',
]);

function enumLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function clientLabel(client: DashboardClientSummary | null): string {
  return client ? clientDisplayName(client) : 'Client not linked';
}

function visitOwner(visit: DashboardVisitSummary): DashboardPersonSummary | null {
  const clinicalCurrentOwner =
    visit.currentOwner && ['VETERINARIAN', 'TECHNICIAN', 'ASSISTANT'].includes(visit.currentOwner.role)
      ? visit.currentOwner
      : null;

  return visit.primaryVeterinarian ?? visit.assignedTechnician ?? clinicalCurrentOwner ?? visit.currentOwner;
}

function ownerLabel(owner: DashboardPersonSummary | null): string {
  if (!owner) return 'Front desk';
  return `${owner.displayName} · ${personRoleLabel(owner)}`;
}

function visitNextAction(visit: DashboardVisitSummary): string {
  if (visit.state === CHECKOUT_READY_STATE) return 'Collect payment and close visit';
  if (WAITING_STATES.has(visit.state)) return 'Room, triage, or assign owner';
  return 'Continue visit workflow';
}

function appointmentNextAction(appointment: DashboardAppointmentSummary): string {
  if (appointment.state === 'Completed') return 'Review completed appointment';
  if (appointment.state === 'Arrived') return 'Start or resume visit';
  return 'Prepare for arrival';
}

function personRoleLabel(person: DashboardPersonSummary): string {
  return enumLabel(person.role).replace('Clinic ', '');
}

function visitActionLabel(visit: DashboardVisitSummary): string {
  if (STARTABLE_STATES.has(visit.state)) return 'Start Intake';
  if (CHECKOUT_STATES.has(visit.state)) return 'Open Checkout';
  return 'Open Visit';
}

function appointmentHref(appointment: DashboardAppointmentSummary): string | null {
  return appointment.patient ? `/patients/${appointment.patient.id}` : null;
}

function visitTone(visit: DashboardVisitSummary): 'waiting' | 'active' | 'checkout' {
  if (visit.state === CHECKOUT_READY_STATE) return 'checkout';
  if (WAITING_STATES.has(visit.state)) return 'waiting';
  return 'active';
}

function SectionShell({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone?: 'waiting' | 'active' | 'checkout' | 'completed' | 'upcoming' | 'rail';
  children: ReactNode;
}) {
  const headingId = `${title.replace(/\W+/g, '-').toLowerCase()}-heading`;

  return (
    <details className={tone ? `ops-section ops-section--${tone}` : 'ops-section'} open>
      <summary className="ops-section__header">
        <h2 id={headingId}>{title}</h2>
        <span className="ops-section__toggle">
          <span className="ops-section__count">{count}</span>
          <span className="ops-section__chevron" aria-hidden="true" />
        </span>
      </summary>
      <div className="ops-section__body">{children}</div>
    </details>
  );
}

function EmptyQueue({ label }: { label: string }) {
  return <p className="ops-empty-state">{label}</p>;
}

function VisitCard({
  visit,
  onVisitStarted,
}: {
  visit: DashboardVisitSummary;
  onVisitStarted: () => void;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = visitOwner(visit);
  const tone = visitTone(visit);
  const href = `/visits/${visit.id}?from=command-center`;
  const startable = STARTABLE_STATES.has(visit.state);

  async function handleActivate() {
    if (!startable) {
      router.push(href);
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${visit.id}/start`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Could not start visit (${response.status})`);
      }
      onVisitStarted();
      router.push(href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start visit.');
      setStarting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleActivate()}
      disabled={starting}
      className={`ops-work-card ops-work-card--${tone}`}
      aria-label={`${visitActionLabel(visit)} for ${visit.patient.name}`}
    >
      <div className="ops-work-card__topline">
        <span className="ops-pill">{enumLabel(visit.state)}</span>
        <span>{visit.elapsedMinutes} min</span>
      </div>
      <strong>{visit.patient.name}</strong>
      <dl>
        <div>
          <dt>Client</dt>
          <dd>{clientLabel(visit.client)}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{enumLabel(visit.state)}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{ownerLabel(owner)}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{visitNextAction(visit)}</dd>
        </div>
      </dl>
      <p>{visit.reason || appointmentTypeLabel(visit.visitType)}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <span className="ops-card-action">{starting ? 'Starting…' : visitActionLabel(visit)}</span>
    </button>
  );
}

function AppointmentCard({
  appointment,
  actionLabel = 'Open Patient',
  tone = 'upcoming',
}: {
  appointment: DashboardAppointmentSummary;
  actionLabel?: string;
  tone?: 'completed' | 'upcoming';
}) {
  const href = appointmentHref(appointment);
  const card = (
    <>
      <div className="ops-work-card__topline">
        <span className="ops-pill">{timeLabel(appointment.scheduledAt)}</span>
        <span>{appointment.expectedDurationMinutes ?? 30} min</span>
      </div>
      <strong>{appointment.patient?.name ?? 'Unlinked patient'}</strong>
      <dl>
        <div>
          <dt>Client</dt>
          <dd>{clientLabel(appointment.client)}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{enumLabel(appointment.state)}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{appointment.provider?.displayName ?? 'Unassigned provider'}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{appointmentNextAction(appointment)}</dd>
        </div>
      </dl>
      <p>{appointmentTypeLabel(appointment.type)} · {appointment.reason}</p>
      <span className="ops-card-action">{href ? actionLabel : 'No Patient Link'}</span>
    </>
  );

  return href ? (
    <Link
      href={href}
      className={`ops-work-card ops-work-card--${tone}`}
      aria-label={`${actionLabel} for ${appointment.patient?.name ?? 'appointment'}`}
    >
      {card}
    </Link>
  ) : (
    <div className={`ops-work-card ops-work-card--static ops-work-card--${tone}`}>{card}</div>
  );
}

function ProviderContext({ dashboard }: { dashboard: OperationsDashboard }) {
  const people = useMemo(() => {
    const records = new Map<
      string,
      {
        person: DashboardPersonSummary;
        active: number;
        upcoming: number;
        nextPatient: string;
      }
    >();

    function add(person: DashboardPersonSummary | null, kind: 'active' | 'upcoming', nextPatient: string) {
      if (!person) return;
      const existing =
        records.get(person.id) ??
        records
          .set(person.id, { person, active: 0, upcoming: 0, nextPatient })
          .get(person.id);
      if (!existing) return;
      existing[kind] += 1;
      if (!existing.nextPatient) existing.nextPatient = nextPatient;
    }

    for (const visit of dashboard.activeVisits) {
      add(visit.primaryVeterinarian, 'active', visit.patient.name);
      add(visit.assignedTechnician, 'active', visit.patient.name);
      add(visit.currentOwner, 'active', visit.patient.name);
    }
    for (const appointment of dashboard.upcomingAppointments) {
      add(appointment.provider, 'upcoming', appointment.patient?.name ?? 'Unlinked patient');
    }

    return Array.from(records.values()).sort(
      (a, b) => b.active - a.active || b.upcoming - a.upcoming || a.person.displayName.localeCompare(b.person.displayName),
    );
  }, [dashboard]);

  return (
    <SectionShell title="Provider / Technician Context" count={people.length} tone="rail">
      {people.length > 0 ? (
        <div className="ops-provider-list">
          {people.slice(0, 8).map(({ person, active, upcoming, nextPatient }) => (
            <div key={person.id} className="ops-provider-row">
              <div>
                <strong>{person.displayName}</strong>
                <span>{personRoleLabel(person)}</span>
              </div>
              <div>
                <strong>{active}</strong>
                <span>Active</span>
              </div>
              <div>
                <strong>{upcoming}</strong>
                <span>Upcoming</span>
              </div>
              <p>{nextPatient || 'No patient queued'}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyQueue label="No provider or technician assignments in the current dashboard snapshot." />
      )}
    </SectionShell>
  );
}

export function OperationsCommandCenter() {
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isMountedRef = useRef(true);
  const controllerRef = useRef<AbortController>(new AbortController());

  const loadDashboard = useCallback(async (mode: 'initial' | 'refresh') => {
    controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    if (mode === 'refresh') setRefreshing(true);

    try {
      const response = await fetch('/api/operations/dashboard', { signal: controller.signal });
      if (!response.ok) throw new Error(`Dashboard failed to load (${response.status})`);
      const payload = (await response.json()) as OperationsDashboard;
      if (!isMountedRef.current) return;
      setDashboard(payload);
      setLastLoadedAt(new Date());
      setError(null);
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      if (!isMountedRef.current) return;
      if (mode === 'initial') setDashboard(null);
      setError(caught instanceof Error ? caught.message : 'Dashboard failed to load.');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadDashboard('initial');
    const refreshInterval = window.setInterval(() => void loadDashboard('refresh'), REFRESH_INTERVAL_MS);
    const clockInterval = window.setInterval(() => setNow(Date.now()), 5_000);

    return () => {
      isMountedRef.current = false;
      controllerRef.current.abort();
      window.clearInterval(refreshInterval);
      window.clearInterval(clockInterval);
    };
  }, [loadDashboard]);

  const refreshAfterVisitStarted = useCallback(() => {
    void loadDashboard('refresh');
  }, [loadDashboard]);

  const waitingVisits = dashboard?.arrivedOrWaiting ?? [];
  const checkoutVisits =
    dashboard?.activeVisits.filter((visit) => visit.state === CHECKOUT_READY_STATE) ?? [];
  const inProgressVisits =
    dashboard?.activeVisits.filter((visit) => visit.state !== CHECKOUT_READY_STATE) ?? [];
  const completedAppointments =
    dashboard?.todaysAppointments.filter((appointment) => appointment.state === 'Completed') ?? [];
  const upcomingAppointments =
    dashboard?.upcomingAppointments.filter((appointment) => appointment.state !== 'Completed') ?? [];
  const isStale = lastLoadedAt ? now - lastLoadedAt.getTime() > STALE_AFTER_MS : false;

  return (
    <main className="page page--ops">
      <header className="command-home-header command-home-header--ops">
        <span className="app-brand">Sparki</span>
        <div className="command-home-header__meta" aria-label="Clinic status">
          <span>
            {refreshing ? 'Refreshing' : isStale ? 'Stale' : 'Live'}
          </span>
          <strong>{dashboard ? `Updated ${timeLabel(dashboard.generatedAt)}` : 'Loading floor'}</strong>
        </div>
      </header>

      <section className="ops-search-console" aria-label="Command lookup">
        <div className="ops-search-console__header">
          <div>
            <p className="eyebrow">Command lookup</p>
            <h2>Find the visit, client, or patient</h2>
          </div>
          <div className="ops-search-console__actions">
            <Link href="/patients/new" className="button-primary ops-registration-action">
              Register Client
            </Link>
            <span className="ops-search-console__mode">Live records</span>
          </div>
        </div>
        <PatientSearch />
      </section>

      {loading && (
        <section className="ops-panel-state" aria-live="polite">
          Loading clinic operations...
        </section>
      )}

      {!loading && error && (
        <section className="ops-panel-state ops-panel-state--error" role="alert">
          <strong>Could not load the operations dashboard.</strong>
          <span>{error}</span>
        </section>
      )}

      {!loading && !error && dashboard && (
        <>
          <section
            className={refreshing || isStale ? 'ops-summary-grid ops-summary-grid--updating' : 'ops-summary-grid'}
            aria-label="Today summary counts"
          >
            <div>
              <span>Scheduled Today</span>
              <strong>{dashboard.summary.scheduledToday}</strong>
            </div>
            <div>
              <span>Waiting / Arrived</span>
              <strong>{dashboard.summary.arrived}</strong>
            </div>
            <div>
              <span>Active Visits</span>
              <strong>{dashboard.summary.active}</strong>
            </div>
            <div>
              <span>Checkout Ready</span>
              <strong>{dashboard.summary.checkoutReady}</strong>
            </div>
            <div>
              <span>Completed Today</span>
              <strong>{dashboard.summary.completedToday}</strong>
            </div>
            <div>
              <span>Total Today</span>
              <strong>{dashboard.summary.totalToday}</strong>
            </div>
          </section>

          <div className="ops-dashboard-grid">
            <div className="ops-dashboard-grid__main">
              <SectionShell title="Waiting / Arrived" count={waitingVisits.length} tone="waiting">
                {waitingVisits.length > 0 ? (
                  <div className="ops-card-grid">
                    {waitingVisits.map((visit) => (
                      <VisitCard key={visit.id} visit={visit} onVisitStarted={refreshAfterVisitStarted} />
                    ))}
                  </div>
                ) : (
                  <EmptyQueue label="No arrived patients are waiting on the floor." />
                )}
              </SectionShell>

              <SectionShell
                title="In Progress / Active Visits"
                count={inProgressVisits.length}
                tone="active"
              >
                {inProgressVisits.length > 0 ? (
                  <div className="ops-card-grid">
                    {inProgressVisits.map((visit) => (
                      <VisitCard key={visit.id} visit={visit} onVisitStarted={refreshAfterVisitStarted} />
                    ))}
                  </div>
                ) : (
                  <EmptyQueue label="No active visits are currently in progress." />
                )}
              </SectionShell>

              <SectionShell title="Ready for Checkout" count={checkoutVisits.length} tone="checkout">
                {checkoutVisits.length > 0 ? (
                  <div className="ops-card-grid">
                    {checkoutVisits.map((visit) => (
                      <VisitCard key={visit.id} visit={visit} onVisitStarted={refreshAfterVisitStarted} />
                    ))}
                  </div>
                ) : (
                  <EmptyQueue label="No visits are waiting for checkout." />
                )}
              </SectionShell>

              <SectionShell title="Completed Today" count={completedAppointments.length} tone="completed">
                {completedAppointments.length > 0 ? (
                  <div className="ops-card-grid">
                    {completedAppointments.map((appointment) => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        actionLabel="Open Patient"
                        tone="completed"
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyQueue label="No completed appointments are present in today's snapshot." />
                )}
              </SectionShell>
            </div>

            <aside className="ops-dashboard-grid__rail" aria-label="Operations context">
              <SectionShell
                title="Upcoming Appointments"
                count={upcomingAppointments.length}
                tone="upcoming"
              >
                {upcomingAppointments.length > 0 ? (
                  <div className="ops-card-stack">
                    {upcomingAppointments.slice(0, 8).map((appointment) => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        actionLabel="Open Patient"
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyQueue label="No upcoming appointments are queued." />
                )}
              </SectionShell>

              <ProviderContext dashboard={dashboard} />

              <SectionShell title="Visit States" count={dashboard.visitsByState.length} tone="rail">
                {dashboard.visitsByState.length > 0 ? (
                  <div className="ops-state-list">
                    {dashboard.visitsByState.map((state) => (
                      <div key={state.state}>
                        <span>{enumLabel(state.state)}</span>
                        <strong>{state.count}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyQueue label="No open visit states in the current snapshot." />
                )}
              </SectionShell>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
