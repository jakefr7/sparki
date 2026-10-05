import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { requireRole } from '../auth/require-role';
import type { AuthenticatedUser } from '../auth/types';
import type { CreatePatientFasInput } from './dto/patient-fas.schema';

@Injectable()
export class PatientFasService {
  async list(patientId: string, user: AuthenticatedUser, cursor?: string) {
    const scope = { organizationId: user.organizationId, locationId: user.locationId, patientId };
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found.');
    if (
      cursor &&
      !(await prisma.patientFasAssessment.findFirst({ where: { ...scope, id: cursor } }))
    ) {
      throw new NotFoundException('Assessment page not found.');
    }
    const rows = await prisma.patientFasAssessment.findMany({
      where: scope,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, 20);
    const location = await prisma.location.findFirst({
      where: { id: user.locationId, organizationId: user.organizationId },
      select: { timeZone: true },
    });
    return {
      items,
      timeZone: location?.timeZone,
      nextCursor: rows.length > 20 ? items[items.length - 1]!.id : null,
    };
  }

  async create(visitId: string, user: AuthenticatedUser, input: CreatePatientFasInput) {
    // Same clinical roles that already record intake; no new clinical authority.
    requireRole(user, ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    const handlingNotes = input.handlingNotes?.trim() || null;
    return prisma.$transaction(async (tx) => {
      const scope = { organizationId: user.organizationId, locationId: user.locationId };
      const visit = await tx.visit.findFirst({
        where: { id: visitId, ...scope },
        include: {
          checkout: true,
          soapNotes: { where: { status: 'Locked' }, select: { id: true } },
        },
      });
      if (!visit) throw new NotFoundException('Visit not found.');
      const existing = await tx.patientFasAssessment.findFirst({
        where: { visitId, requestId: input.requestId, ...scope },
      });
      if (existing) {
        if (
          existing.authorId !== user.id ||
          existing.score !== input.score ||
          existing.handlingNotes !== handlingNotes
        ) {
          throw new ConflictException('This save request was already used for another assessment.');
        }
        return existing;
      }
      if (
        visit.checkout ||
        visit.soapNotes.length ||
        [
          'Archived',
          'ArchivedWithExceptions',
          'RecordComplete',
          'VisitClosing',
          'VisitClosingWithExceptions',
          'Cancelled',
          'CancelledAfterArrival',
          'NoShow',
          'Rescheduled',
          'Referred',
          'Deferred',
        ].includes(visit.state)
      ) {
        throw new ConflictException(
          'This visit is closed or its record is signed. Record a new assessment during an active visit.',
        );
      }
      // Serialize against signoff/closure, which also guard and increment Visit.version.
      const changed = await tx.visit.updateMany({
        where: { id: visitId, ...scope, version: visit.version },
        data: { version: { increment: 1 }, lastUpdatedById: user.id },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'The visit changed elsewhere. Refresh before recording an assessment.',
        );
      return tx.patientFasAssessment.create({
        data: {
          ...scope,
          patientId: visit.patientId,
          visitId,
          requestId: input.requestId,
          score: input.score,
          handlingNotes,
          authorId: user.id,
          authorName: user.name,
          authorRole: user.role,
        },
      });
    });
  }
}
