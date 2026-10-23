'use client';

import { appointmentsWithoutActiveVisits, enabledStatuses, resolveConfiguredStatus, type ConfiguredDashboardStatus } from '@sparki/config';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DashboardCard, DashboardShell } from './dashboard-shell';
import { EmptyQueue } from './command-center/empty-states';
import { ConfiguredStatusMenu } from './configured-status-menu';
import { PetPhotoPlaceholder } from './pet-photo-placeholder';
import { AppointmentDetailPopover, type SchedulerAppointment } from './scheduler-page';
import { appointmentTypeLabel, type DashboardAppointmentSummary, type DashboardVisitSummary } from '../lib/patient-types';
import { useDashboardStatusColors } from '../lib/use-dashboard-status-colors';
import { useOperationsDashboard } from '../lib/use-operations-dashboard';

type TodayRow = {
  id: string; kind: 'appointment' | 'visit'; state: string; status: ConfiguredDashboardStatus;
  time: string; patientName: string; species?: string | undefined; imageUrl?: string | null | undefined; clientName: string; appointmentType: string;
  location?: string | undefined; doctor?: string | undefined; href: string;
  appointment?: SchedulerAppointment | undefined;
};

function time(value: string) { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function clientName(client: { firstName: string; lastName: string } | null) { return client ? `${client.firstName} ${client.lastName}` : 'No client linked'; }

function isCurrentlyInClinic(row: TodayRow) {
  return row.kind === 'visit' && row.status.status !== 'Appointment' && row.status.status !== 'Checkout';
}

export function buildTodayRows(appointments: DashboardAppointmentSummary[], visits: DashboardVisitSummary[], statuses: ConfiguredDashboardStatus[]): TodayRow[] {
  const appointmentRows = appointmentsWithoutActiveVisits(appointments, visits).flatMap((appointment) => {
    const status = resolveConfiguredStatus(statuses, 'appointment', appointment.state);
    if (!status?.isEnabled) return [];
    return [{ id: appointment.id, kind: 'appointment' as const, state: appointment.state, status, time: time(appointment.scheduledAt), patientName: appointment.patient?.name ?? 'Unlinked patient', species: appointment.patient?.species, imageUrl: appointment.patient?.imageUrl, clientName: clientName(appointment.client), appointmentType: appointmentTypeLabel(appointment.type), doctor: appointment.provider?.displayName, href: appointment.patient ? `/patients/${appointment.patient.id}` : '/patients', appointment: { ...appointment, room: null } }];
  });
  const visitRows = visits.flatMap((visit) => {
    const status = resolveConfiguredStatus(statuses, 'visit', visit.state);
    if (!status?.isEnabled) return [];
    const linked = appointments.find((appointment) => appointment.id === visit.appointment?.id);
    return [{ id: visit.id, kind: 'visit' as const, state: visit.state, status, time: time(visit.appointment && new Date(visit.appointment.scheduledAt).toDateString() === new Date(visit.createdAt).toDateString() ? visit.appointment.scheduledAt : visit.createdAt), patientName: visit.patient.name, species: visit.patient.species, imageUrl: visit.patient.imageUrl, clientName: clientName(visit.client), appointmentType: appointmentTypeLabel(visit.appointment?.type ?? visit.visitType), location: visit.currentOwner?.displayName, doctor: visit.primaryVeterinarian?.displayName, href: `/visits/${visit.id}`, appointment: linked ? { ...linked, room: null } : undefined }];
  });
  return [...appointmentRows, ...visitRows].sort((a, b) => a.time.localeCompare(b.time));
}

function StatusFilter({ statuses, selected, onChange }: { statuses: ConfiguredDashboardStatus[]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: MouseEvent) { if (!detailsRef.current?.contains(event.target as Node)) detailsRef.current?.removeAttribute('open'); }
    function dismissWithKeyboard(event: KeyboardEvent) { if (event.key === 'Escape') detailsRef.current?.removeAttribute('open'); }
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', dismissWithKeyboard);
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', dismissWithKeyboard); };
  }, []);
  return <details ref={detailsRef} className="today-status-filter"><summary><span>{selected.size === 0 ? 'All statuses' : `${selected.size} status${selected.size === 1 ? '' : 'es'}`}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div>
    <button type="button" className={selected.size === 0 ? 'today-status-filter__all today-status-filter__all--active' : 'today-status-filter__all'} onClick={() => onChange(new Set())}><span>All statuses</span><small>{selected.size === 0 ? 'Showing all' : 'Clear selection'}</small></button>
    {statuses.map((status) => <label key={status.status} style={{ '--configured-status': status.color } as CSSProperties}><input type="checkbox" checked={selected.has(status.status)} onChange={() => { const next = new Set(selected); if (next.has(status.status)) next.delete(status.status); else next.add(status.status); onChange(next); }} /><span aria-hidden="true" />{status.name}</label>)}
  </div></details>;
}

function PatientCell({ row, onQuickView }: { row: TodayRow; onQuickView: (row: TodayRow) => void }) { const content = <><PetPhotoPlaceholder name={row.patientName} species={row.species} imageUrl={row.imageUrl} className="pet-photo-placeholder patient-avatar"/><span className="patient-client-cell__text"><strong>{row.patientName}</strong><span>{row.clientName}</span></span></>; return row.appointment ? <button type="button" className="patient-client-cell patient-client-cell--button" onClick={() => onQuickView(row)}>{content}</button> : <Link href={row.href} className="patient-client-cell">{content}</Link>; }
function TodayRowView({ row, statuses, refresh, onQuickView }: { row: TodayRow; statuses: ConfiguredDashboardStatus[]; refresh: () => void; onQuickView: (row: TodayRow) => void }) { return <div className="today-appointment-row" style={{ '--configured-status': row.status.color } as CSSProperties}><span className="schedule-row__time">{row.time}</span><PatientCell row={row} onQuickView={onQuickView}/><span className="today-appointment-row__type">{row.appointmentType}</span><ConfiguredStatusMenu row={row} statuses={statuses} onChanged={refresh}/><span className="today-appointment-row__meta">{row.location ?? 'Unassigned'}</span><span className="today-appointment-row__meta">{row.doctor ?? 'Unassigned'}</span>{row.kind === 'visit' ? <Link className="today-visit-link" href={row.href}>Open Visit</Link> : null}</div>; }

function ClinicSummary({ rows, statuses, refresh, onQuickView }: { rows: TodayRow[]; statuses: ConfiguredDashboardStatus[]; refresh: () => void; onQuickView: (row: TodayRow) => void }) { const clinic = rows.filter(isCurrentlyInClinic).slice(0, 6); return <DashboardCard aria-labelledby="today-clinic-summary-heading"><div className="home-widget__header"><div><h2 id="today-clinic-summary-heading">Currently in Clinic</h2><p className="today-overview__intro">Patients physically here now.</p></div><strong className="today-clinic-count">{clinic.length}</strong></div><div className="today-summary-list">{clinic.length ? clinic.map((row) => <div key={`${row.kind}-${row.id}`}><PatientCell row={row} onQuickView={onQuickView}/><ConfiguredStatusMenu row={row} statuses={statuses} onChanged={refresh}/></div>) : <EmptyQueue label="No patients are currently in clinic."/>}</div></DashboardCard>; }

export function TodayOperationsPage() {
  const { dashboard, loading, error, refresh } = useOperationsDashboard();
  const { colors, loading: statusesLoading } = useDashboardStatusColors();
  const statuses = useMemo(() => enabledStatuses(colors ?? []), [colors]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<SchedulerAppointment | null>(null);
  const rows = useMemo(() => buildTodayRows(dashboard?.todaysAppointments ?? [], [...new Map([...(dashboard?.todaysVisits ?? []), ...(dashboard?.activeVisits ?? [])].map((visit) => [visit.id, visit])).values()], statuses), [dashboard, statuses]);
  const visibleRows = selected.size ? rows.filter((row) => selected.has(row.status.status)) : rows;
  const groups = statuses.map((status) => ({ status, rows: visibleRows.filter((row) => row.status.status === status.status) })).filter((group) => group.rows.length);
  const inClinicCount = rows.filter(isCurrentlyInClinic).length;
  const todayVisitCount = rows.filter((row) => row.kind === 'visit').length;
  const openQuickView = (row: TodayRow) => { if (row.appointment) setQuickView(row.appointment); };

  return <DashboardShell activeHref="/today" eyebrow="Today" title="Today's Schedule" subtitle="Appointments and patient flow for today.">
    {(loading || statusesLoading) ? <div className="ops-panel-state ops-panel-state--loading">Loading today...</div> : null}
    {error ? <div className="ops-panel-state ops-panel-state--error" role="alert"><strong>Today could not load.</strong><span>{error}</span></div> : null}
    {!loading && !statusesLoading && !error && dashboard ? <div className="today-operations-layout"><section className="today-main-card" aria-labelledby="today-appointments-heading"><div className="home-widget__header"><div><p className="eyebrow">Appointments & active visits</p><h2 id="today-appointments-heading">Today&apos;s Patient Flow</h2></div><StatusFilter statuses={statuses} selected={selected} onChange={setSelected}/></div><div className="today-appointment-list">{groups.length ? groups.map(({ status, rows: statusRows }) => <section key={status.status} className="today-status-group" style={{ '--configured-status': status.color } as CSSProperties}><header><span aria-hidden="true"/><h3>{status.name}</h3><strong>{statusRows.length}</strong></header>{statusRows.map((row) => <TodayRowView key={`${row.kind}-${row.id}`} row={row} statuses={statuses} refresh={refresh} onQuickView={openQuickView}/>)}</section>) : <EmptyQueue label="No appointments or active visits match this filter."/>}</div></section>
      <aside className="today-rail" aria-label="Today overview"><ClinicSummary rows={rows} statuses={statuses} refresh={refresh} onQuickView={openQuickView}/><DashboardCard aria-labelledby="today-overview-heading"><div className="home-widget__header"><div><h2 id="today-overview-heading">Today Overview</h2><p className="today-overview__intro">Today’s bookings and visits, plus patients still receiving care.</p></div></div><div className="today-overview__totals"><div><strong>{dashboard.todaysAppointments.length}</strong><span>Scheduled appointments</span></div><div><strong>{todayVisitCount}</strong><span>Visit records</span></div><div><strong>{inClinicCount}</strong><span>Currently in clinic</span></div></div><div className="today-overview__breakdown"><span className="today-overview__label">Combined patient flow by status</span>{statuses.filter((status) => rows.some((row) => row.status.status === status.status)).map((status) => <div key={status.status} style={{ '--configured-status': status.color } as CSSProperties}><span aria-hidden="true"/><span>{status.name}</span><strong>{rows.filter((row) => row.status.status === status.status).length}</strong></div>)}</div></DashboardCard></aside></div> : null}
    {quickView ? <AppointmentDetailPopover appointment={quickView} appointmentTypes={[]} onClose={() => setQuickView(null)} onChanged={(appointment) => { setQuickView(appointment); refresh(); }} onReschedule={() => { window.location.href = '/scheduler'; }} onCancelled={() => { setQuickView(null); refresh(); }} /> : null}
  </DashboardShell>;
}
