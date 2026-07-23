// @ts-nocheck -- every external payload is Zod-validated; Prisma exact optionals are normalized here.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma } from '@sparki/db';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/types';
import type {
  AuthorizationInput,
  ControlledEventInput,
  ControlledTransferInput,
  DiscrepancyInput,
  ProfileInput,
  RegistrationInput,
  ReportStatusInput,
} from './dto/controlled.schema';
const D = (v: any) => new Prisma.Decimal(v ?? 0);
const outbound = new Set([
  'ADMINISTERED',
  'DISPENSED',
  'WASTED_DURING_ADMINISTRATION',
  'ACCIDENTAL_LOSS',
  'DAMAGED',
  'EXPIRED',
  'RETURNED_TO_VENDOR',
  'DISPOSED',
]);
@Injectable()
export class ControlledService {
  async registrations(user: AuthenticatedUser) {
    this.manager(user);
    const rows = await prisma.controlledRegistration.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...r, registrationNumber: `••••${r.registrationNumber.slice(-4)}` }));
  }
  async createRegistration(user: AuthenticatedUser, input: RegistrationInput) {
    this.manager(user);
    return prisma.controlledRegistration.create({
      data: {
        ...input,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        createdById: user.id,
      },
    });
  }
  async grant(user: AuthenticatedUser, registrationId: string, input: AuthorizationInput) {
    this.manager(user);
    await this.registration(user, registrationId);
    const target = await prisma.user.findFirst({
      where: { id: input.userId, organizationId: user.organizationId },
    });
    if (!target) throw new NotFoundException('User not found');
    return prisma.controlledAuthorization.create({
      data: {
        ...input,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        registrationId,
        grantedById: user.id,
      },
    });
  }
  async profiles(user: AuthenticatedUser) {
    await this.anyAuthorization(user);
    return prisma.controlledItemProfile.findMany({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        isActive: true,
      },
      include: {
        item: { select: { id: true, name: true, sku: true } },
        registration: { select: { id: true, type: true, authority: true } },
        containers: { where: { status: { notIn: ['DISPOSED', 'DEPLETED'] } } },
      },
    });
  }
  async createProfile(user: AuthenticatedUser, input: ProfileInput) {
    this.manager(user);
    await this.registration(user, input.registrationId);
    const item = await prisma.catalogItem.findFirst({
      where: { id: input.itemId, organizationId: user.organizationId, controlledSubstance: true },
    });
    if (!item) throw new NotFoundException('Controlled catalog item not found');
    const locations = await prisma.stockLocation.count({
      where: {
        id: { in: input.secureStockLocationIds },
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        isActive: true,
      },
    });
    if (locations !== input.secureStockLocationIds.length)
      throw new BadRequestException('Every secure stock location must belong to this clinic.');
    return prisma.$transaction(async (tx) => {
      await tx.controlledItemProfile.updateMany({
        where: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          itemId: input.itemId,
          isActive: true,
        },
        data: { isActive: false, effectiveTo: new Date() },
      });
      return tx.controlledItemProfile.create({
        data: {
          ...input,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          discrepancyThreshold: D(input.discrepancyThreshold),
          createdById: user.id,
        },
      });
    });
  }
  async overview(user: AuthenticatedUser) {
    await this.anyAuthorization(user);
    const base = { organizationId: user.organizationId, clinicLocationId: user.locationId };
    const [openDiscrepancies, pendingApproval, unresolvedWaste, externalReports, negative] =
      await Promise.all([
        prisma.controlledDiscrepancyCase.count({
          where: { ...base, status: { notIn: ['RESOLVED', 'CLOSED_NO_ADJUSTMENT'] } },
        }),
        prisma.controlledApproval.count({ where: { ...base, status: 'PENDING' } }),
        prisma.controlledDisposal.count({
          where: {
            ...base,
            status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'] },
          },
        }),
        prisma.controlledExternalReport.count({
          where: {
            ...base,
            status: {
              in: [
                'READY_FOR_REVIEW',
                'ACTION_REQUIRED',
                'CORRECTION_REQUIRED',
                'REJECTED_EXTERNALLY',
              ],
            },
          },
        }),
        prisma.controlledContainer.count({ where: { ...base, currentQuantity: { lt: 0 } } }),
      ]);
    return {
      metrics: {
        openDiscrepancies,
        pendingApproval,
        unresolvedWaste,
        externalReports,
        suspiciousBalances: negative,
      },
      notice:
        'Compliance-supporting records only. Confirm requirements with the clinic registrant or legal advisor.',
    };
  }
  async ledger(user: AuthenticatedUser) {
    await this.anyAuthorization(user);
    const rows = await prisma.controlledLedgerEntry.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: {
        profile: { include: { item: { select: { name: true, sku: true } } } },
        container: { select: { containerNumber: true } },
        registration: { select: { authority: true, registrationNumber: true } },
      },
      orderBy: { eventAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => ({
      ...r,
      registration: {
        ...r.registration,
        registrationNumber: `••••${r.registration.registrationNumber.slice(-4)}`,
      },
    }));
  }
  async postEvent(user: AuthenticatedUser, input: ControlledEventInput) {
    const needed = this.authorizationFor(input.eventType);
    await this.authorized(user, input.registrationId, needed);
    return this.serial(async (tx) => {
      const existing = await tx.controlledLedgerEntry.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: user.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return existing;
      const profile = await tx.controlledItemProfile.findFirst({
        where: {
          id: input.profileId,
          registrationId: input.registrationId,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          isActive: true,
        },
        include: { item: true },
      });
      if (!profile) throw new NotFoundException('Active controlled profile not found');
      if (profile.containerTracking && !input.containerId)
        throw new BadRequestException('A controlled container is required for this item.');
      if (!profile.secureStockLocationIds.includes(input.stockLocationId))
        throw new ForbiddenException('Controlled stock location is not approved for this item.');
      await this.validateClinical(tx, user, input, profile);
      const qty = D(input.quantity),
        delta =
          input.eventType === 'DISPOSAL_PENDING'
            ? D(0)
            : outbound.has(input.eventType)
              ? qty.neg()
              : qty;
      if (qty.lte(0)) throw new BadRequestException('Quantity must be greater than zero.');
      if (input.witnessId === user.id)
        throw new BadRequestException('Witness must be a distinct authorized user.');
      if (input.witnessId)
        await this.authorized(user, input.registrationId, 'WITNESS', input.witnessId, tx);
      if (
        ['WASTED_DURING_ADMINISTRATION', 'ACCIDENTAL_LOSS', 'DISPOSED'].includes(input.eventType) &&
        !input.witnessId
      )
        throw new BadRequestException('A distinct witness is required for this event.');
      return this.postOneTransaction(tx, user, profile, input, delta, randomUUID());
    });
  }
  async transfer(user: AuthenticatedUser, input: ControlledTransferInput) {
    await this.authorized(user, input.registrationId, 'CONTROLLED_CUSTODIAN');
    if (input.sourceStockLocationId === input.destinationStockLocationId)
      throw new BadRequestException('Source and destination must differ.');
    if (input.witnessId === user.id) throw new BadRequestException('Witness must be distinct.');
    if (input.witnessId)
      await this.authorized(user, input.registrationId, 'WITNESS', input.witnessId);
    return this.serial(async (tx) => {
      const existing = await tx.controlledLedgerEntry.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: user.organizationId,
            idempotencyKey: `${input.idempotencyKey}:out`,
          },
        },
      });
      if (existing) return existing;
      const profile = await tx.controlledItemProfile.findFirst({
        where: {
          id: input.profileId,
          registrationId: input.registrationId,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          isActive: true,
        },
        include: { item: true },
      });
      if (
        !profile ||
        ![input.sourceStockLocationId, input.destinationStockLocationId].every((x) =>
          profile.secureStockLocationIds.includes(x),
        )
      )
        throw new ForbiddenException(
          'Both locations must be approved under the same controlled registration.',
        );
      const group = randomUUID();
      const base = {
        ...input,
        eventAt: new Date(),
        patientId: null,
        clientId: null,
        visitId: null,
        prescriptionReference: null,
        purchaseOrderId: null,
        receiptId: null,
        authorizingVeterinarianId: null,
        externalReference: null,
        notes: null,
        stockLocationId: input.sourceStockLocationId,
        eventType: 'TRANSFER_OUT',
        attestation: input.attestation,
        idempotencyKey: `${input.idempotencyKey}:out`,
      };
      const out = await this.postOneTransaction(
        tx,
        user,
        profile,
        base,
        D(input.quantity).neg(),
        group,
        input.destinationStockLocationId,
      );
      await this.postOneTransaction(
        tx,
        user,
        profile,
        {
          ...base,
          stockLocationId: input.destinationStockLocationId,
          eventType: 'TRANSFER_IN',
          idempotencyKey: `${input.idempotencyKey}:in`,
        },
        D(input.quantity),
        group,
        input.sourceStockLocationId,
      );
      return out;
    });
  }
  async discrepancies(user: AuthenticatedUser) {
    await this.authorizedAny(user, ['DISCREPANCY_INVESTIGATOR', 'REGISTRANT']);
    return prisma.controlledDiscrepancyCase.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      orderBy: { detectedAt: 'desc' },
    });
  }
  async createDiscrepancy(user: AuthenticatedUser, input: DiscrepancyInput) {
    await this.authorized(user, input.registrationId, 'DISCREPANCY_INVESTIGATOR');
    const count = await prisma.controlledDiscrepancyCase.count({
      where: { organizationId: user.organizationId },
    });
    return prisma.controlledDiscrepancyCase.create({
      data: {
        ...input,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        caseNumber: `CD-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`,
        detectedById: user.id,
        expectedQuantity: input.expectedQuantity ? D(input.expectedQuantity) : null,
        actualQuantity: input.actualQuantity ? D(input.actualQuantity) : null,
        discrepancyQuantity:
          input.expectedQuantity && input.actualQuantity
            ? D(input.actualQuantity).minus(input.expectedQuantity)
            : null,
      },
    });
  }
  async reports(user: AuthenticatedUser) {
    await this.authorizedAny(user, ['REPORTING_MANAGER', 'REGISTRANT']);
    return prisma.controlledExternalReport.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: { events: true },
      orderBy: { dueAt: 'asc' },
    });
  }
  async updateReport(user: AuthenticatedUser, id: string, input: ReportStatusInput) {
    const report = await prisma.controlledExternalReport.findFirst({
      where: { id, organizationId: user.organizationId, clinicLocationId: user.locationId },
    });
    if (!report) throw new NotFoundException('Reporting record not found');
    await this.authorized(user, report.registrationId, 'REPORTING_MANAGER');
    if (input.status === 'FILED_EXTERNALLY' && !input.confirmationNumber)
      throw new BadRequestException('Record the external confirmation number.');
    return prisma.$transaction(async (tx) => {
      await tx.controlledExternalReportEvent.create({
        data: {
          reportId: id,
          fromStatus: report.status,
          toStatus: input.status,
          actorId: user.id,
          notes: input.notes,
          attestation: { text: input.attestation, recordedAt: new Date().toISOString() },
        },
      });
      return tx.controlledExternalReport.update({
        where: { id },
        data: {
          status: input.status,
          externalConfirmationNumber: input.confirmationNumber,
          ...(input.status === 'FILED_EXTERNALLY' ? { externallyFiledAt: new Date() } : {}),
          notes: input.notes,
        },
      });
    });
  }
  async postOneTransaction(
    tx: any,
    user: AuthenticatedUser,
    profile: any,
    input: any,
    delta: Prisma.Decimal,
    group: string,
    otherLocation?: string,
  ) {
    let balance = await tx.stockBalance.findFirst({
      where: {
        itemId: profile.itemId,
        stockLocationId: input.stockLocationId,
        lotId: input.lotId ?? null,
      },
    });
    const before = balance?.onHand ?? D(0),
      after = before.plus(delta);
    if (after.lt(0)) throw new ConflictException('Insufficient controlled running balance.');
    if (balance)
      await tx.stockBalance.update({
        where: { id: balance.id },
        data: {
          onHand: after,
          ...(input.eventType === 'DISPOSAL_PENDING'
            ? { quarantined: { increment: D(input.quantity) } }
            : input.eventType === 'RETURNED_TO_STOCK'
              ? { quarantined: { decrement: D(input.quantity) } }
              : input.eventType === 'DISPOSED'
                ? { quarantined: { decrement: D(input.quantity) } }
                : {}),
        },
      });
    else
      await tx.stockBalance.create({
        data: {
          organizationId: user.organizationId,
          itemId: profile.itemId,
          stockLocationId: input.stockLocationId,
          lotId: input.lotId,
          onHand: after,
        },
      });
    if (input.containerId) {
      const container = await tx.controlledContainer.findFirst({
        where: {
          id: input.containerId,
          profileId: profile.id,
          registrationId: profile.registrationId,
          stockLocationId: input.stockLocationId,
          status:
            input.eventType === 'DISPOSED' || input.eventType === 'RETURNED_TO_STOCK'
              ? { notIn: ['DISPOSED', 'DEPLETED'] }
              : { notIn: ['DISPOSED', 'DEPLETED', 'PENDING_DISPOSAL'] },
        },
      });
      if (!container) throw new ConflictException('Controlled container is unavailable.');
      const next = container.currentQuantity.plus(delta);
      if (next.lt(0)) throw new ConflictException('Insufficient container quantity.');
      await tx.controlledContainer.update({
        where: { id: container.id },
        data: {
          currentQuantity: next,
          ...(next.isZero()
            ? { status: 'DEPLETED', depletedAt: new Date() }
            : input.eventType === 'DISPOSAL_PENDING'
              ? { status: 'PENDING_DISPOSAL' }
              : input.eventType === 'RETURNED_TO_STOCK'
                ? { status: container.openedAt ? 'OPEN' : 'SEALED' }
                : input.eventType === 'DISPOSED'
                  ? { status: 'DISPOSED', disposedAt: new Date() }
                  : input.eventType === 'ADMINISTERED' && container.status === 'SEALED'
                    ? { status: 'OPEN', openedAt: new Date(), openedById: user.id }
                    : {}),
        },
      });
    }
    if (input.lotId)
      await tx.inventoryLot.update({
        where: { id: input.lotId },
        data: { quantity: { increment: delta } },
      });
    const tr = await tx.inventoryTransaction.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        itemId: profile.itemId,
        lotId: input.lotId,
        stockLocationId: input.stockLocationId,
        transactionGroupId: group,
        transactionType: this.inventoryType(input.eventType),
        quantityDelta: delta,
        previousBalance: before,
        resultingBalance: after,
        reason: `CONTROLLED_${input.eventType}`,
        patientId: input.patientId,
        visitId: input.visitId,
        purchaseOrderId: input.purchaseOrderId,
        otherReference: input.idempotencyKey,
        notes: input.notes,
        userId: user.id,
      },
    });
    const year = new Date(input.eventAt).getFullYear();
    const seq = await tx.controlledLedgerSequence.upsert({
      where: { registrationId_year: { registrationId: profile.registrationId, year } },
      create: { registrationId: profile.registrationId, year, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
    });
    const ledger = await tx.controlledLedgerEntry.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        registrationId: profile.registrationId,
        profileId: profile.id,
        itemId: profile.itemId,
        lotId: input.lotId,
        containerId: input.containerId,
        inventoryTransactionId: tr.id,
        transactionGroupId: group,
        entryNumber: `CL-${year}-${String(seq.nextValue - 1).padStart(6, '0')}`,
        idempotencyKey: input.idempotencyKey,
        eventType: input.eventType,
        eventAt: input.eventAt,
        quantityBefore: before,
        quantityChanged: delta,
        quantityAfter: after,
        baseUnitSnapshot: profile.baseUnit,
        dosageFormSnapshot: profile.dosageForm,
        strengthSnapshot: profile.strength,
        scheduleSnapshot: profile.stateSchedule ?? profile.federalSchedule,
        reason: input.reason,
        patientId: input.patientId,
        clientId: input.clientId,
        visitId: input.visitId,
        prescriptionReference: input.prescriptionReference,
        purchaseOrderId: input.purchaseOrderId,
        receiptId: input.receiptId,
        sourceStockLocationId: delta.lt(0) ? input.stockLocationId : otherLocation,
        destinationStockLocationId: delta.gt(0) ? input.stockLocationId : otherLocation,
        performedById: user.id,
        authorizingVeterinarianId: input.authorizingVeterinarianId,
        witnessId: input.witnessId,
        externalReference: input.externalReference,
        notes: input.notes,
        attestation: {
          text: input.attestation,
          version: 'controlled-v1',
          recordedAt: new Date().toISOString(),
        },
      },
    });
    if (input.eventType === 'DISPENSED' && (profile.reportingConfiguration as any)?.enabled)
      await tx.controlledExternalReport.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          registrationId: profile.registrationId,
          type: 'STATE_DISPENSING',
          status: 'ACTION_REQUIRED',
          jurisdiction: (profile.reportingConfiguration as any)?.jurisdiction ?? 'TN',
          authority:
            (profile.reportingConfiguration as any)?.authority ?? 'State reporting authority',
          sourceRecords: { ledgerEntryIds: [ledger.id] },
          dueAt: (profile.reportingConfiguration as any)?.dueDays
            ? new Date(Date.now() + (profile.reportingConfiguration as any).dueDays * 86400000)
            : null,
          notes: 'Reporting preparation and status tracking. External filing not yet confirmed.',
        },
      });
    return ledger;
  }
  private async validateClinical(tx: any, user: AuthenticatedUser, input: any, profile: any) {
    if (
      input.eventType === 'ADMINISTERED' &&
      (!input.patientId || !input.visitId || !input.authorizingVeterinarianId)
    )
      throw new BadRequestException(
        'Administration requires patient, visit, and authorizing veterinarian.',
      );
    if (
      input.eventType === 'DISPENSED' &&
      (!input.patientId ||
        !input.clientId ||
        !input.authorizingVeterinarianId ||
        !input.prescriptionReference)
    )
      throw new BadRequestException(
        'Dispensing requires patient, client, prescriber, and prescription reference.',
      );
    if (input.authorizingVeterinarianId)
      await this.authorized(
        user,
        input.registrationId,
        'AUTHORIZED_PRESCRIBER',
        input.authorizingVeterinarianId,
        tx,
      );
  }
  private inventoryType(event: string) {
    return event === 'ADMINISTERED'
      ? 'CONTROLLED_ADMINISTERED'
      : event === 'DISPENSED'
        ? 'CONTROLLED_DISPENSED'
        : ['WASTED_DURING_ADMINISTRATION', 'ACCIDENTAL_LOSS', 'DAMAGED', 'EXPIRED'].includes(event)
          ? 'CONTROLLED_WASTE'
          : event === 'DISPOSED'
            ? 'CONTROLLED_DISPOSAL'
            : ['TRANSFER_OUT', 'TRANSFER_IN'].includes(event)
              ? event
              : event === 'RECEIVED'
                ? 'PURCHASE'
                : 'CONTROLLED_CORRECTION';
  }
  private authorizationFor(event: string) {
    return event === 'RECEIVED'
      ? 'RECEIVER'
      : event === 'ADMINISTERED'
        ? 'ADMINISTRATOR'
        : event === 'DISPENSED'
          ? 'DISPENSER'
          : ['DISPOSED', 'DISPOSAL_PENDING'].includes(event)
            ? 'DISPOSAL_APPROVER'
            : event === 'COUNT_ADJUSTMENT'
              ? 'RECONCILIATION_REVIEWER'
              : 'CONTROLLED_CUSTODIAN';
  }
  private manager(user: AuthenticatedUser) {
    if (!['OWNER', 'PRACTICE_MANAGER'].includes(user.role))
      throw new ForbiddenException('Controlled configuration requires elevated permission.');
  }
  private async registration(user: AuthenticatedUser, id: string) {
    const r = await prisma.controlledRegistration.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        isActive: true,
      },
    });
    if (!r) throw new NotFoundException('Active controlled registration not found');
    return r;
  }
  private async anyAuthorization(user: AuthenticatedUser) {
    const auth = await prisma.controlledAuthorization.findFirst({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        userId: user.id,
        status: 'ACTIVE',
        effectiveDate: { lte: new Date() },
        OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }],
      },
    });
    if (!auth) throw new ForbiddenException('Controlled-substance authorization is required.');
    return auth;
  }
  private async authorizedAny(user: AuthenticatedUser, types: string[]) {
    const a = await this.anyAuthorization(user);
    if (!types.some((t) => a.authorizationTypes.includes(t)))
      throw new ForbiddenException('Required controlled authorization is missing.');
    return a;
  }
  private async authorized(
    user: AuthenticatedUser,
    registrationId: string,
    type: string,
    targetId = user.id,
    tx: any = prisma,
  ) {
    const auth = await tx.controlledAuthorization.findFirst({
      where: {
        registrationId,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        userId: targetId,
        status: 'ACTIVE',
        authorizationTypes: { has: type },
        effectiveDate: { lte: new Date() },
        OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }],
      },
    });
    if (!auth) throw new ForbiddenException(`Active controlled authorization required: ${type}`);
    return auth;
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
    throw new ConflictException('Concurrent controlled inventory update failed; retry.');
  }
}
