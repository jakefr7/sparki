import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type UserRole } from '@sparki/db';
import type { CompleteVisitCheckoutInput, SaveVisitDischargeInput } from './dto/visit-discharge.schema';
import { VisitLifecycleService } from './visit-lifecycle.service';
import { TERMINAL_VISIT_STATES } from './visit-states';

@Injectable()
export class VisitDischargeService {
  constructor(private readonly lifecycle: VisitLifecycleService) {}

  async saveDischarge(
    visitId: string,
    organizationId: string,
    locationId: string,
    userId: string,
    input: SaveVisitDischargeInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findFirst({
        where: { id: visitId, organizationId, locationId },
        include: {
          intake: true,
          examFindings: true,
          checkout: true,
          exceptions: { where: { resolvedAt: null, severity: 'Critical' } },
          workItems: {
            where: {
              type: { in: ['Diagnostic', 'Estimate', 'ClientApproval', 'Treatment', 'Medication', 'ClientCommunication'] },
              status: { in: ['Pending', 'InProgress'] },
            },
          },
        },
      });
      if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
      if (TERMINAL_VISIT_STATES.includes(visit.state)) throw new ConflictException('A closed visit cannot be discharged again.');
      if (visit.checkout || visit.departedAt) throw new ConflictException('Discharge instructions cannot be changed after checkout.');
      assertVisitReadyForDischarge(visit);
      const discharge = await tx.visitDischarge.upsert({
        where: { visitId },
        create: {
          visitId,
          instructions: input.instructions,
          medicationInstructions: input.medicationInstructions ?? null,
          warningSigns: input.warningSigns ?? null,
          followUpPlan: input.followUpPlan ?? null,
          followUpRequired: input.followUpRequired,
          completedById: userId,
        },
        update: {
          instructions: input.instructions,
          medicationInstructions: input.medicationInstructions ?? null,
          warningSigns: input.warningSigns ?? null,
          followUpPlan: input.followUpPlan ?? null,
          followUpRequired: input.followUpRequired,
          completedById: userId,
          completedAt: new Date(),
        },
      });
      if (input.followUpRequired) {
        const previous = await tx.visitWorkItem.findUnique({ where: { id: `followup-${visitId}` } });
        const followUp = await tx.visitWorkItem.upsert({
          where: { id: `followup-${visitId}` },
          create: {
            id: `followup-${visitId}`,
            organizationId,
            locationId,
            visitId,
            type: 'FollowUp',
            title: input.followUpPlan ?? 'Arrange follow-up',
            assigneeRole: 'RECEPTIONIST',
          },
          update: { title: input.followUpPlan ?? 'Arrange follow-up', status: 'Pending', completedAt: null, completedById: null },
        });
        if (!previous || previous.status !== 'Pending') {
          await tx.visitWorkItemChange.create({
            data: {
              workItemId: followUp.id,
              visitId,
              actorId: userId,
              fromStatus: previous?.status ?? null,
              toStatus: 'Pending',
              reason: previous ? 'Follow-up requirement restored' : 'Follow-up required at discharge',
            },
          });
        }
      } else {
        const cancelled = await tx.visitWorkItem.findMany({
          where: { visitId, type: 'FollowUp', status: { in: ['Pending', 'InProgress'] } },
          select: { id: true, status: true },
        });
        await tx.visitWorkItem.updateMany({
          where: { visitId, type: 'FollowUp', status: { in: ['Pending', 'InProgress'] } },
          data: { status: 'Cancelled', completedAt: new Date(), completedById: userId, result: { reason: 'Follow-up no longer required' } },
        });
        for (const item of cancelled) {
          await tx.visitWorkItemChange.create({
            data: { workItemId: item.id, visitId, actorId: userId, fromStatus: item.status, toStatus: 'Cancelled', reason: 'Follow-up no longer required' },
          });
        }
      }
      return discharge;
    });
  }

  async completeCheckout(
    visitId: string,
    organizationId: string,
    locationId: string,
    userId: string,
    userRole: UserRole,
    input: CompleteVisitCheckoutInput,
  ) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, organizationId, locationId },
      include: { discharge: true, checkout: true, location: true, soapNotes: { where: { status: 'Locked' }, take: 1 } },
    });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
    if (visit.departedAt || visit.checkout) throw new ConflictException('Checkout has already been completed for this visit.');
    if (!visit.discharge) throw new ConflictException('Complete discharge instructions before checkout.');
    if (!input.clientContactConfirmed) throw new ConflictException('Confirm the client contact information before checkout.');
    if (input.balanceStatus === 'Outstanding' && !visit.location.allowCheckoutWithOutstandingBalance) {
      throw new ConflictException('This clinic requires the balance to be resolved before checkout.');
    }

    const recordAlreadyFinalized = visit.soapNotes.length > 0;
    const canClose = recordAlreadyFinalized && input.balanceStatus !== 'Outstanding';
    const nextState = canClose ? 'Archived' : recordAlreadyFinalized ? 'PaymentPending' : 'RecordCompletionPending';
    return this.lifecycle.transition({
      visitId,
      organizationId,
      locationId,
      actorId: userId,
      actorRole: userRole,
      expectedStates: [visit.state],
      toState: nextState,
      toPhase: canClose ? 'Closed' : 'RecordClosure',
      currentOwnerId: visit.primaryVeterinarianId,
      nextAction: canClose ? null : recordAlreadyFinalized ? 'Resolve outstanding balance' : 'Finalize medical record',
      timestamps: { departedAt: new Date(), ...(canClose ? { closedAt: new Date(), archivedAt: new Date() } : {}) },
      createWorkItems: input.balanceStatus === 'Outstanding' ? [{
        type: 'Payment',
        title: `Resolve outstanding balance: $${((input.outstandingBalanceCents ?? 0) / 100).toFixed(2)}`,
        assigneeRole: 'RECEPTIONIST',
      }] : [],
      metadata: { balanceStatus: input.balanceStatus, outstandingBalanceCents: input.outstandingBalanceCents ?? null },
      prepare: async (tx) => {
        await tx.visitCheckout.create({
          data: {
            visitId,
            clientContactConfirmed: input.clientContactConfirmed,
            missingAccountInformation: input.missingAccountInformation ?? null,
            balanceStatus: input.balanceStatus,
            outstandingBalanceCents: input.balanceStatus === 'Outstanding' ? input.outstandingBalanceCents ?? null : null,
            completedById: userId,
          },
        });
      },
    });
  }

  async resolveOutstandingBalance(
    visitId: string,
    organizationId: string,
    locationId: string,
    userId: string,
    userRole: UserRole,
  ) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, organizationId, locationId },
      include: { checkout: true, soapNotes: { where: { status: 'Locked' }, take: 1 } },
    });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
    if (visit.checkout?.balanceStatus !== 'Outstanding') throw new ConflictException('This visit does not have an outstanding checkout balance.');
    const canClose = visit.soapNotes.length > 0;
    return this.lifecycle.transition({
      visitId,
      organizationId,
      locationId,
      actorId: userId,
      actorRole: userRole,
      expectedStates: [visit.state],
      toState: canClose ? 'Archived' : 'RecordCompletionPending',
      toPhase: canClose ? 'Closed' : 'RecordClosure',
      nextAction: canClose ? null : 'Finalize medical record',
      completeWorkItemTypes: ['Payment'],
      timestamps: canClose ? { closedAt: new Date(), archivedAt: new Date() } : {},
      metadata: { balanceStatus: 'Paid' },
      prepare: async (tx) => {
        await tx.visitCheckout.update({
          where: { visitId },
          data: { balanceStatus: 'Paid', outstandingBalanceCents: 0, completedById: userId },
        });
      },
    });
  }
}

export function assertVisitReadyForDischarge(visit: {
  visitType: string;
  intake: { completedAt: Date | null } | null;
  examFindings: { completedAt: Date | null } | null;
  exceptions: Array<{ type: string }>;
  workItems: Array<{ title: string }>;
}) {
  if (!visit.intake?.completedAt) {
    throw new ConflictException('Complete intake before preparing discharge.');
  }
  if (visit.visitType !== 'TechnicianAppointment' && !visit.examFindings?.completedAt) {
    throw new ConflictException('Complete the veterinarian exam before preparing discharge.');
  }
  if (visit.exceptions.some((exception) => exception.type === 'EmergencyIntakeDeferred')) {
    throw new ConflictException('Complete the deferred emergency intake before preparing discharge.');
  }
}
