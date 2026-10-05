import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type UserRole } from '@sparki/db';
import type { CompleteVisitCheckoutInput, SaveVisitDischargeInput, UpdateVisitBalanceInput } from './dto/visit-discharge.schema';
import { assertVisitTransitionRequirements, VisitLifecycleService } from './visit-lifecycle.service';
import { TERMINAL_VISIT_STATES } from './visit-states';
import { VisitBillingService } from './visit-billing.service';

@Injectable()
export class VisitDischargeService {
  constructor(
    private readonly lifecycle: VisitLifecycleService,
    private readonly billing: VisitBillingService,
  ) {}

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
      // Discharge preparation and the CheckoutReady lifecycle transition share
      // one clinical-readiness policy. Keeping this call in the lifecycle layer
      // prevents a direct discharge write from bypassing required care or an
      // unresolved critical exception.
      assertVisitTransitionRequirements(visit, 'CheckoutReady');
      const discharge = await tx.visitDischarge.upsert({
        where: { visitId },
        include: { completedBy: { select: { displayName: true, firstName: true, lastName: true } } },
        create: {
          visitId,
          instructions: input.instructions,
          ...(input.clientGuidance !== undefined ? { clientGuidance: input.clientGuidance } : {}),
          medicationInstructions: input.medicationInstructions ?? null,
          warningSigns: input.warningSigns ?? null,
          followUpPlan: input.followUpPlan ?? null,
          followUpRequired: input.followUpRequired,
          completedById: userId,
        },
        update: {
          instructions: input.instructions,
          ...(input.clientGuidance !== undefined ? { clientGuidance: input.clientGuidance } : {}),
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
          where: { id: `followup-${visitId}`, visitId, type: 'FollowUp', status: { in: ['Pending', 'InProgress'] } },
          select: { id: true, status: true },
        });
        await tx.visitWorkItem.updateMany({
          where: { id: `followup-${visitId}`, visitId, type: 'FollowUp', status: { in: ['Pending', 'InProgress'] } },
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

    // When a real Invoice exists for this visit, the server-computed ledger
    // is authoritative — the frontend cannot mark a visit paid on its own
    // (see VisitBillingService). Visits with no Invoice (nothing has ever
    // called the new checkout-state/invoice endpoints for them) keep the
    // original self-reported flow exactly as before.
    const invoiceBalance = await this.billing.getBalanceSummary(visitId, organizationId, locationId);
    let hasOutstandingBalance: boolean;
    let outstandingBalanceCents: number | null;
    let balanceDispositionForRecord: 'NoBalanceReported' | 'OutstandingBalanceRecorded';
    if (invoiceBalance) {
      hasOutstandingBalance = invoiceBalance.remainingBalanceCents > 0;
      outstandingBalanceCents = hasOutstandingBalance ? invoiceBalance.remainingBalanceCents : null;
      balanceDispositionForRecord = hasOutstandingBalance ? 'OutstandingBalanceRecorded' : 'NoBalanceReported';
      // Every completed visit that has an Invoice should leave it finalized
      // — a $0 invoice should never stay editable forever just because
      // nothing ever prompted staff to freeze it, and there is no separate
      // user action for that case. A nonzero invoice reaching a zero balance
      // here is already guaranteed finalized: recordExternalPayment refuses
      // to run before finalization, so this call is a no-op for it (and for
      // an already-finalized $0 invoice — finalizeInvoice is idempotent).
      if (!hasOutstandingBalance && !invoiceBalance.finalizedAt) {
        await this.billing.finalizeInvoice(visitId, organizationId, locationId, userId);
      }
    } else {
      if (!input.balanceDisposition) {
        throw new BadRequestException('balanceDisposition is required when no invoice exists for this visit.');
      }
      hasOutstandingBalance = input.balanceDisposition === 'OutstandingBalanceRecorded';
      outstandingBalanceCents = hasOutstandingBalance ? input.outstandingBalanceCents ?? null : null;
      balanceDispositionForRecord = input.balanceDisposition;
    }
    if (hasOutstandingBalance && !visit.location.allowCheckoutWithOutstandingBalance) {
      throw new ConflictException('This clinic does not allow checkout while an outstanding balance is recorded.');
    }

    const recordAlreadyFinalized = visit.soapNotes.length > 0;
    const canClose = recordAlreadyFinalized && !hasOutstandingBalance;
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
      nextAction: canClose ? null : recordAlreadyFinalized ? 'Review outstanding balance' : 'Finalize medical record',
      timestamps: { departedAt: new Date(), ...(canClose ? { closedAt: new Date(), archivedAt: new Date() } : {}) },
      createWorkItems: hasOutstandingBalance ? [{
        type: 'Payment',
        title: `Review outstanding balance: $${((outstandingBalanceCents ?? 0) / 100).toFixed(2)}`,
        assigneeRole: 'RECEPTIONIST',
      }] : [],
      metadata: {
        source: 'manual_checkout_observation',
        balanceDisposition: balanceDispositionForRecord,
        outstandingBalanceCents,
        invoiceId: invoiceBalance?.invoiceId ?? null,
      },
      prepare: async (tx) => {
        await tx.visitCheckout.create({
          data: {
            visitId,
            clientContactConfirmed: input.clientContactConfirmed,
            missingAccountInformation: input.missingAccountInformation ?? null,
            balanceStatus: hasOutstandingBalance ? 'Outstanding' : 'Paid',
            outstandingBalanceCents,
            completedById: userId,
          },
        });
      },
    });
  }

  async updateOutstandingBalance(
    visitId: string,
    organizationId: string,
    locationId: string,
    userId: string,
    userRole: UserRole,
    input: UpdateVisitBalanceInput,
  ) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, organizationId, locationId },
      include: { checkout: true, soapNotes: { where: { status: 'Locked' }, take: 1 } },
    });
    if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
    if (visit.checkout?.balanceStatus !== 'Outstanding') throw new ConflictException('This visit does not have an outstanding checkout balance.');

    // If a real Invoice exists, don't trust the self-report: only allow this
    // to resolve the outstanding flag once the invoice's own ledger shows
    // nothing left to collect (i.e. a payment was actually recorded).
    const invoiceBalance = await this.billing.getBalanceSummary(visitId, organizationId, locationId);
    if (invoiceBalance && invoiceBalance.remainingBalanceCents > 0) {
      throw new ConflictException('This invoice still has a remaining balance. Record payment before resolving.');
    }

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
      metadata: { source: 'manual_balance_observation', balanceDisposition: input.balanceDisposition, note: input.note, previousOutstandingBalanceCents: visit.checkout.outstandingBalanceCents },
      prepare: async (tx) => {
        await tx.visitCheckout.update({
          where: { visitId },
          data: { balanceStatus: 'Paid', outstandingBalanceCents: 0, completedById: userId },
        });
      },
    });
  }
}
