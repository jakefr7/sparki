import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  prisma,
  type AppointmentState,
  type AppointmentType,
  type PatientStatus,
  type VisitState,
  type VisitType,
} from '@sparki/db';
import { AppointmentsService } from '../appointments/appointments.service';
import { clientFuzzyMatchCondition, clientNameSimilarity } from '../common/client-fuzzy-match.sql';
import { TERMINAL_VISIT_STATES } from '../visits/visit-states';
import type { CreatePatientInput } from './dto/create-patient.schema';

const patientWithClients = Prisma.validator<Prisma.PatientDefaultArgs>()({
  include: { clients: { include: { client: true } } },
});

type PatientWithClients = Prisma.PatientGetPayload<typeof patientWithClients>;

export interface PatientSearchResult {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  dateOfBirth: Date | null;
  weight: number | null;
  color: string | null;
  status: PatientStatus;
  primaryClient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    preferredContactMethod: string | null;
  } | null;
  activeVisit: {
    id: string;
    state: VisitState;
    visitType: VisitType;
    reason: string;
    createdAt: Date;
  } | null;
  nextAppointment: {
    id: string;
    type: AppointmentType;
    reason: string;
    scheduledAt: Date;
    state: AppointmentState;
  } | null;
  operationalRank: number;
}

@Injectable()
export class PatientsService {
  constructor(private readonly appointments: AppointmentsService) {}

  async create(organizationId: string, input: CreatePatientInput) {
    await this.assertClientsBelongToOrganization(organizationId, input.clients);

    return prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          organizationId,
          name: input.name,
          species: input.species,
          breed: input.breed ?? null,
          sex: input.sex ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
          weight: input.weight ?? null,
          color: input.color ?? null,
        },
      });

      await tx.patientClient.createMany({
        data: input.clients.map((client) => ({
          patientId: patient.id,
          clientId: client.clientId,
          isPrimary: client.isPrimary,
        })),
      });

      return tx.patient.findUniqueOrThrow({ where: { id: patient.id }, ...patientWithClients });
    });
  }

  async findById(id: string, organizationId: string) {
    const patient = await prisma.patient.findFirst({
      where: { id, organizationId },
      ...patientWithClients,
    });
    if (!patient) {
      throw new NotFoundException(`Patient ${id} not found`);
    }
    return patient;
  }

  /**
   * Fuzzy match on Patient.name and linked Client firstName/lastName, backed
   * by the pg_trgm GIN indexes (see prisma/schema.prisma). Raw SQL per
   * docs/engineering/00-engineering-plan.md's explicit allowance for patient
   * search: Prisma can't express trigram similarity/ranking.
   *
   * Substring matches (ILIKE) always qualify regardless of the pg_trgm
   * similarity threshold, so exact/partial typed names never get filtered
   * out; the `%` operator adds typo-tolerant recall on top of that. Ranking
   * itself uses `similarity(lower(...))` so case doesn't affect ordering,
   * even though the underlying index is on the raw (non-lowercased) column —
   * that's cheap here because it only sorts the already-small filtered set.
   */
  async search(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<PatientSearchResult[]> {
    const ranked = await prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT id, MAX(score) AS score
      FROM (
        SELECT p.id AS id, similarity(lower(p.name), lower(${query})) AS score
        FROM "Patient" p
        WHERE p."organizationId" = ${organizationId}
          AND (p.name ILIKE '%' || ${query} || '%' OR p.name % ${query})

        UNION ALL

        SELECT p2.id AS id, ${clientNameSimilarity('c', query)} AS score
        FROM "Patient" p2
        JOIN "PatientClient" pc ON pc."patientId" = p2.id
        JOIN "Client" c ON c.id = pc."clientId"
        WHERE p2."organizationId" = ${organizationId}
          AND ${clientFuzzyMatchCondition('c', query)}
      ) AS matches
      GROUP BY id
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    if (ranked.length === 0) {
      return [];
    }

    const rankedIds = ranked.map((row) => row.id);
    const [patients, activeVisits, appointments] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: rankedIds } },
        ...patientWithClients,
      }),
      prisma.visit.findMany({
        where: {
          patientId: { in: rankedIds },
          organizationId,
          state: { notIn: TERMINAL_VISIT_STATES },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appointment.findMany({
        where: {
          patientId: { in: rankedIds },
          organizationId,
          scheduledAt: { gte: new Date() },
          state: { notIn: ['Cancelled', 'NoShow', 'Completed'] },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    const byId = new Map(patients.map((patient) => [patient.id, patient]));
    const activeVisitByPatientId = new Map<string, (typeof activeVisits)[number]>();
    for (const visit of activeVisits) {
      if (!activeVisitByPatientId.has(visit.patientId)) {
        activeVisitByPatientId.set(visit.patientId, visit);
      }
    }
    const appointmentByPatientId = new Map<string, (typeof appointments)[number]>();
    for (const appointment of appointments) {
      if (appointment.patientId && !appointmentByPatientId.has(appointment.patientId)) {
        appointmentByPatientId.set(appointment.patientId, appointment);
      }
    }

    return rankedIds
      .map((id) => byId.get(id))
      .filter((patient): patient is PatientWithClients => patient !== undefined)
      .map((patient) =>
        toSearchResult(
          patient,
          activeVisitByPatientId.get(patient.id) ?? null,
          appointmentByPatientId.get(patient.id) ?? null,
        ),
      )
      .sort((a, b) => a.operationalRank - b.operationalRank);
  }

  /**
   * Deliberately minimal: Patient + Client + Appointment + current active
   * Visit persistence exist in this slice (see docs/specs/modules/
   * 01-patient-workspace-mvp.md). Work Item, Communication, financial, and
   * attachment sections stay explicitly unavailable rather than faked.
   * Appointments remain separate from Visits (see core-domain-model.md
   * "Appointment vs Visit").
   */
  async getWorkspaceSummary(id: string, organizationId: string) {
    const patient = await this.findById(id, organizationId);
    const [upcomingAppointments, activeVisit] = await Promise.all([
      this.appointments.listUpcomingForPatient(patient.id, organizationId),
      prisma.visit.findFirst({
        where: {
          patientId: patient.id,
          organizationId,
          state: { notIn: TERMINAL_VISIT_STATES },
        },
        include: { client: true, appointment: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      patient: {
        id: patient.id,
        name: patient.name,
        species: patient.species,
        breed: patient.breed,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
        weight: patient.weight,
        color: patient.color,
        status: patient.status,
        sourceSystem: patient.sourceSystem,
        sourceConfidence: patient.sourceConfidence,
      },
      clients: patient.clients.map((patientClient) => ({
        id: patientClient.client.id,
        firstName: patientClient.client.firstName,
        lastName: patientClient.client.lastName,
        email: patientClient.client.email,
        phone: patientClient.client.phone,
        preferredContactMethod: patientClient.client.preferredContactMethod,
        isPrimary: patientClient.isPrimary,
      })),
      upcomingAppointments: upcomingAppointments.map((appointment) => ({
        id: appointment.id,
        type: appointment.type,
        reason: appointment.reason,
        scheduledAt: appointment.scheduledAt,
        expectedDurationMinutes: appointment.expectedDurationMinutes,
        state: appointment.state,
      })),
      sections: {
        currentVisit: activeVisit
          ? {
              status: 'available' as const,
              visit: {
                id: activeVisit.id,
                state: activeVisit.state,
                visitType: activeVisit.visitType,
                reason: activeVisit.reason,
                createdAt: activeVisit.createdAt,
                client: activeVisit.client
                  ? {
                      id: activeVisit.client.id,
                      firstName: activeVisit.client.firstName,
                      lastName: activeVisit.client.lastName,
                    }
                  : null,
                appointment: activeVisit.appointment
                  ? {
                      id: activeVisit.appointment.id,
                      scheduledAt: activeVisit.appointment.scheduledAt,
                      type: activeVisit.appointment.type,
                    }
                  : null,
              },
            }
          : unavailableSection('No active visit.'),
        workItems: unavailableSection('Work system is not yet implemented.'),
        timeline: unavailableSection('Timeline/history is not yet implemented.'),
        communication: unavailableSection('Communication module is not yet implemented.'),
        financial: unavailableSection('Billing/financial module is not yet implemented.'),
        attachments: unavailableSection('Attachments are not yet implemented.'),
      },
    };
  }

  private async assertClientsBelongToOrganization(
    organizationId: string,
    clients: CreatePatientInput['clients'],
  ): Promise<void> {
    const clientIds = clients.map((client) => client.clientId);
    const found = await prisma.client.findMany({
      where: { id: { in: clientIds }, organizationId },
      select: { id: true },
    });
    if (found.length !== clientIds.length) {
      const foundIds = new Set(found.map((client) => client.id));
      const missing = clientIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Client(s) not found in organization ${organizationId}: ${missing.join(', ')}`,
      );
    }
  }
}

function toSearchResult(
  patient: PatientWithClients,
  activeVisit: {
    id: string;
    state: VisitState;
    visitType: VisitType;
    reason: string;
    createdAt: Date;
  } | null,
  nextAppointment: {
    id: string;
    type: AppointmentType;
    reason: string;
    scheduledAt: Date;
    state: AppointmentState;
  } | null,
): PatientSearchResult {
  const primary =
    patient.clients.find((patientClient) => patientClient.isPrimary) ?? patient.clients[0];

  return {
    id: patient.id,
    name: patient.name,
    species: patient.species,
    breed: patient.breed,
    sex: patient.sex,
    dateOfBirth: patient.dateOfBirth,
    weight: patient.weight,
    color: patient.color,
    status: patient.status,
    primaryClient: primary
      ? {
          id: primary.client.id,
          firstName: primary.client.firstName,
          lastName: primary.client.lastName,
          phone: primary.client.phone,
          email: primary.client.email,
          preferredContactMethod: primary.client.preferredContactMethod,
        }
      : null,
    activeVisit: activeVisit
      ? {
          id: activeVisit.id,
          state: activeVisit.state,
          visitType: activeVisit.visitType,
          reason: activeVisit.reason,
          createdAt: activeVisit.createdAt,
        }
      : null,
    nextAppointment: nextAppointment
      ? {
          id: nextAppointment.id,
          type: nextAppointment.type,
          reason: nextAppointment.reason,
          scheduledAt: nextAppointment.scheduledAt,
          state: nextAppointment.state,
        }
      : null,
    operationalRank: activeVisit ? 0 : nextAppointment ? 1 : 2,
  };
}

function unavailableSection(reason: string) {
  return { status: 'unavailable' as const, reason };
}
