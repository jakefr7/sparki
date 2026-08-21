import { Injectable } from '@nestjs/common';
import { Prisma } from '@sparki/db';
import { AppointmentsService } from '../appointments/appointments.service';
import { VisitsService } from '../visits/visits.service';
import { ARRIVED_OR_WAITING_STATES } from '../visits/visit-states';
import { VISIT_LIFECYCLE_INCLUDE } from '../visits/visit-lifecycle.service';
import type {
  DashboardAppointmentSummary,
  DashboardClientSummary,
  DashboardPatientSummary,
  DashboardPersonSummary,
  DashboardStateCount,
  DashboardVisitSummary,
  OperationsDashboard,
} from './dto/operations-dashboard.dto';

const CHECKOUT_READY_STATE = 'CheckoutReady';

const appointmentWithContext = Prisma.validator<Prisma.AppointmentDefaultArgs>()({
  include: { patient: true, client: true, provider: true, appointmentTypeSetting: true },
});
type AppointmentWithContext = Prisma.AppointmentGetPayload<typeof appointmentWithContext>;

const visitWithContext = Prisma.validator<Prisma.VisitDefaultArgs>()({
  include: VISIT_LIFECYCLE_INCLUDE,
});
type VisitWithContext = Prisma.VisitGetPayload<typeof visitWithContext>;

@Injectable()
export class OperationsService {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly visits: VisitsService,
  ) {}

  /**
   * Orchestrates existing AppointmentsService/VisitsService queries into one
   * snapshot rather than introducing new persistence logic — three targeted
   * queries (today's appointments, upcoming appointments, active visits),
   * each scoped to the user's active organization and clinic location, then
   * everything else is derived in memory.
   */
  async getDashboard(organizationId: string, locationId: string): Promise<OperationsDashboard> {
    const [todaysAppointments, upcomingAppointments, activeVisits] = await Promise.all([
      this.appointments.listTodayForOrganization(organizationId, locationId) as Promise<
        AppointmentWithContext[]
      >,
      this.appointments.listUpcomingForOrganization(organizationId, locationId) as Promise<
        AppointmentWithContext[]
      >,
      this.visits.listActiveForOrganization(organizationId, locationId) as Promise<VisitWithContext[]>,
    ]);

    const now = new Date();
    const dashboardVisits = activeVisits.map((visit) => toDashboardVisit(visit, now));
    const arrivedOrWaiting = dashboardVisits.filter((visit) =>
      (ARRIVED_OR_WAITING_STATES as string[]).includes(visit.state),
    );

    const scheduledToday = todaysAppointments.filter(
      (appointment) => appointment.state === 'Scheduled',
    ).length;
    const completedToday = todaysAppointments.filter(
      (appointment) => appointment.state === 'Completed',
    ).length;
    const checkoutReady = dashboardVisits.filter(
      (visit) => visit.state === CHECKOUT_READY_STATE,
    ).length;

    return {
      generatedAt: now,
      summary: {
        scheduledToday,
        arrived: arrivedOrWaiting.length,
        active: dashboardVisits.length,
        checkoutReady,
        completedToday,
        totalToday: todaysAppointments.length,
      },
      todaysAppointments: todaysAppointments.map(toDashboardAppointment),
      upcomingAppointments: upcomingAppointments.map(toDashboardAppointment),
      activeVisits: dashboardVisits,
      arrivedOrWaiting,
      visitsByState: countByState(dashboardVisits),
    };
  }
}

function toPersonSummary(
  user: { id: string; firstName: string; lastName: string; displayName: string | null; role: string } | null,
): DashboardPersonSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName ?? `${user.firstName} ${user.lastName}`,
    role: user.role,
  };
}

function toPatientSummary(patient: { id: string; name: string; species: string; imageUrl: string | null } | null): DashboardPatientSummary | null {
  if (!patient) return null;
  return { id: patient.id, name: patient.name, species: patient.species, imageUrl: patient.imageUrl };
}

function toClientSummary(
  client: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null } | null,
): DashboardClientSummary | null {
  if (!client) return null;
  return { id: client.id, firstName: client.firstName, lastName: client.lastName, contactReady: Boolean(client.email && client.phone) };
}

function toDashboardAppointment(appointment: AppointmentWithContext): DashboardAppointmentSummary {
  return {
    id: appointment.id,
    appointmentTypeSettingId: appointment.appointmentTypeSettingId,
    type: appointment.appointmentTypeSetting?.name ?? appointment.type,
    reason: appointment.reason,
    state: appointment.state,
    scheduledAt: appointment.scheduledAt,
    expectedDurationMinutes: appointment.expectedDurationMinutes,
    colorKey: appointment.colorKey ?? appointment.appointmentTypeSetting?.color ?? null,
    patient: toPatientSummary(appointment.patient),
    client: toClientSummary(appointment.client),
    provider: toPersonSummary(appointment.provider),
    primaryCareVetName: appointment.primaryCareVetName,
    previousClinicName: appointment.previousClinicName,
    previousRecordsSource: appointment.previousRecordsSource,
    lastSeenAt: appointment.lastSeenAt,
    recordsPrepStatus: appointment.recordsPrepStatus,
    confirmationStatus: appointment.confirmationStatus,
    room: appointment.room,
    schedulerSlotTemplateId: appointment.schedulerSlotTemplateId,
    schedulingIssue: null,
  };
}

function toDashboardVisit(visit: VisitWithContext, now: Date): DashboardVisitSummary {
  return {
    id: visit.id,
    visitType: visit.visitType,
    reason: visit.reason,
    state: visit.state,
    phase: visit.phase,
    createdAt: visit.createdAt,
    updatedAt: visit.updatedAt,
    elapsedMinutes: Math.max(0, Math.round((now.getTime() - visit.createdAt.getTime()) / 60_000)),
    patient: toPatientSummary(visit.patient) as DashboardPatientSummary,
    client: toClientSummary(visit.client),
    appointment: visit.appointment
      ? {
          id: visit.appointment.id,
          scheduledAt: visit.appointment.scheduledAt,
          type: visit.appointment.type,
        }
      : null,
    primaryVeterinarian: toPersonSummary(visit.primaryVeterinarian),
    assignedTechnician: toPersonSummary(visit.assignedTechnician),
    currentOwner: toPersonSummary(visit.currentOwner),
    intakeSummaryAvailable: Boolean(visit.intake?.completedAt),
    workflowStatusKey: visit.workflowStep?.status ?? null,
    nextAction: visit.nextAction,
    dischargeReadyAt: visit.dischargeReadyAt,
    departedAt: visit.departedAt,
    recordStatus: [...visit.soapNotes].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.status ?? null,
    openWorkItems: visit.workItems
      .filter((item) => ['Pending', 'InProgress'].includes(item.status))
      .map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        title: item.title,
        assignee: toPersonSummary(item.assignee),
        assigneeRole: item.assigneeRole,
        dueAt: item.dueAt,
        updatedAt: item.updatedAt,
      })),
    openExceptions: visit.exceptions.map((exception) => ({
      id: exception.id,
      severity: exception.severity,
      reason: exception.reason,
      nextAction: exception.nextAction,
      owner: toPersonSummary(exception.owner),
      dueAt: exception.dueAt,
    })),
  };
}

function countByState(visits: DashboardVisitSummary[]): DashboardStateCount[] {
  const counts = new Map<string, number>();
  for (const visit of visits) {
    counts.set(visit.state, (counts.get(visit.state) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count);
}
