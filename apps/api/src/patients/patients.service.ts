import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  prisma,
  type AppointmentState,
  type AppointmentType,
  type PatientAlertCategory,
  type PatientAlertSeverity,
  type PatientMedicationStatus,
  type PatientStatus,
  type VisitState,
  type VisitType,
} from '@sparki/db';
import { AppointmentsService } from '../appointments/appointments.service';
import { clientFuzzyMatchCondition, clientNameSimilarity } from '../common/client-fuzzy-match.sql';
import { TERMINAL_VISIT_STATES } from '../visits/visit-states';
import type { CreatePatientInput } from './dto/create-patient.schema';
import type { CreatePatientAlertInput, UpdatePatientAlertInput } from './dto/patient-alert.schema';
import type {
  CreatePatientMedicationInput,
  UpdatePatientMedicationInput,
} from './dto/patient-medication.schema';
import type { UpdatePatientInput } from './dto/update-patient.schema';

const patientWithClients = Prisma.validator<Prisma.PatientDefaultArgs>()({
  include: { clients: { include: { client: true } } },
});

/** Literal fixture-name fragments left behind by interrupted local
 *  Playwright/vitest runs (see scripts/cleanup-local-test-debris.mjs, which
 *  is the real fix — this is just a dev-only safety net so a crashed test
 *  run can't dominate the default Patients directory before someone gets a
 *  chance to run that cleanup). Never applied outside development, and never
 *  applied to an explicit search — only the no-query default listing. */
const TEST_DEBRIS_NAME_FRAGMENTS = ['Playwright', 'Schedule Patient', 'Visit Patient'];

const MEDICATION_CATALOG = [
  'Amoxicillin',
  'Amoxicillin-clavulanate / Clavamox',
  'Cephalexin',
  'Cefpodoxime',
  'Enrofloxacin / Baytril',
  'Metronidazole',
  'Gabapentin',
  'Trazodone',
  'Carprofen / Rimadyl',
  'Meloxicam',
  'Prednisone',
  'Prednisolone',
  'Apoquel',
  'Cytopoint',
  'Simparica',
  'NexGard',
  'Bravecto',
  'Revolution',
  'Heartgard',
  'Interceptor',
  'Fluoxetine',
  'Levothyroxine',
  'Methimazole',
  'Pimobendan / Vetmedin',
  'Furosemide',
  'Cerenia',
  'Ondansetron',
  'Famotidine',
  'Omeprazole',
  'Insulin',
];

function excludingTestDebris(): Prisma.PatientWhereInput {
  if (process.env.NODE_ENV === 'production') return {};
  // AND of NOTs (not a single NOT: [...]), so this unambiguously excludes a
  // patient whose name contains ANY of the fragments.
  return {
    AND: TEST_DEBRIS_NAME_FRAGMENTS.map((fragment) => ({
      NOT: { name: { contains: fragment } },
    })),
  };
}

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
  imageUrl: string | null;
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

    const primaryClientId = input.clients.find((client) => client.isPrimary)!.clientId;

    return prisma.$transaction(async (tx) => {
      // Pet last name is never entered directly — it's inherited from the
      // primary owner at creation time (Anna: pet last name should be
      // stored automatically from the owner's last name, not typed in).
      const primaryClient = await tx.client.findUniqueOrThrow({
        where: { id: primaryClientId },
        select: { lastName: true },
      });

      const patient = await tx.patient.create({
        data: {
          organizationId,
          name: input.name,
          lastName: primaryClient.lastName,
          species: input.species,
          breed: input.breed ?? null,
          sex: input.sex ?? null,
          dateOfBirth: input.dateOfBirth ?? null,
          estimatedAge: input.estimatedAge ?? null,
          weight: input.weight ?? null,
          color: input.color ?? null,
          imageUrl: input.imageUrl ?? null,
          alerts: input.alerts ?? null,
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

  async update(id: string, organizationId: string, input: UpdatePatientInput) {
    await this.findById(id, organizationId);

    return prisma.patient.update({
      where: { id },
      data: Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
      ...patientWithClients,
    });
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

        -- Stored pet lastName (inherited from the owner, but can diverge if
        -- the owner's name changes after a manual pet-record edit) — lets
        -- search still find a pet by the last name on file even when it no
        -- longer matches any currently-linked Client.
        SELECT p3.id AS id, similarity(lower(p3."lastName"), lower(${query})) AS score
        FROM "Patient" p3
        WHERE p3."organizationId" = ${organizationId}
          AND p3."lastName" IS NOT NULL
          AND (p3."lastName" ILIKE '%' || ${query} || '%' OR p3."lastName" % ${query})

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
    const patients = await prisma.patient.findMany({
      where: { id: { in: rankedIds } },
      ...patientWithClients,
    });
    const byId = new Map(patients.map((patient) => [patient.id, patient]));
    const ordered = rankedIds
      .map((id) => byId.get(id))
      .filter((patient): patient is PatientWithClients => patient !== undefined);

    return this.enrichAndRank(ordered, organizationId);
  }

  /**
   * Plain directory listing (no query) — what the Patients tab shows before
   * the user types a search. Alphabetical by patient name; active-visit /
   * upcoming-appointment patients still float to the top via the same
   * operationalRank the search results use, for consistency.
   */
  async list(organizationId: string, limit: number): Promise<PatientSearchResult[]> {
    const patients = await prisma.patient.findMany({
      where: { organizationId, ...excludingTestDebris() },
      ...patientWithClients,
      orderBy: { name: 'asc' },
      take: limit,
    });

    return this.enrichAndRank(patients, organizationId);
  }

  private async enrichAndRank(
    patients: PatientWithClients[],
    organizationId: string,
  ): Promise<PatientSearchResult[]> {
    if (patients.length === 0) {
      return [];
    }

    const patientIds = patients.map((patient) => patient.id);
    const [activeVisits, appointments] = await Promise.all([
      prisma.visit.findMany({
        where: {
          patientId: { in: patientIds },
          organizationId,
          state: { notIn: TERMINAL_VISIT_STATES },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appointment.findMany({
        where: {
          patientId: { in: patientIds },
          organizationId,
          scheduledAt: { gte: new Date() },
          state: { notIn: ['Cancelled', 'NoShow', 'Completed'] },
        },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

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

    return patients
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
    const [upcomingAppointments, activeVisit, recentVisits, patientAlerts, patientMedications] = await Promise.all([
      this.appointments.listUpcomingForPatient(patient.id, organizationId),
      prisma.visit.findFirst({
        where: {
          patientId: patient.id,
          organizationId,
          state: { notIn: TERMINAL_VISIT_STATES },
        },
        include: {
          client: true,
          appointment: true,
          location: true,
          primaryVeterinarian: true,
          assignedTechnician: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Most-recent-first, capped small — this is a profile summary, not a
      // paginated history browser. Also doubles as the source for the
      // Medications section below (no dedicated medication model exists
      // yet; VisitIntake.medicationsAllergies is the closest real data).
      prisma.visit.findMany({
        where: { patientId: patient.id, organizationId },
        include: {
          primaryVeterinarian: true,
          intake: true,
          examFindings: true,
          soapNotes: { orderBy: { version: 'desc' }, take: 1 },
          workItems: { where: { status: { in: ['Completed', 'Declined', 'Deferred'] } }, orderBy: { updatedAt: 'asc' } },
          discharge: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.patientAlert.findMany({
        where: { patientId: patient.id, organizationId, isActive: true },
        orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
      }),
      prisma.patientMedication.findMany({
        where: { patientId: patient.id, organizationId },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);

    const medicationsSource = recentVisits.find(
      (visit) => visit.intake?.medicationsAllergies,
    );

    return {
      patient: {
        id: patient.id,
        name: patient.name,
        species: patient.species,
        breed: patient.breed,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
        estimatedAge: patient.estimatedAge,
        weight: patient.weight,
        color: patient.color,
        imageUrl: patient.imageUrl,
        status: patient.status,
        alerts: patient.alerts,
        patientAlerts: patientAlerts.map(toPatientAlertSummary),
        sourceSystem: patient.sourceSystem,
        sourceConfidence: patient.sourceConfidence,
      },
      clients: patient.clients.map((patientClient) => ({
        id: patientClient.client.id,
        firstName: patientClient.client.firstName,
        lastName: patientClient.client.lastName,
        email: patientClient.client.email,
        phone: patientClient.client.phone,
        alternatePhone: patientClient.client.alternatePhone,
        preferredContactMethod: patientClient.client.preferredContactMethod,
        addressLine1: patientClient.client.addressLine1,
        addressLine2: patientClient.client.addressLine2,
        city: patientClient.client.city,
        state: patientClient.client.state,
        postalCode: patientClient.client.postalCode,
        country: patientClient.client.country,
        formattedAddress: patientClient.client.formattedAddress,
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
      recentVisits: recentVisits.map((visit) => ({
        id: visit.id,
        visitType: visit.visitType,
        reason: visit.reason,
        state: visit.state,
        createdAt: visit.createdAt,
        primaryVeterinarian: visit.primaryVeterinarian
          ? {
              id: visit.primaryVeterinarian.id,
              firstName: visit.primaryVeterinarian.firstName,
              lastName: visit.primaryVeterinarian.lastName,
            }
          : null,
        intake: visit.intake,
        examFindings: visit.examFindings,
        soapNote: visit.soapNotes[0] ?? null,
        careItems: visit.workItems,
        discharge: visit.discharge,
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
                location: activeVisit.location
                  ? {
                      id: activeVisit.location.id,
                      name: activeVisit.location.name,
                    }
                  : null,
                primaryVeterinarian: activeVisit.primaryVeterinarian
                  ? {
                      id: activeVisit.primaryVeterinarian.id,
                      firstName: activeVisit.primaryVeterinarian.firstName,
                      lastName: activeVisit.primaryVeterinarian.lastName,
                      displayName: activeVisit.primaryVeterinarian.displayName,
                    }
                  : null,
                assignedTechnician: activeVisit.assignedTechnician
                  ? {
                      id: activeVisit.assignedTechnician.id,
                      firstName: activeVisit.assignedTechnician.firstName,
                      lastName: activeVisit.assignedTechnician.lastName,
                      displayName: activeVisit.assignedTechnician.displayName,
                    }
                  : null,
              },
            }
          : unavailableSection('No active visit.'),
        medications: {
          status: 'available' as const,
          items: patientMedications.map(toMedicationSummary),
          legacyNotes: medicationsSource?.intake?.medicationsAllergies
            ? {
                notes: medicationsSource.intake.medicationsAllergies,
                recordedAt: medicationsSource.intake.updatedAt,
                visitId: medicationsSource.id,
              }
            : null,
          catalog: MEDICATION_CATALOG,
        },
        workItems: unavailableSection('Work system is not yet implemented.'),
        communication: unavailableSection('Communication module is not yet implemented.'),
        financial: unavailableSection('Billing/financial module is not yet implemented.'),
        attachments: unavailableSection('Attachments are not yet implemented.'),
      },
    };
  }

  async createAlert(id: string, organizationId: string, input: CreatePatientAlertInput) {
    await this.findById(id, organizationId);

    return prisma.patientAlert.create({
      data: {
        organizationId,
        patientId: id,
        message: input.message,
        category: input.category,
        severity: input.severity,
      },
    });
  }

  async updateAlert(
    id: string,
    alertId: string,
    organizationId: string,
    input: UpdatePatientAlertInput,
  ) {
    await this.assertAlertBelongsToPatient(id, alertId, organizationId);
    const data: Prisma.PatientAlertUpdateInput = compactUndefined({
      message: input.message,
      category: input.category,
      severity: input.severity,
      isActive: input.isActive,
      archivedAt: input.isActive === false ? new Date() : input.isActive === true ? null : undefined,
    });

    return prisma.patientAlert.update({
      where: { id: alertId },
      data,
    });
  }

  async createMedication(id: string, organizationId: string, input: CreatePatientMedicationInput) {
    await this.findById(id, organizationId);

    return prisma.patientMedication.create({
      data: {
        organizationId,
        patientId: id,
        medicationName: input.medicationName,
        genericName: input.genericName ?? null,
        strength: input.strength ?? null,
        dose: input.dose ?? null,
        route: input.route ?? null,
        frequency: input.frequency ?? null,
        instructions: input.instructions ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: input.status,
        prescribedBy: input.prescribedBy ?? null,
        source: input.source ?? null,
      },
    });
  }

  async updateMedication(
    id: string,
    medicationId: string,
    organizationId: string,
    input: UpdatePatientMedicationInput,
  ) {
    await this.assertMedicationBelongsToPatient(id, medicationId, organizationId);
    const data: Prisma.PatientMedicationUpdateInput = compactUndefined({
      medicationName: input.medicationName,
      genericName: input.genericName,
      strength: input.strength,
      dose: input.dose,
      route: input.route,
      frequency: input.frequency,
      instructions: input.instructions,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      prescribedBy: input.prescribedBy,
      source: input.source,
    });

    return prisma.patientMedication.update({
      where: { id: medicationId },
      data,
    });
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

  private async assertAlertBelongsToPatient(
    patientId: string,
    alertId: string,
    organizationId: string,
  ): Promise<void> {
    const alert = await prisma.patientAlert.findFirst({
      where: { id: alertId, patientId, organizationId },
      select: { id: true },
    });
    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }
  }

  private async assertMedicationBelongsToPatient(
    patientId: string,
    medicationId: string,
    organizationId: string,
  ): Promise<void> {
    const medication = await prisma.patientMedication.findFirst({
      where: { id: medicationId, patientId, organizationId },
      select: { id: true },
    });
    if (!medication) {
      throw new NotFoundException(`Medication ${medicationId} not found`);
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
    imageUrl: patient.imageUrl,
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

function compactUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T as undefined extends T[K] ? K : K]: Exclude<T[K], undefined> };
}

function toPatientAlertSummary(alert: {
  id: string;
  message: string;
  category: PatientAlertCategory;
  severity: PatientAlertSeverity;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: alert.id,
    message: alert.message,
    category: alert.category,
    severity: alert.severity,
    isActive: alert.isActive,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
  };
}

function toMedicationSummary(medication: {
  id: string;
  medicationName: string;
  genericName: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  instructions: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: PatientMedicationStatus;
  prescribedBy: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: medication.id,
    medicationName: medication.medicationName,
    genericName: medication.genericName,
    strength: medication.strength,
    dose: medication.dose,
    route: medication.route,
    frequency: medication.frequency,
    instructions: medication.instructions,
    startDate: medication.startDate,
    endDate: medication.endDate,
    status: medication.status,
    prescribedBy: medication.prescribedBy,
    source: medication.source,
    createdAt: medication.createdAt,
    updatedAt: medication.updatedAt,
  };
}
