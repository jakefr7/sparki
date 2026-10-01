import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import type { AuthenticatedUser } from '../auth/types';
import { clientFuzzyMatchCondition, clientNameSimilarity } from '../common/client-fuzzy-match.sql';
import { AppConfigService } from '../config/app-config.service';
import { AttachmentStorageService } from '../messaging/attachment-storage.service';
import { TERMINAL_VISIT_STATES } from '../visits/visit-states';
import type { CreatePatientInput } from './dto/create-patient.schema';
import type { CreatePatientAlertInput, UpdatePatientAlertInput } from './dto/patient-alert.schema';
import type {
  CreatePatientMedicationInput,
  UpdatePatientMedicationInput,
} from './dto/patient-medication.schema';
import type { UploadPatientPhotoInput } from './dto/patient-photo.schema';
import type { UpdatePatientInput } from './dto/update-patient.schema';

export const MAX_PATIENT_PHOTO_BYTES = 8 * 1024 * 1024;

function matchesDeclaredImageType(body: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (mimeType === 'image/png') return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/gif') return body.length >= 6 && ['GIF87a', 'GIF89a'].includes(body.subarray(0, 6).toString('ascii'));
  return body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
}

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
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly attachments: AttachmentStorageService,
    private readonly config: AppConfigService,
  ) {}

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

    const data: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    // imageUrl edited directly (cleared, or replaced with an external URL) no
    // longer points at anything this service uploaded — drop the stale key
    // so the content endpoint stops serving the old object. uploadPhoto()
    // below is the only path that sets a non-null imageStorageKey.
    if ('imageUrl' in data) data.imageStorageKey = null;

    return prisma.patient.update({
      where: { id },
      data,
      ...patientWithClients,
    });
  }

  async uploadPhoto(organizationId: string, id: string, input: UploadPatientPhotoInput) {
    await this.findById(id, organizationId);

    const body = Buffer.from(input.contentBase64, 'base64');
    if (!body.length || body.toString('base64').replace(/=+$/, '') !== input.contentBase64.replace(/=+$/, '')) {
      throw new BadRequestException('Photo content is not valid base64.');
    }
    if (body.length > MAX_PATIENT_PHOTO_BYTES) {
      throw new BadRequestException('Image is too large. Max size is 8MB.');
    }
    if (!matchesDeclaredImageType(body, input.mimeType)) {
      throw new BadRequestException('Image content does not match its declared type.');
    }

    const key = this.attachments.patientPhotoKey(organizationId, id);
    await this.attachments.put(key, body, input.mimeType, input.fileName);
    const imageUrl = `${this.config.webOrigin}/api/patients/${id}/photo/content`;

    return prisma.patient.update({
      where: { id },
      data: { imageUrl, imageStorageKey: key },
      ...patientWithClients,
    });
  }

  async getPhoto(organizationId: string, id: string) {
    const patient = await prisma.patient.findFirst({ where: { id, organizationId }, select: { imageStorageKey: true } });
    if (!patient?.imageStorageKey || !this.attachments.patientPhotoBelongsTo(patient.imageStorageKey, organizationId, id)) {
      throw new NotFoundException('Patient photo not found.');
    }
    return this.attachments.get(patient.imageStorageKey);
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
  async getWorkspaceSummary(id: string, organizationId: string, locationId: string, canManageMedications = false) {
    const patient = await this.findById(id, organizationId);
    const [upcomingAppointments, activeVisit, recentVisits, patientAlerts, patientMedications, patientAttachments, medicationCatalog] = await Promise.all([
      this.appointments.listUpcomingForPatient(patient.id, organizationId),
      prisma.visit.findFirst({
        where: {
          patientId: patient.id,
          organizationId,
          locationId,
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
          clinicalAttachments: { where: { locationId }, include: { uploadedBy: true, events: { include: { actor: true }, orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } },
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
        include: { events: { orderBy: { occurredAt: 'desc' } } },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      }),
      prisma.clinicalAttachment.findMany({
        where: { patientId: patient.id, visitId: null, organizationId, locationId },
        include: { uploadedBy: true, events: { include: { actor: true }, orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.catalogItem.findMany({
        where: {
          organizationId,
          primaryType: 'MEDICATION',
          status: 'ACTIVE',
          OR: [{ locationId: null }, { locationId }],
        },
        select: { id: true, name: true, strength: true, form: true, route: true, defaultFrequency: true, retailPrice: true, billable: true },
        orderBy: { name: 'asc' },
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
      patientAttachments: patientAttachments.map((attachment) => ({
        id: attachment.id,
        patientId: attachment.patientId,
        visitId: attachment.visitId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        label: attachment.label,
        createdAt: attachment.createdAt,
        removedAt: attachment.removedAt,
        supersededById: attachment.supersededById,
        uploadedBy: { displayName: attachment.uploadedBy.displayName, firstName: attachment.uploadedBy.firstName, lastName: attachment.uploadedBy.lastName },
        href: attachment.removedAt ? null : `/clinical-attachments/${attachment.id}/content`,
        auditEvents: attachment.events.map((event) => ({ action: event.action, reason: event.reason, createdAt: event.createdAt, actor: { displayName: event.actor.displayName, firstName: event.actor.firstName, lastName: event.actor.lastName } })),
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
        attachments: (visit.clinicalAttachments ?? []).map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          label: attachment.label,
          createdAt: attachment.createdAt,
          removedAt: attachment.removedAt,
          supersededById: attachment.supersededById,
          uploadedBy: { displayName: attachment.uploadedBy.displayName, firstName: attachment.uploadedBy.firstName, lastName: attachment.uploadedBy.lastName },
          href: attachment.removedAt ? null : `/clinical-attachments/${attachment.id}/content`,
          auditEvents: attachment.events.map((event) => ({
            action: event.action,
            reason: event.reason,
            createdAt: event.createdAt,
            actor: { displayName: event.actor.displayName, firstName: event.actor.firstName, lastName: event.actor.lastName },
          })),
        })),
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
          catalog: medicationCatalog,
          permissions: { canManage: canManageMedications },
        },
        workItems: unavailableSection('Work system is not yet implemented.'),
        communication: unavailableSection('Communication module is not yet implemented.'),
        financial: unavailableSection('Billing/financial module is not yet implemented.'),
        attachments: { status: 'available' as const },
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

  async createMedication(id: string, user: AuthenticatedUser, input: CreatePatientMedicationInput) {
    this.requireMedicationManager(user);
    await this.findById(id, user.organizationId);
    const catalogItem = input.catalogItemId ? await prisma.catalogItem.findFirst({
      where: { id: input.catalogItemId, organizationId: user.organizationId, primaryType: 'MEDICATION', status: 'ACTIVE', OR: [{ locationId: null }, { locationId: user.locationId }] },
    }) : null;
    if (input.catalogItemId && !catalogItem) throw new BadRequestException('Select an active medication from Hospital Inventory.');

    return prisma.$transaction(async (tx) => {
      const medication = await tx.patientMedication.create({
      data: {
        organizationId: user.organizationId,
        patientId: id,
        catalogItemId: catalogItem?.id ?? null,
        medicationName: catalogItem?.name ?? input.medicationName,
        genericName: input.genericName ?? null,
        strength: catalogItem?.strength ?? input.strength ?? null,
        form: catalogItem?.form ?? null,
        dose: input.dose ?? null,
        route: catalogItem?.route ?? input.route ?? null,
        frequency: catalogItem?.defaultFrequency ?? input.frequency ?? null,
        instructions: input.instructions ?? null,
        startDate: input.startDate ?? new Date(),
        endDate: input.endDate ?? null,
        status: input.status,
        prescribedBy: input.prescribedBy ?? null,
        source: input.source ?? null,
      },
      });
      await tx.patientMedicationEvent.create({ data: { organizationId: user.organizationId, medicationId: medication.id, actorId: user.id, type: 'CREATED' } });
      return medication;
    });
  }

  async updateMedication(
    id: string,
    medicationId: string,
    user: AuthenticatedUser,
    input: UpdatePatientMedicationInput,
  ) {
    this.requireMedicationManager(user);
    if (input.status === 'Discontinued') throw new BadRequestException('Use the discontinue action and provide a reason.');
    await this.assertMedicationBelongsToPatient(id, medicationId, user.organizationId);
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

    return prisma.$transaction(async (tx) => {
      const medication = await tx.patientMedication.update({ where: { id: medicationId }, data });
      await tx.patientMedicationEvent.create({ data: { organizationId: user.organizationId, medicationId, actorId: user.id, type: 'EDITED' } });
      return medication;
    });
  }

  async refillMedication(patientId: string, medicationId: string, user: AuthenticatedUser) {
    this.requireMedicationManager(user);
    await this.assertMedicationBelongsToPatient(patientId, medicationId, user.organizationId);
    const medication = await prisma.patientMedication.findUniqueOrThrow({ where: { id: medicationId } });
    if (medication.status !== 'Active') throw new BadRequestException('Only active medications can be refilled.');
    const occurredAt = new Date();
    return prisma.$transaction(async (tx) => {
      const updated = await tx.patientMedication.update({ where: { id: medicationId }, data: { lastRefilledAt: occurredAt, refillCount: { increment: 1 } } });
      await tx.patientMedicationEvent.create({ data: { organizationId: user.organizationId, medicationId, actorId: user.id, type: 'REFILLED', occurredAt } });
      const visit = await tx.visit.findFirst({ where: { patientId, organizationId: user.organizationId, locationId: user.locationId, state: { notIn: TERMINAL_VISIT_STATES } }, orderBy: { createdAt: 'desc' } });
      const item = medication.catalogItemId ? await tx.catalogItem.findFirst({ where: { id: medication.catalogItemId, organizationId: user.organizationId } }) : null;
      if (visit && item?.billable && item.retailPrice) {
        const invoice = await tx.invoice.upsert({
          where: { visitId: visit.id },
          create: { organizationId: user.organizationId, locationId: user.locationId, patientId, clientId: visit.clientId, visitId: visit.id, createdById: user.id },
          update: {},
        });
        if (!invoice.finalizedAt && !invoice.voidedAt) {
          const unitAmountCents = Math.round(Number(item.retailPrice) * 100);
          await tx.invoiceLine.create({ data: { organizationId: user.organizationId, invoiceId: invoice.id, description: `Refill: ${medication.medicationName}`, unitAmountCents, totalAmountCents: unitAmountCents, sourceType: 'CATALOG_ITEM', sourceRecordId: medicationId, catalogItemId: item.id, createdById: user.id } });
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'OPEN', version: { increment: 1 } } });
        }
      }
      return updated;
    });
  }

  async discontinueMedication(patientId: string, medicationId: string, user: AuthenticatedUser, reason: string) {
    this.requireMedicationManager(user);
    await this.assertMedicationBelongsToPatient(patientId, medicationId, user.organizationId);
    const occurredAt = new Date();
    return prisma.$transaction(async (tx) => {
      const updated = await tx.patientMedication.update({ where: { id: medicationId }, data: { status: 'Discontinued', endDate: occurredAt, discontinueReason: reason } });
      await tx.patientMedicationEvent.create({ data: { organizationId: user.organizationId, medicationId, actorId: user.id, type: 'DISCONTINUED', reason, occurredAt } });
      return updated;
    });
  }

  async flagMedicationReaction(patientId: string, medicationId: string, user: AuthenticatedUser, reaction: string) {
    this.requireMedicationManager(user);
    await this.assertMedicationBelongsToPatient(patientId, medicationId, user.organizationId);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.patientMedication.update({ where: { id: medicationId }, data: { reactionNotes: reaction } });
      await tx.patientMedicationEvent.create({ data: { organizationId: user.organizationId, medicationId, actorId: user.id, type: 'REACTION_FLAGGED', reason: reaction } });
      await tx.patientAlert.create({ data: { organizationId: user.organizationId, patientId, category: 'Allergy', severity: 'Critical', message: `${updated.medicationName}: ${reaction}` } });
      return updated;
    });
  }

  private requireMedicationManager(user: AuthenticatedUser) {
    if (!(user.canManageMedications || ['OWNER', 'VETERINARIAN', 'TECHNICIAN'].includes(user.role))) {
      throw new ForbiddenException('Medication changes require medication-clerk or clinical medication permission.');
    }
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
  catalogItemId: string | null;
  medicationName: string;
  genericName: string | null;
  strength: string | null;
  form: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  instructions: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: PatientMedicationStatus;
  prescribedBy: string | null;
  source: string | null;
  discontinueReason: string | null;
  reactionNotes: string | null;
  lastRefilledAt: Date | null;
  refillCount: number;
  events: Array<{ id: string; type: string; reason: string | null; occurredAt: Date }>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: medication.id,
    catalogItemId: medication.catalogItemId,
    medicationName: medication.medicationName,
    genericName: medication.genericName,
    strength: medication.strength,
    form: medication.form,
    dose: medication.dose,
    route: medication.route,
    frequency: medication.frequency,
    instructions: medication.instructions,
    startDate: medication.startDate,
    endDate: medication.endDate,
    status: medication.status,
    prescribedBy: medication.prescribedBy,
    source: medication.source,
    discontinueReason: medication.discontinueReason,
    reactionNotes: medication.reactionNotes,
    lastRefilledAt: medication.lastRefilledAt,
    refillCount: medication.refillCount,
    events: medication.events,
    createdAt: medication.createdAt,
    updatedAt: medication.updatedAt,
  };
}
