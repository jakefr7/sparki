import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma, type UserRole } from '@sparki/db';
import type { AmendVisitRecordInput, SaveVisitRecordDraftInput } from './dto/visit-record.schema';
import { resolveWorkflowStepId } from './visit-lifecycle.service';

const OPEN_RECORD_STATUSES = ['Draft', 'ReadyForReview'] as const;

@Injectable()
export class VisitRecordsService {
  async ensureDraftForVisit(visitId: string, organizationId: string, locationId: string, authorId: string) {
    return prisma.$transaction((tx) => this.ensureDraftForVisitTx(tx, visitId, organizationId, locationId, authorId));
  }

  async ensureDraftForVisitTx(
    tx: Prisma.TransactionClient,
    visitId: string,
    organizationId: string,
    locationId: string,
    authorId: string,
  ) {
      const visit = await tx.visit.findFirst({
        where: { id: visitId, organizationId, locationId },
        include: { examFindings: true },
      });
      if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
      const record = await tx.medicalRecord.upsert({
        where: { patientId: visit.patientId },
        create: { patientId: visit.patientId },
        update: {},
      });
      if (visit.medicalRecordId !== record.id) {
        await tx.visit.update({ where: { id: visit.id }, data: { medicalRecordId: record.id } });
      }
      const existing = await tx.soapNote.findFirst({
        where: { visitId, status: { in: [...OPEN_RECORD_STATUSES] } },
        orderBy: { createdAt: 'desc' },
      });
      return existing ?? tx.soapNote.create({
        data: {
          medicalRecordId: record.id,
          visitId,
          authorId,
          veterinarianId: visit.primaryVeterinarianId,
          subjective: visit.examFindings?.subjective ?? null,
          objective: visit.examFindings?.objective ?? null,
          assessment: visit.examFindings?.assessment ?? null,
          plan: visit.examFindings?.plan ?? null,
          status: 'Draft',
        },
      });
  }

  async listOpenForUser(organizationId: string, locationId: string, userId: string) {
    return prisma.visitWorkItem.findMany({
      where: {
        organizationId,
        locationId,
        type: 'RecordSignoff',
        status: { in: ['Pending', 'InProgress'] },
        OR: [
          { assigneeId: userId },
          { visit: { signoffDelegates: { some: { delegateId: userId } } } },
        ],
      },
      include: {
        assignee: true,
        visit: {
          include: {
            patient: true,
            primaryVeterinarian: true,
            soapNotes: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listOpenForLocation(organizationId: string, locationId: string) {
    return prisma.visitWorkItem.findMany({
      where: {
        organizationId,
        locationId,
        type: 'RecordSignoff',
        status: { in: ['Pending', 'InProgress'] },
      },
      include: {
        assignee: true,
        visit: {
          include: {
            patient: true,
            primaryVeterinarian: true,
            soapNotes: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async saveDraft(
    visitId: string,
    organizationId: string,
    locationId: string,
    userId: string,
    input: SaveVisitRecordDraftInput,
  ) {
    await this.assertCanWorkOnRecord(visitId, organizationId, locationId, userId);
    const note = await this.ensureDraftForVisit(visitId, organizationId, locationId, userId);
    if (!OPEN_RECORD_STATUSES.includes(note.status as (typeof OPEN_RECORD_STATUSES)[number])) {
      throw new ConflictException('Finalized medical records cannot be edited. Create an amendment instead.');
    }
    const changed = await prisma.soapNote.updateMany({
      where: { id: note.id, version: input.version, status: { in: [...OPEN_RECORD_STATUSES] } },
      data: {
        subjective: input.subjective ?? null,
        objective: input.objective ?? null,
        assessment: input.assessment ?? null,
        plan: input.plan ?? null,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new ConflictException('This record changed elsewhere. Refresh before saving again.');
    return prisma.soapNote.findUniqueOrThrow({ where: { id: note.id } });
  }

  async delegate(
    visitId: string,
    organizationId: string,
    locationId: string,
    assignedById: string,
    assignedByRole: UserRole,
    delegateId: string,
  ) {
    const visit = await prisma.visit.findFirst({ where: { id: visitId, organizationId, locationId } });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
    if (visit.closedAt) throw new ConflictException('This visit is closed and its signoff assignment cannot be changed.');
    if (visit.primaryVeterinarianId !== assignedById && !['OWNER', 'PRACTICE_MANAGER'].includes(assignedByRole)) {
      throw new ForbiddenException('Only the assigned veterinarian or clinic management can delegate record signoff.');
    }
    const delegate = await prisma.user.findFirst({
      where: {
        id: delegateId,
        organizationId,
        isActive: true,
        canFinalizeRecordsForOthers: true,
        clinicLocationAccess: {
          some: { organizationId, clinicLocationId: locationId, isActive: true },
        },
      },
    });
    if (!delegate) throw new ConflictException('That user is not authorized to finalize records for another doctor.');
    return prisma.$transaction(async (tx) => {
      await tx.visitRecordSignoffDelegate.deleteMany({ where: { visitId, delegateId: { not: delegateId } } });
      const assignment = await tx.visitRecordSignoffDelegate.upsert({
        where: { visitId_delegateId: { visitId, delegateId } },
        create: { visitId, delegateId, assignedById },
        update: { assignedById, assignedAt: new Date() },
        include: { delegate: true },
      });
      await tx.visitTransition.create({
        data: {
          organizationId,
          locationId,
          visitId,
          actorId: assignedById,
          fromPhase: visit.phase,
          toPhase: visit.phase,
          fromState: visit.state,
          toState: visit.state,
          reason: 'Record signoff delegate assigned',
          metadata: { delegateId },
        },
      });
      return assignment;
    });
  }

  async finalize(
    visitId: string,
    organizationId: string,
    locationId: string,
    signerId: string,
  ) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, organizationId, locationId },
      include: { signoffDelegates: true, checkout: true, soapNotes: { orderBy: { createdAt: 'desc' } } },
    });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
    const signer = await prisma.user.findFirst({ where: { id: signerId, organizationId, isActive: true } });
    const delegated = visit.signoffDelegates.some((entry) => entry.delegateId === signerId);
    const assignedTechnicianMaySign = visit.visitType === 'TechnicianAppointment' && visit.assignedTechnicianId === signerId;
    if (!signer || (visit.primaryVeterinarianId !== signerId && !assignedTechnicianMaySign && !(delegated && signer.canFinalizeRecordsForOthers))) {
      throw new ForbiddenException('You are not assigned or delegated to finalize this medical record.');
    }
    const note = visit.soapNotes.find((entry) => OPEN_RECORD_STATUSES.includes(entry.status as (typeof OPEN_RECORD_STATUSES)[number]));
    if (!note) throw new ConflictException('There is no open medical record to finalize.');
    const missing = [note.subjective, note.objective, note.assessment, note.plan].filter((value) => !value?.trim()).length;
    if (missing) throw new ConflictException('Complete all SOAP sections before finalizing the medical record.');
    const now = new Date();
    const contentHash = hashSoap(note);
    const canClose = Boolean(visit.checkout && visit.checkout.balanceStatus !== 'Outstanding');
    const nextState = canClose ? 'Archived' : 'RecordComplete';
    const nextPhase = canClose ? 'Closed' : 'RecordClosure';
    return prisma.$transaction(async (tx) => {
      const changed = await tx.soapNote.updateMany({
        where: { id: note.id, version: note.version, status: { in: [...OPEN_RECORD_STATUSES] } },
        data: {
          status: 'Locked',
          veterinarianId: signerId,
          signedAt: now,
          lockedAt: now,
          contentHash,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException('This record changed elsewhere. Refresh before finalizing.');
      await tx.visitWorkItem.updateMany({
        where: { visitId, type: 'RecordSignoff', status: { in: ['Pending', 'InProgress'] } },
        data: { status: 'Completed', completedById: signerId, completedAt: now },
      });
      const workflowStepId = canClose
        ? null
        : await resolveWorkflowStepId(tx, organizationId, locationId, nextState, nextPhase);
      const visitChanged = await tx.visit.updateMany({
        where: { id: visitId, organizationId, locationId, version: visit.version, state: visit.state },
        data: {
          state: nextState,
          phase: nextPhase,
          nextAction: canClose ? null : visit.checkout?.balanceStatus === 'Outstanding' ? 'Resolve outstanding balance' : 'Complete checkout',
          ...(canClose ? { closedAt: now, archivedAt: now } : {}),
          lastUpdatedById: signerId,
          workflowStepId,
          version: { increment: 1 },
        },
      });
      if (visitChanged.count !== 1) {
        throw new ConflictException('This visit changed elsewhere. Refresh before finalizing.');
      }
      await tx.visitTransition.create({
        data: {
          organizationId,
          locationId,
          visitId,
          actorId: signerId,
          fromPhase: visit.phase,
          toPhase: nextPhase,
          fromState: visit.state,
          toState: nextState,
          reason: delegated ? 'Finalized by assigned signoff delegate' : 'Finalized by assigned veterinarian',
          metadata: { soapNoteId: note.id, contentHash },
        },
      });
      return tx.soapNote.findUniqueOrThrow({ where: { id: note.id } });
    });
  }

  async amend(
    visitId: string,
    organizationId: string,
    locationId: string,
    userId: string,
    input: AmendVisitRecordInput,
  ) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, organizationId, locationId },
      include: { soapNotes: { where: { status: 'Locked' }, orderBy: { signedAt: 'desc' }, take: 1 } },
    });
    if (!visit?.soapNotes[0]) throw new NotFoundException('Finalized medical record not found.');
    const original = visit.soapNotes[0];
    const assignedTechnicianMayAmend = visit.visitType === 'TechnicianAppointment' && visit.assignedTechnicianId === userId;
    if (visit.primaryVeterinarianId !== userId && original.veterinarianId !== userId && !assignedTechnicianMayAmend) {
      throw new ForbiddenException('Only a responsible veterinarian may amend this record.');
    }
    return prisma.soapNote.create({
      data: {
        medicalRecordId: original.medicalRecordId,
        visitId: visit.id,
        authorId: userId,
        veterinarianId: userId,
        subjective: input.subjective ?? null,
        objective: input.objective ?? null,
        assessment: input.assessment ?? null,
        plan: input.plan ?? null,
        status: 'Amended',
        signedAt: new Date(),
        lockedAt: new Date(),
        amendsSoapNoteId: original.id,
        amendmentReason: input.reason,
        contentHash: hashSoap(input),
      },
    });
  }

  private async assertCanWorkOnRecord(
    visitId: string,
    organizationId: string,
    locationId: string,
    userId: string,
  ) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, organizationId, locationId },
      select: {
        visitType: true,
        primaryVeterinarianId: true,
        assignedTechnicianId: true,
        signoffDelegates: { where: { delegateId: userId }, select: { delegateId: true } },
      },
    });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
    const assignedTechnicianMayEdit = visit.visitType === 'TechnicianAppointment' && visit.assignedTechnicianId === userId;
    if (visit.primaryVeterinarianId !== userId && !assignedTechnicianMayEdit && visit.signoffDelegates.length === 0) {
      throw new ForbiddenException('Only the assigned veterinarian or an authorized delegate may edit this record.');
    }
  }
}

function hashSoap(value: { subjective?: string | null | undefined; objective?: string | null | undefined; assessment?: string | null | undefined; plan?: string | null | undefined }) {
  return createHash('sha256')
    .update(JSON.stringify({ subjective: value.subjective ?? null, objective: value.objective ?? null, assessment: value.assessment ?? null, plan: value.plan ?? null }))
    .digest('hex');
}
