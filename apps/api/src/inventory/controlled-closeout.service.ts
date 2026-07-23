// @ts-nocheck
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, prisma } from '@sparki/db';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { AuthenticatedUser } from '../auth/types';
import { ControlledService } from './controlled.service';
import type {
  ControlledCountEntry,
  ControlledPost,
  ControlledReview,
  CorrectionDecision,
  CorrectionInput,
  CreateControlledCount,
  DisposalAction,
  DisposalInput,
  ReportQuery,
} from './dto/controlled-closeout.schema';
const D = (v: any) => new Prisma.Decimal(v ?? 0);
@Injectable()
export class ControlledCloseoutService {
  constructor(private readonly controlled: ControlledService) {}
  async counts(user: AuthenticatedUser) {
    await this.authAny(user, ['COUNTER', 'RECONCILIATION_REVIEWER', 'REGISTRANT']);
    return prisma.controlledCountSession.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: { lines: { select: { finalQuantity: true, variance: true } }, reviews: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async createCount(user: AuthenticatedUser, input: CreateControlledCount) {
    await this.auth(user, input.registrationId, 'COUNTER');
    return this.serial(async (tx) => {
      const reg = await tx.controlledRegistration.findFirst({
        where: {
          id: input.registrationId,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          isActive: true,
        },
      });
      if (!reg) throw new NotFoundException('Active registration not found');
      const count = await tx.controlledCountSession.count({ where: { registrationId: reg.id } }),
        number = `CCOUNT-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
      const session = await tx.controlledCountSession.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          registrationId: reg.id,
          number,
          type: input.type,
          timing: input.timing,
          status: 'IN_PROGRESS',
          startedById: user.id,
          startedAt: new Date(),
          expectedSnapshotAt: new Date(),
          blindCount: input.blindCount,
          dualReviewRequired: input.dualReviewRequired,
          notes: input.notes,
        },
      });
      const profiles = await tx.controlledItemProfile.findMany({
        where: { registrationId: reg.id, isActive: true },
        include: { containers: { where: { status: { notIn: ['DISPOSED', 'DEPLETED'] } } } },
      });
      for (const p of profiles)
        for (const c of p.containers) {
          const lot = c.lotId ? await tx.inventoryLot.findUnique({ where: { id: c.lotId } }) : null;
          await tx.controlledCountLine.create({
            data: {
              sessionId: session.id,
              profileId: p.id,
              itemId: p.itemId,
              lotId: c.lotId,
              containerId: c.id,
              stockLocationId: c.stockLocationId,
              profileSnapshot: {
                federalSchedule: p.federalSchedule,
                stateSchedule: p.stateSchedule,
                dosageForm: p.dosageForm,
                strength: p.strength,
                concentration: p.concentration,
                baseUnit: p.baseUnit,
                precision: p.administrationPrecision,
                exactCountRequired: p.exactCountRequired,
                estimatedCountPermitted: p.estimatedCountPermitted,
              },
              containerSnapshot: {
                containerNumber: c.containerNumber,
                status: c.status,
                openedAt: c.openedAt,
                beyondUseDate: c.beyondUseDate,
                lotNumber: lot?.lotNumber,
                expirationDate: lot?.expirationDate,
              },
              expectedQuantity: c.currentQuantity,
            },
          });
        }
      await tx.controlledCountEvent.create({
        data: {
          sessionId: session.id,
          type: 'STARTED_AND_SCOPE_FROZEN',
          actorId: user.id,
          details: { lineCount: profiles.reduce((n, p) => n + p.containers.length, 0) },
        },
      });
      return session;
    });
  }
  async getCount(user: AuthenticatedUser, id: string) {
    const s = await this.findCount(user, id);
    const reviewer =
      [
        'SUBMITTED',
        'RECOUNT_REQUIRED',
        'FIRST_REVIEW_COMPLETE',
        'SECOND_REVIEW_REQUIRED',
        'APPROVED',
        'POSTED',
      ].includes(s.status) && (await this.has(user, s.registrationId, 'RECONCILIATION_REVIEWER'));
    return {
      ...s,
      lines: s.lines.map((l) =>
        s.blindCount && !reviewer
          ? (({ expectedQuantity: _e, adjustedExpected: _a, variance: _v, ...safe }) => safe)(l)
          : l,
      ),
    };
  }
  async enterCount(
    user: AuthenticatedUser,
    id: string,
    lineId: string,
    input: ControlledCountEntry,
  ) {
    const s = await this.findCount(user, id);
    await this.auth(user, s.registrationId, 'COUNTER');
    if (!['IN_PROGRESS', 'RECOUNT_REQUIRED'].includes(s.status))
      throw new ConflictException('Count is not open for entry');
    const line = s.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Count line not found');
    const snap = line.profileSnapshot as any;
    if (snap.exactCountRequired && !input.exact)
      throw new BadRequestException('This controlled item requires an exact count.');
    if (!input.exact && !snap.estimatedCountPermitted)
      throw new BadRequestException('Estimated counts are not permitted.');
    return this.serial(async (tx) => {
      const attempts = await tx.controlledCountEntry.count({ where: { lineId } });
      const e = await tx.controlledCountEntry.create({
        data: {
          lineId,
          attemptNumber: attempts + 1,
          quantity: D(input.quantity),
          exact: input.exact,
          sealedPackageCount: input.sealedPackageCount ? D(input.sealedPackageCount) : null,
          openedPackageCount: input.openedPackageCount ? D(input.openedPackageCount) : null,
          measuredQuantity: input.measuredQuantity ? D(input.measuredQuantity) : null,
          enteredById: user.id,
          method: input.method,
          notes: input.notes,
          attestation: { text: input.attestation, version: 'controlled-count-v1' },
        },
      });
      await tx.controlledCountLine.update({
        where: { id: lineId },
        data: { finalQuantity: e.quantity },
      });
      await tx.controlledCountEvent.create({
        data: {
          sessionId: id,
          type: attempts ? 'RECOUNT_RECORDED' : 'COUNT_RECORDED',
          actorId: user.id,
          details: { lineId, attempt: attempts + 1 },
        },
      });
      return e;
    });
  }
  async submitCount(user: AuthenticatedUser, id: string) {
    const s = await this.findCount(user, id);
    await this.auth(user, s.registrationId, 'COUNTER');
    if (
      !['IN_PROGRESS', 'RECOUNT_REQUIRED'].includes(s.status) ||
      s.lines.some((l) => l.finalQuantity === null)
    )
      throw new ConflictException('Complete every controlled count line before submission.');
    return this.serial(async (tx) => {
      let discrepancy = false;
      for (const l of s.lines) {
        const activity = await tx.controlledLedgerEntry.aggregate({
          where: {
            registrationId: s.registrationId,
            profileId: l.profileId,
            containerId: l.containerId,
            eventAt: { gt: s.expectedSnapshotAt! },
          },
          _sum: { quantityChanged: true },
        });
        const adjusted = l.expectedQuantity.plus(activity._sum.quantityChanged ?? 0),
          variance = l.finalQuantity!.minus(adjusted);
        let discrepancyId = null;
        if (!variance.isZero()) {
          discrepancy = true;
          const c = await tx.controlledDiscrepancyCase.create({
            data: {
              organizationId: user.organizationId,
              clinicLocationId: user.locationId,
              registrationId: s.registrationId,
              profileId: l.profileId,
              itemId: l.itemId,
              lotId: l.lotId,
              containerId: l.containerId,
              caseNumber: `CD-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
              detectedById: user.id,
              expectedQuantity: adjusted,
              actualQuantity: l.finalQuantity,
              discrepancyQuantity: variance,
              severity: 'MEDIUM',
              classification: 'UNKNOWN',
              status: 'RECOUNT_REQUIRED',
              investigationNotes: 'Created from unexplained controlled-count variance.',
            },
          });
          discrepancyId = c.id;
        }
        await tx.controlledCountLine.update({
          where: { id: l.id },
          data: { adjustedExpected: adjusted, variance, discrepancyId },
        });
      }
      const status = discrepancy ? 'RECOUNT_REQUIRED' : 'SUBMITTED';
      await tx.controlledCountEvent.create({
        data: { sessionId: id, type: 'SUBMITTED', actorId: user.id, details: { discrepancy } },
      });
      return tx.controlledCountSession.update({
        where: { id },
        data: { status, submittedById: user.id, submittedAt: new Date() },
      });
    });
  }
  async reviewCount(user: AuthenticatedUser, id: string, input: ControlledReview) {
    const s = await this.findCount(user, id);
    await this.auth(user, s.registrationId, 'RECONCILIATION_REVIEWER');
    if (user.id === s.startedById)
      throw new ForbiddenException('Counter cannot review their own controlled count.');
    const stage = s.firstReviewerId ? 2 : 1;
    if (stage === 2 && user.id === s.firstReviewerId)
      throw new ForbiddenException('Second reviewer must be distinct.');
    if (input.decision !== 'APPROVE' && !input.reason)
      throw new BadRequestException('A reason is required.');
    return this.serial(async (tx) => {
      const existing = await tx.controlledCountReview.findFirst({
        where: { organizationKey: user.organizationId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
      const review = await tx.controlledCountReview.create({
        data: {
          sessionId: id,
          stage,
          reviewerId: user.id,
          decision: input.decision,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          organizationKey: user.organizationId,
          attestation: { text: input.attestation },
        },
      });
      let status: any =
        input.decision === 'RECOUNT'
          ? 'RECOUNT_REQUIRED'
          : input.decision === 'REJECT'
            ? 'IN_PROGRESS'
            : stage === 1 && s.dualReviewRequired
              ? 'SECOND_REVIEW_REQUIRED'
              : 'APPROVED';
      await tx.controlledCountSession.update({
        where: { id },
        data: {
          status,
          ...(stage === 1
            ? { firstReviewerId: user.id, firstReviewedAt: new Date() }
            : { secondReviewerId: user.id, secondReviewedAt: new Date() }),
        },
      });
      await tx.controlledCountEvent.create({
        data: {
          sessionId: id,
          type: `REVIEW_${input.decision}`,
          actorId: user.id,
          details: { stage, reason: input.reason },
        },
      });
      return review;
    });
  }
  async postCount(user: AuthenticatedUser, id: string, input: ControlledPost) {
    const s = await this.findCount(user, id);
    await this.auth(user, s.registrationId, 'RECONCILIATION_REVIEWER');
    return this.serial(async (tx) => {
      const done = await tx.controlledCountSession.findFirst({
        where: { organizationId: user.organizationId, postingIdempotencyKey: input.idempotencyKey },
      });
      if (done) return done;
      if (s.status !== 'APPROVED')
        throw new ConflictException('Controlled count must be approved before posting.');
      for (const l of s.lines) {
        if (l.discrepancyId) {
          const c = await tx.controlledDiscrepancyCase.findUnique({
            where: { id: l.discrepancyId },
          });
          if (c && !['RESOLVED', 'CLOSED_NO_ADJUSTMENT'].includes(c.status))
            throw new ConflictException(`Resolve discrepancy ${c.caseNumber} before posting.`);
        }
        if (l.variance && !l.variance.isZero()) {
          const p = await tx.controlledItemProfile.findUnique({
            where: { id: l.profileId },
            include: { item: true },
          });
          const entry = await this.controlled.postOneTransaction(
            tx,
            user,
            p,
            {
              idempotencyKey: `${input.idempotencyKey}:${l.id}`,
              registrationId: s.registrationId,
              profileId: l.profileId,
              containerId: l.containerId,
              lotId: l.lotId,
              stockLocationId: l.stockLocationId,
              eventType: 'COUNT_ADJUSTMENT',
              quantity: l.variance.abs().toString(),
              eventAt: new Date(),
              reason: `Controlled count ${s.number}`,
              attestation: input.attestation,
            },
            l.variance,
            randomUUID(),
          );
          await tx.controlledCountLine.update({
            where: { id: l.id },
            data: { postedLedgerEntryId: entry.id },
          });
        }
      }
      await tx.controlledCountEvent.create({
        data: {
          sessionId: id,
          type: 'POSTED',
          actorId: user.id,
          details: { attestation: input.attestation },
        },
      });
      return tx.controlledCountSession.update({
        where: { id },
        data: {
          status: 'POSTED',
          postedById: user.id,
          postedAt: new Date(),
          postingIdempotencyKey: input.idempotencyKey,
        },
      });
    });
  }
  async corrections(user: AuthenticatedUser) {
    await this.authAny(user, ['CONTROLLED_CUSTODIAN', 'REGISTRANT']);
    return prisma.controlledCorrectionRequest.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: { events: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async proposeCorrection(user: AuthenticatedUser, input: CorrectionInput) {
    const original = await prisma.controlledLedgerEntry.findFirst({
      where: {
        id: input.originalEntryId,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
      },
    });
    if (!original) throw new NotFoundException('Ledger entry not found');
    await this.auth(user, original.registrationId, 'CONTROLLED_CUSTODIAN');
    if (input.reason === 'OTHER' && !input.explanation)
      throw new BadRequestException('Explanation required');
    return prisma.controlledCorrectionRequest.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        registrationId: original.registrationId,
        originalEntryId: original.id,
        status: 'PENDING_APPROVAL',
        reason: input.reason,
        explanation: input.explanation,
        proposedReplacement: input.proposedReplacement,
        quantityImpact: D(input.quantityImpact),
        patientImpact: input.patientImpact,
        reportingImpact: input.reportingImpact,
        requestedById: user.id,
        events: {
          create: {
            type: 'PROPOSED',
            actorId: user.id,
            details: { previewReversal: original.quantityChanged.neg().toString() },
          },
        },
      },
    });
  }
  async decideCorrection(user: AuthenticatedUser, id: string, input: CorrectionDecision) {
    const c = await prisma.controlledCorrectionRequest.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        status: 'PENDING_APPROVAL',
      },
    });
    if (!c) throw new NotFoundException('Pending correction not found');
    await this.auth(user, c.registrationId, 'RECONCILIATION_REVIEWER');
    if (c.requestedById === user.id)
      throw new ForbiddenException('Requester cannot approve their own correction.');
    if (input.decision === 'REJECT' && !input.reason)
      throw new BadRequestException('Rejection reason required');
    return prisma.$transaction(async (tx) => {
      await tx.controlledCorrectionEvent.create({
        data: {
          requestId: id,
          type: input.decision,
          actorId: user.id,
          details: { reason: input.reason },
          attestation: { text: input.attestation },
        },
      });
      return tx.controlledCorrectionRequest.update({
        where: { id },
        data: {
          status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          approvedById: input.decision === 'APPROVE' ? user.id : null,
          approvedAt: input.decision === 'APPROVE' ? new Date() : null,
          rejectionReason: input.reason,
        },
      });
    });
  }
  async postCorrection(user: AuthenticatedUser, id: string, input: ControlledPost) {
    const c = await prisma.controlledCorrectionRequest.findFirst({
      where: { id, organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: { events: true },
    });
    if (!c) throw new NotFoundException('Correction not found');
    await this.auth(user, c.registrationId, 'RECONCILIATION_REVIEWER');
    return this.serial(async (tx) => {
      const done = await tx.controlledCorrectionRequest.findFirst({
        where: { organizationId: user.organizationId, postingIdempotencyKey: input.idempotencyKey },
      });
      if (done) return done;
      if (c.status !== 'APPROVED') throw new ConflictException('Correction must be approved.');
      const original = await tx.controlledLedgerEntry.findUnique({
          where: { id: c.originalEntryId },
        }),
        p = await tx.controlledItemProfile.findUnique({
          where: { id: original.profileId },
          include: { item: true },
        });
      const base = {
        idempotencyKey: `${input.idempotencyKey}:reversal`,
        registrationId: c.registrationId,
        profileId: p.id,
        containerId: original.containerId,
        lotId: original.lotId,
        stockLocationId: original.sourceStockLocationId ?? original.destinationStockLocationId,
        eventType: 'REVERSAL',
        quantity: original.quantityChanged.abs().toString(),
        eventAt: new Date(),
        reason: `Correction reversal: ${c.reason}`,
        attestation: input.attestation,
      };
      const reversal = await this.controlled.postOneTransaction(
        tx,
        user,
        p,
        base,
        original.quantityChanged.neg(),
        randomUUID(),
      );
      await tx.controlledLedgerEntry.update({
        where: { id: reversal.id },
        data: { reversesEntryId: original.id },
      });
      let replacement = null;
      if (c.proposedReplacement) {
        const r: any = c.proposedReplacement,
          replacement = await this.controlled.postOneTransaction(
            tx,
            user,
            p,
            {
              ...base,
              ...r,
              idempotencyKey: `${input.idempotencyKey}:replacement`,
              eventType: r.eventType ?? original.eventType,
              reason: `Correction replacement: ${c.reason}`,
            },
            D(r.quantityChanged ?? original.quantityChanged),
            randomUUID(),
          );
        await tx.controlledLedgerEntry.update({
          where: { id: replacement.id },
          data: { correctsEntryId: original.id },
        });
      }
      if (c.reportingImpact)
        await tx.controlledExternalReport.updateMany({
          where: {
            registrationId: c.registrationId,
            sourceRecords: { path: ['ledgerEntryIds'], array_contains: original.id },
          },
          data: { status: 'CORRECTION_REQUIRED' },
        });
      await tx.controlledCorrectionEvent.create({
        data: {
          requestId: id,
          type: 'POSTED',
          actorId: user.id,
          details: { reversalId: reversal.id, replacementId: replacement?.id },
          attestation: { text: input.attestation },
        },
      });
      return tx.controlledCorrectionRequest.update({
        where: { id },
        data: {
          status: 'POSTED',
          postedAt: new Date(),
          postingIdempotencyKey: input.idempotencyKey,
        },
      });
    });
  }
  async disposals(user: AuthenticatedUser) {
    await this.authAny(user, ['CONTROLLED_CUSTODIAN', 'DISPOSAL_APPROVER', 'REGISTRANT']);
    return prisma.controlledDisposal.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async createDisposal(user: AuthenticatedUser, input: DisposalInput) {
    await this.auth(user, input.registrationId, 'CONTROLLED_CUSTODIAN');
    if (input.reason === 'OTHER' && !input.notes)
      throw new BadRequestException('Notes required for OTHER');
    const count = await prisma.controlledDisposal.count({
      where: { organizationId: user.organizationId },
    });
    return prisma.controlledDisposal.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        registrationId: input.registrationId,
        number: `DISP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`,
        reason: input.reason,
        proposedMethod: input.proposedMethod,
        authorizedParty: input.authorizedParty,
        externalReference: input.externalReference,
        scheduledAt: input.scheduledAt,
        createdById: user.id,
        notes: input.notes,
        lines: {
          create: {
            profileId: input.profileId,
            itemId: input.itemId,
            lotId: input.lotId,
            containerId: input.containerId,
            stockLocationId: input.stockLocationId,
            quantity: D(input.quantity),
            unitSnapshot: input.unit,
          },
        },
      },
    });
  }
  async actDisposal(user: AuthenticatedUser, id: string, input: DisposalAction) {
    const d = await prisma.controlledDisposal.findFirst({
      where: { id, organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: { lines: true },
    });
    if (!d) throw new NotFoundException('Disposal not found');
    if (d.status === 'COMPLETED') throw new ConflictException('Completed disposal is immutable');
    const needed = input.action === 'SUBMIT' ? 'CONTROLLED_CUSTODIAN' : 'DISPOSAL_APPROVER';
    await this.auth(user, d.registrationId, needed);
    if (['APPROVE', 'COMPLETE'].includes(input.action) && user.id === d.createdById)
      throw new ForbiddenException('Initiator cannot approve or complete their own disposal.');
    if (['REJECT', 'CANCEL'].includes(input.action) && !input.reason)
      throw new BadRequestException('Reason required');
    if (input.action === 'SUBMIT') {
      if (d.status !== 'DRAFT')
        throw new ConflictException('Only a draft disposal can be submitted');
      return this.serial(async (tx) => {
        for (const l of d.lines) {
          const existing = await tx.controlledLedgerEntry.findUnique({
            where: {
              organizationId_idempotencyKey: {
                organizationId: user.organizationId,
                idempotencyKey: `${input.idempotencyKey}:${l.id}:pending`,
              },
            },
          });
          const p = await tx.controlledItemProfile.findUnique({
            where: { id: l.profileId },
            include: { item: true },
          });
          const entry =
            existing ??
            (await this.controlled.postOneTransaction(
              tx,
              user,
              p,
              {
                idempotencyKey: `${input.idempotencyKey}:${l.id}:pending`,
                registrationId: d.registrationId,
                profileId: l.profileId,
                containerId: l.containerId,
                lotId: l.lotId,
                stockLocationId: l.stockLocationId,
                eventType: 'DISPOSAL_PENDING',
                quantity: l.quantity.toString(),
                eventAt: new Date(),
                reason: d.reason,
                externalReference: d.externalReference,
                attestation: input.attestation,
              },
              D(0),
              randomUUID(),
            ));
          await tx.controlledDisposalLine.update({
            where: { id: l.id },
            data: { pendingLedgerEntryId: entry.id },
          });
        }
        return tx.controlledDisposal.update({
          where: { id },
          data: { status: 'PENDING_APPROVAL' },
        });
      });
    }
    if (input.action === 'COMPLETE') {
      if (new Set(input.witnessIds).size < 2 || input.witnessIds.includes(user.id))
        throw new BadRequestException(
          'Two distinct witnesses, separate from the completing user, are required.',
        );
      for (const witness of input.witnessIds)
        await this.auth(user, d.registrationId, 'WITNESS', witness);
      return this.serial(async (tx) => {
        const existing = await tx.controlledDisposal.findFirst({
          where: { organizationId: user.organizationId, idempotencyKey: input.idempotencyKey },
        });
        if (existing) return existing;
        if (!['READY_FOR_COMPLETION', 'SCHEDULED', 'APPROVED'].includes(d.status))
          throw new ConflictException('Disposal is not ready for completion');
        for (const l of d.lines) {
          const p = await tx.controlledItemProfile.findUnique({
            where: { id: l.profileId },
            include: { item: true },
          });
          const entry = await this.controlled.postOneTransaction(
            tx,
            user,
            p,
            {
              idempotencyKey: `${input.idempotencyKey}:${l.id}`,
              registrationId: d.registrationId,
              profileId: l.profileId,
              containerId: l.containerId,
              lotId: l.lotId,
              stockLocationId: l.stockLocationId,
              eventType: 'DISPOSED',
              quantity: l.quantity.toString(),
              eventAt: new Date(),
              reason: d.reason,
              witnessId: input.witnessIds[0],
              externalReference: d.externalReference,
              attestation: input.attestation,
            },
            l.quantity.neg(),
            randomUUID(),
          );
          await tx.controlledDisposalLine.update({
            where: { id: l.id },
            data: { disposedLedgerEntryId: entry.id },
          });
        }
        return tx.controlledDisposal.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedById: user.id,
            completedAt: new Date(),
            witnessIds: input.witnessIds,
            idempotencyKey: input.idempotencyKey,
          },
        });
      });
    }
    if (input.action === 'CANCEL' && d.lines.some((line) => line.pendingLedgerEntryId)) {
      return this.serial(async (tx) => {
        for (const l of d.lines.filter((line) => line.pendingLedgerEntryId)) {
          const p = await tx.controlledItemProfile.findUnique({
            where: { id: l.profileId },
            include: { item: true },
          });
          await this.controlled.postOneTransaction(
            tx,
            user,
            p,
            {
              idempotencyKey: `${input.idempotencyKey}:${l.id}:return`,
              registrationId: d.registrationId,
              profileId: l.profileId,
              containerId: l.containerId,
              lotId: l.lotId,
              stockLocationId: l.stockLocationId,
              eventType: 'RETURNED_TO_STOCK',
              quantity: l.quantity.toString(),
              eventAt: new Date(),
              reason: input.reason,
              attestation: input.attestation,
            },
            D(0),
            randomUUID(),
          );
        }
        return tx.controlledDisposal.update({
          where: { id },
          data: { status: 'CANCELLED', notes: input.reason },
        });
      });
    }
    const next: any =
      input.action === 'APPROVE'
        ? 'READY_FOR_COMPLETION'
        : input.action === 'REJECT'
          ? 'REJECTED'
          : 'CANCELLED';
    return prisma.controlledDisposal.update({
      where: { id },
      data: {
        status: next,
        ...(input.action === 'APPROVE' ? { approvedById: user.id } : {}),
        notes: input.reason ?? d.notes,
      },
    });
  }
  async authorizations(user: AuthenticatedUser) {
    this.manager(user);
    return prisma.controlledAuthorization.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      orderBy: { createdAt: 'desc' },
    });
  }
  async revokeAuthorization(user: AuthenticatedUser, id: string, reason: string) {
    this.manager(user);
    const a = await prisma.controlledAuthorization.findFirst({
      where: { id, organizationId: user.organizationId, clinicLocationId: user.locationId },
    });
    if (!a) throw new NotFoundException('Authorization not found');
    return prisma.controlledAuthorization.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedById: user.id,
        revokedAt: new Date(),
        notes: `${a.notes ?? ''}\nRevoked: ${reason}`,
      },
    });
  }
  async exportReport(user: AuthenticatedUser, q: ReportQuery) {
    await this.auth(user, q.registrationId, 'REPORTING_MANAGER');
    const reg = await prisma.controlledRegistration.findFirst({
      where: {
        id: q.registrationId,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    const rows = await prisma.controlledLedgerEntry.findMany({
      where: {
        registrationId: q.registrationId,
        ...(q.eventType ? { eventType: q.eventType } : {}),
        ...(q.from || q.to
          ? { eventAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
          : {}),
      },
      include: { profile: { include: { item: true } }, container: true },
      orderBy: { eventAt: 'asc' },
    });
    const columns = [
      'entry_number',
      'event_time',
      'recorded_time',
      'item',
      'schedule',
      'event',
      'container',
      'quantity_change',
      'running_balance',
      'unit',
      'performed_by',
      'witness',
      'patient',
      'visit',
      'external_reference',
    ];
    const data = rows.map((r) => [
      r.entryNumber,
      r.eventAt.toISOString(),
      r.recordedAt.toISOString(),
      r.profile.item.name,
      r.scheduleSnapshot,
      r.eventType,
      r.container?.containerNumber ?? '',
      r.quantityChanged.toString(),
      r.quantityAfter.toString(),
      r.baseUnitSnapshot,
      r.performedById,
      r.witnessId ?? '',
      r.patientId ?? '',
      r.visitId ?? '',
      r.externalReference ?? '',
    ]);
    const filters = {
      reportType: q.reportType,
      eventType: q.eventType ?? null,
      from: q.from?.toISOString() ?? null,
      to: q.to?.toISOString() ?? null,
    };
    let body: any,
      mime = 'application/json',
      ext = 'json';
    if (q.format === 'csv') {
      body =
        '\ufeff' +
        [columns, ...data]
          .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
          .join('\r\n');
      mime = 'text/csv; charset=utf-8';
      ext = 'csv';
    } else if (q.format === 'pdf') {
      const python =
          process.env.SPARKI_PYTHON ??
          '/Users/jakefranco/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
        script = resolve(process.cwd(), '../../scripts/render-controlled-report.py');
      const result = spawnSync(python, [script], {
        input: JSON.stringify({
          title: q.reportType.replaceAll('_', ' '),
          clinicId: user.locationId,
          registration: `${reg.authority} ••••${reg.registrationNumber.slice(-4)}`,
          generatedAt: new Date().toISOString(),
          generatedBy: user.name,
          timezone: 'America/Chicago',
          filters,
          columns,
          rows: data,
        }),
        encoding: null,
        maxBuffer: 20_000_000,
      });
      if (result.status !== 0)
        throw new ServiceUnavailableException(
          `PDF generation unavailable: ${result.stderr?.toString()}`,
        );
      body = result.stdout;
      mime = 'application/pdf';
      ext = 'pdf';
    } else
      body = {
        title: q.reportType,
        registration: `••••${reg.registrationNumber.slice(-4)}`,
        filters,
        rows,
      };
    await prisma.controlledExportAudit.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        registrationId: reg.id,
        reportType: q.reportType,
        format: q.format.toUpperCase(),
        filters,
        generatedById: user.id,
        rowCount: rows.length,
        checksum: createHash('sha256')
          .update(Buffer.isBuffer(body) ? body : JSON.stringify(body))
          .digest('hex'),
      },
    });
    return {
      body,
      mime,
      filename: `${q.reportType.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${ext}`,
    };
  }
  private async findCount(user: AuthenticatedUser, id: string) {
    const s = await prisma.controlledCountSession.findFirst({
      where: { id, organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: { lines: { include: { entries: true } }, reviews: true, events: true },
    });
    if (!s) throw new NotFoundException('Controlled count not found');
    await this.authAny(
      user,
      ['COUNTER', 'RECONCILIATION_REVIEWER', 'REGISTRANT'],
      s.registrationId,
    );
    return s;
  }
  private manager(u: AuthenticatedUser) {
    if (!['OWNER', 'PRACTICE_MANAGER'].includes(u.role))
      throw new ForbiddenException('Elevated controlled administration permission required');
  }
  private async has(u: AuthenticatedUser, r: string, t: string, target = u.id) {
    return Boolean(
      await prisma.controlledAuthorization.findFirst({
        where: {
          organizationId: u.organizationId,
          clinicLocationId: u.locationId,
          registrationId: r,
          userId: target,
          status: 'ACTIVE',
          authorizationTypes: { has: t },
          effectiveDate: { lte: new Date() },
          OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }],
        },
      }),
    );
  }
  private async auth(u: AuthenticatedUser, r: string, t: string, target = u.id) {
    if (!(await this.has(u, r, t, target)))
      throw new ForbiddenException(`Active controlled authorization required: ${t}`);
  }
  private async authAny(u: AuthenticatedUser, types: string[], registrationId?: string) {
    const a = await prisma.controlledAuthorization.findFirst({
      where: {
        organizationId: u.organizationId,
        clinicLocationId: u.locationId,
        userId: u.id,
        status: 'ACTIVE',
        ...(registrationId ? { registrationId } : {}),
        authorizationTypes: { hasSome: types },
        effectiveDate: { lte: new Date() },
        OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }],
      },
    });
    if (!a) throw new ForbiddenException('Required controlled authorization is missing');
    return a;
  }
  private async serial<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let i = 0; i < 3; i++)
      try {
        return await prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2034' || i === 2)
          throw e;
      }
    throw new ConflictException('Concurrent controlled workflow conflict; retry.');
  }
}
