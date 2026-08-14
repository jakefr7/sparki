import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma } from '@sparki/db';
import type { InventoryReservationStatus, InventoryUsageEventStatus } from '@sparki/db';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/types';
import type {
  ReleaseReservationInput,
  ReservationInput,
  UsageMappingInput,
  UsagePostInput,
  UsageRetryInput,
  UsageReversalInput,
} from './dto/usage.schema';
import { requireInventory } from './inventory.permissions';
import { ControlledService } from './controlled.service';

const D = (value: unknown) => new Prisma.Decimal(String(value ?? 0));
const ACTIVE_RESERVATIONS: InventoryReservationStatus[] = ['ACTIVE', 'PARTIALLY_CONSUMED'];
type UsageMapping = Prisma.InventoryUsageMappingGetPayload<{
  include: { components: { orderBy: { sequence: 'asc' } } };
}>;
type UsageComponent = UsageMapping['components'][number];
type UsageConfirmation = UsagePostInput['lines'][number];
type CatalogItemWithConversions = Prisma.CatalogItemGetPayload<{
  include: { conversions: true };
}>;
type StockBalanceWithLot = Prisma.StockBalanceGetPayload<{ include: { lot: true } }>;
type ControlledContainerWithDetails = Prisma.ControlledContainerGetPayload<{
  include: { profile: { include: { item: true } } };
}> & { lot: Prisma.InventoryLotGetPayload<object> | null };
type ControlledLedger = Awaited<ReturnType<ControlledService['postEvent']>>;

const jsonInput = (value: Prisma.JsonValue): Prisma.InputJsonValue | Prisma.JsonNullValueInput =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

@Injectable()
export class UsageService {
  constructor(private readonly controlled: ControlledService) {}
  async mappings(user: AuthenticatedUser) {
    requireInventory(user, 'VIEW_USAGE_MAPPINGS');
    return prisma.inventoryUsageMapping.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [{ clinicLocationId: null }, { clinicLocationId: user.locationId }],
      },
      include: { components: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createMapping(user: AuthenticatedUser, input: UsageMappingInput) {
    requireInventory(user, 'MANAGE_USAGE_MAPPINGS');
    await this.validateMapping(user, input);
    return this.serial(async (tx) => {
      const clinicLocationId = input.organizationWide ? null : user.locationId;
      const latest = await tx.inventoryUsageMapping.findFirst({
        where: {
          organizationId: user.organizationId,
          clinicLocationId,
          sourceType: input.sourceType,
          sourceReference: input.sourceReference,
        },
        orderBy: { version: 'desc' },
      });
      if (input.activate)
        await tx.inventoryUsageMapping.updateMany({
          where: {
            organizationId: user.organizationId,
            clinicLocationId,
            sourceType: input.sourceType,
            sourceReference: input.sourceReference,
            isActive: true,
          },
          data: { isActive: false, archivedAt: new Date(), updatedById: user.id },
        });
      return tx.inventoryUsageMapping.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId,
          sourceType: input.sourceType,
          sourceReference: input.sourceReference,
          sourceCatalogItemId: input.sourceCatalogItemId ?? null,
          version: (latest?.version ?? 0) + 1,
          isActive: input.activate,
          effectiveFrom: input.effectiveFrom ?? new Date(),
          reservationBehavior: input.reservationBehavior,
          deductionEvent: input.deductionEvent,
          lotSelectionPolicy: input.lotSelectionPolicy,
          createdById: user.id,
          updatedById: user.id,
          notes: input.notes ?? null,
          components: {
            create: input.components.map((component) => ({
              ...component,
              weightUnit: component.weightUnit ?? null,
              formulaConfiguration:
                component.formulaConfiguration === null ||
                component.formulaConfiguration === undefined
                  ? Prisma.JsonNull
                  : (component.formulaConfiguration as Prisma.InputJsonObject),
              preferredStockLocationId: component.preferredStockLocationId ?? null,
              substitutionGroup: component.substitutionGroup ?? null,
              notes: component.notes ?? null,
              fixedQuantity: component.fixedQuantity ? D(component.fixedQuantity) : null,
              doseMultiplier: component.doseMultiplier ? D(component.doseMultiplier) : null,
              weightMultiplier: component.weightMultiplier ? D(component.weightMultiplier) : null,
              wasteAllowance: D(component.wasteAllowance),
            })),
          },
        },
        include: { components: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async archiveMapping(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'MANAGE_USAGE_MAPPINGS');
    const mapping = await this.mapping(user, id);
    return prisma.inventoryUsageMapping.update({
      where: { id: mapping.id },
      data: { isActive: false, archivedAt: new Date(), updatedById: user.id },
    });
  }

  async duplicateMapping(user: AuthenticatedUser, id: string) {
    const mapping = await this.mapping(user, id);
    return this.createMapping(user, {
      sourceType: mapping.sourceType,
      sourceReference: `${mapping.sourceReference} Copy`,
      sourceCatalogItemId: mapping.sourceCatalogItemId,
      organizationWide: mapping.clinicLocationId === null,
      reservationBehavior: mapping.reservationBehavior,
      deductionEvent: mapping.deductionEvent,
      lotSelectionPolicy: mapping.lotSelectionPolicy,
      notes: mapping.notes,
      activate: false,
      components: mapping.components.map(({ id: _id, mappingId: _mappingId, ...component }) => ({
        ...component,
        fixedQuantity: component.fixedQuantity?.toString(),
        doseMultiplier: component.doseMultiplier?.toString(),
        weightMultiplier: component.weightMultiplier?.toString(),
        wasteAllowance: component.wasteAllowance.toString(),
        formulaConfiguration: component.formulaConfiguration as Record<string, unknown> | null,
      })),
    });
  }

  async testMapping(user: AuthenticatedUser, id: string, values: Record<string, string>) {
    const mapping = await this.mapping(user, id);
    return {
      mappingId: id,
      version: mapping.version,
      components: mapping.components.map((component) => ({
        componentId: component.id,
        itemId: component.itemId,
        quantity: this.calculate(component, values).toString(),
        unit: component.quantityUnit,
        confirmationRequired: component.staffConfirmationRequired,
      })),
    };
  }

  async reservations(user: AuthenticatedUser) {
    requireInventory(user, 'VIEW');
    await this.expireReservations(user);
    return prisma.inventoryReservation.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }

  async createReservation(user: AuthenticatedUser, input: ReservationInput) {
    requireInventory(user, 'CREATE_RESERVATIONS');
    const quantity = D(input.quantity);
    if (quantity.lte(0)) throw new BadRequestException('Reservation quantity must be positive');
    return this.serial(async (tx) => {
      const existing = await tx.inventoryReservation.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: user.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return existing;
      const balance = await tx.stockBalance.findFirst({
        where: {
          organizationId: user.organizationId,
          itemId: input.itemId,
          stockLocationId: input.stockLocationId,
          lotId: input.lotId ?? null,
          stockLocation: { clinicLocationId: user.locationId, isActive: true },
          ...(input.lotId
            ? {
                lot: {
                  status: 'AVAILABLE',
                  OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }],
                },
              }
            : {}),
        },
      });
      if (!balance) throw new NotFoundException('Eligible stock balance not found');
      const available = balance.onHand
        .minus(balance.reserved)
        .minus(balance.quarantined)
        .minus(balance.expired);
      const reserved = input.allowPartial ? Prisma.Decimal.min(quantity, available) : quantity;
      if (reserved.lte(0) || (!input.allowPartial && available.lt(quantity)))
        throw new ConflictException(
          `Insufficient available stock; ${available.toString()} available`,
        );
      await tx.stockBalance.update({
        where: { id: balance.id },
        data: { reserved: { increment: reserved } },
      });
      return tx.inventoryReservation.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          itemId: input.itemId,
          lotId: input.lotId ?? null,
          controlledContainerId: input.controlledContainerId ?? null,
          stockLocationId: input.stockLocationId,
          sourceEventType: input.sourceEventType,
          sourceEventId: input.sourceEventId,
          patientId: input.patientId ?? null,
          visitId: input.visitId ?? null,
          appointmentId: input.appointmentId ?? null,
          invoiceId: input.invoiceId ?? null,
          quantity: reserved,
          baseUnitSnapshot: input.baseUnit,
          reservedById: user.id,
          expiresAt: input.expiresAt ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });
    });
  }

  async releaseReservation(user: AuthenticatedUser, id: string, input: ReleaseReservationInput) {
    requireInventory(user, 'RELEASE_RESERVATIONS');
    return this.serial(async (tx) => {
      const reservation = await tx.inventoryReservation.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          status: { in: ACTIVE_RESERVATIONS },
        },
      });
      if (!reservation) throw new NotFoundException('Active reservation not found');
      const remaining = reservation.quantity.minus(reservation.consumedQuantity);
      await tx.stockBalance.updateMany({
        where: {
          itemId: reservation.itemId,
          stockLocationId: reservation.stockLocationId,
          lotId: reservation.lotId,
        },
        data: { reserved: { decrement: remaining } },
      });
      return tx.inventoryReservation.update({
        where: { id },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
          cancellationReason: input.reason,
        },
      });
    });
  }

  async usageEvents(user: AuthenticatedUser, status?: string) {
    requireInventory(user, 'VIEW');
    return prisma.inventoryUsageEvent.findMany({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        ...(status ? { status: status as InventoryUsageEventStatus } : {}),
      },
      include: { lines: true },
      orderBy: { occurredAt: 'desc' },
      take: 250,
    });
  }

  async postUsage(user: AuthenticatedUser, input: UsagePostInput) {
    requireInventory(user, 'POST_USAGE');
    const existing = await prisma.inventoryUsageEvent.findFirst({
      where: {
        clinicLocationId: user.locationId,
        sourceRecordType: input.sourceRecordType,
        sourceRecordId: input.sourceRecordId,
        eventType: input.eventType,
        sourceEventVersion: input.sourceEventVersion,
      },
      include: { lines: true },
    });
    if (existing?.status === 'POSTED') return existing;
    const mapping = input.mappingId
      ? await this.mapping(user, input.mappingId)
      : await prisma.inventoryUsageMapping.findFirst({
          where: {
            organizationId: user.organizationId,
            ...(input.sourceType ? { sourceType: input.sourceType } : {}),
            ...(input.sourceReference ? { sourceReference: input.sourceReference } : {}),
            isActive: true,
            effectiveFrom: { lte: input.occurredAt },
            OR: [{ clinicLocationId: user.locationId }, { clinicLocationId: null }],
          },
          include: { components: { orderBy: { sequence: 'asc' } } },
          orderBy: [{ clinicLocationId: 'desc' }, { version: 'desc' }],
        });
    if (!mapping)
      return this.reviewEvent(user, input, 'NO_USAGE_MAPPING', 'No active usage mapping exists');
    if (mapping.deductionEvent !== input.eventType)
      return this.reviewEvent(
        user,
        input,
        'SOURCE_EVENT_MISMATCH',
        `Mapping deducts on ${mapping.deductionEvent}, not ${input.eventType}`,
      );
    if (
      mapping.components.some(
        (component) =>
          component.staffConfirmationRequired &&
          !input.lines.some(
            (line) => line.componentId === component.id || line.itemId === component.itemId,
          ),
      )
    )
      return this.reviewEvent(
        user,
        input,
        'CONFIRMATION_REQUIRED',
        'Confirm required usage components',
      );
    const controlledItems = await prisma.catalogItem.count({
      where: {
        id: { in: mapping.components.map((component) => component.itemId) },
        controlledSubstance: true,
      },
    });
    if (controlledItems) {
      if (
        controlledItems !==
        mapping.components.filter(
          (component: { deductComponents: boolean }) => component.deductComponents,
        ).length
      )
        return this.reviewEvent(
          user,
          input,
          'MIXED_CONTROLLED_REVIEW',
          'Mixed controlled and non-controlled kits require explicit review before atomic posting',
          mapping,
        );
      if (
        mapping.components.some(
          (component) =>
            !input.lines.some(
              (line) =>
                (line.componentId === component.id || line.itemId === component.itemId) &&
                line.controlledContainerId,
            ),
        )
      )
        return this.reviewEvent(
          user,
          input,
          'CONTROLLED_REVIEW',
          'Select an authorized controlled container before posting',
          mapping,
        );
      return this.postControlled(user, input, mapping, existing?.id);
    }
    try {
      return await this.postNonControlled(user, input, mapping, existing?.id);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        return this.reviewEvent(
          user,
          input,
          error instanceof ConflictException ? 'INSUFFICIENT_STOCK' : 'POSTING_CONFIGURATION',
          error.message,
          mapping,
        );
      throw error;
    }
  }

  async retryUsage(user: AuthenticatedUser, id: string, input: UsageRetryInput) {
    requireInventory(user, 'RESOLVE_USAGE_FAILURES');
    const event = await prisma.inventoryUsageEvent.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        status: { in: ['NEEDS_REVIEW', 'FAILED'] },
      },
    });
    if (!event) throw new NotFoundException('Review event not found');
    await prisma.inventoryUsageEvent.delete({ where: { id } });
    return this.postUsage(user, {
      eventType: event.eventType,
      sourceRecordType: event.sourceRecordType,
      sourceRecordId: event.sourceRecordId,
      sourceEventVersion: event.sourceEventVersion,
      ...(event.mappingId ? { mappingId: event.mappingId } : {}),
      patientId: event.patientId,
      clientId: event.clientId,
      visitId: event.visitId,
      appointmentId: event.appointmentId,
      invoiceId: event.invoiceId,
      invoiceLineId: event.invoiceLineId,
      occurredAt: event.occurredAt,
      notes: event.notes,
      idempotencyKey: input.idempotencyKey,
      lines: input.lines,
    });
  }

  async reverseUsage(user: AuthenticatedUser, id: string, input: UsageReversalInput) {
    requireInventory(user, 'REVERSE_USAGE');
    const original = await prisma.inventoryUsageEvent.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        status: 'POSTED',
      },
      include: { lines: true, traces: true },
    });
    if (!original) throw new NotFoundException('Posted usage event not found');
    const existing = await prisma.inventoryUsageEvent.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: user.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return existing;
    const restock = input.disposition === 'RETURNED_TO_STOCK';
    return this.serial(async (tx) => {
      const reversal = await tx.inventoryUsageEvent.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          eventType:
            original.eventType === 'RETAIL_SALE_FINALIZED'
              ? 'FINANCIAL_REVERSAL'
              : 'CLINICAL_REVERSAL',
          sourceRecordType: 'InventoryUsageEvent',
          sourceRecordId: input.sourceRecordId,
          sourceEventVersion: 1,
          patientId: original.patientId,
          clientId: original.clientId,
          visitId: original.visitId,
          invoiceId: original.invoiceId,
          mappingSnapshot: jsonInput(original.mappingSnapshot),
          status: 'POSTED',
          occurredAt: input.occurredAt,
          postedAt: new Date(),
          postedById: user.id,
          reversedEventId: original.id,
          notes: `${input.reason} · ${input.disposition}`,
          idempotencyKey: input.idempotencyKey,
        },
      });
      for (const line of original.lines) {
        const transaction = line.inventoryTransactionId
          ? await tx.inventoryTransaction.findUnique({
              where: { id: line.inventoryTransactionId },
            })
          : null;
        if (!transaction || !restock) continue;
        const balance = await tx.stockBalance.findFirst({
          where: {
            itemId: line.itemId,
            stockLocationId: line.stockLocationId,
            lotId: line.lotId,
          },
        });
        if (!balance) throw new ConflictException('Original stock balance no longer exists');
        const quantity = line.confirmedQuantity.plus(line.wastedQuantity);
        const after = balance.onHand.plus(quantity);
        const reversalTransaction = await tx.inventoryTransaction.create({
          data: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            itemId: line.itemId,
            lotId: line.lotId,
            stockLocationId: line.stockLocationId,
            transactionGroupId: reversal.id,
            transactionType: 'USAGE_REVERSAL',
            quantityDelta: quantity,
            previousBalance: balance.onHand,
            resultingBalance: after,
            reason: input.reason,
            userId: user.id,
            patientId: original.patientId,
            visitId: original.visitId,
            invoiceId: original.invoiceId,
            reversesTransactionId: transaction.id,
            otherReference: `usage:${reversal.id}`,
          },
        });
        await tx.stockBalance.update({ where: { id: balance.id }, data: { onHand: after } });
        if (line.lotId)
          await tx.inventoryLot.update({
            where: { id: line.lotId },
            data: { quantity: { increment: quantity } },
          });
        await tx.inventoryUsageEventLine.create({
          data: {
            usageEventId: reversal.id,
            componentSnapshot: jsonInput(line.componentSnapshot),
            itemId: line.itemId,
            lotId: line.lotId,
            stockLocationId: line.stockLocationId,
            calculatedQuantity: quantity,
            confirmedQuantity: quantity,
            unitSnapshot: line.unitSnapshot,
            precisionSnapshot: line.precisionSnapshot,
            sourceBalance: balance.onHand,
            resultingBalance: after,
            inventoryTransactionId: reversalTransaction.id,
            reason: input.reason,
          },
        });
      }
      await tx.patientInventoryTrace.updateMany({
        where: { usageEventId: original.id },
        data: { reversedAt: input.occurredAt },
      });
      await tx.inventoryUsageEvent.update({
        where: { id: original.id },
        data: { status: 'REVERSED' },
      });
      return reversal;
    });
  }

  async patientTrace(user: AuthenticatedUser, patientId: string) {
    requireInventory(user, 'VIEW_PATIENT_LOT_TRACE');
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, organizationId: user.organizationId },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return prisma.patientInventoryTrace.findMany({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        patientId,
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async lotTrace(user: AuthenticatedUser, lotId: string) {
    requireInventory(user, 'VIEW_PATIENT_LOT_TRACE');
    const lot = await prisma.inventoryLot.findFirst({
      where: {
        id: lotId,
        organizationId: user.organizationId,
        stockLocation: { clinicLocationId: user.locationId },
      },
    });
    if (!lot) throw new NotFoundException('Lot not found');
    return {
      lot,
      traces: await prisma.patientInventoryTrace.findMany({
        where: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          itemId: lot.itemId,
          lotNumberSnapshot: lot.lotNumber,
        },
        orderBy: { occurredAt: 'desc' },
      }),
    };
  }

  async exportLotTrace(user: AuthenticatedUser, lotId: string) {
    requireInventory(user, 'EXPORT_LOT_PATIENTS');
    const result = await this.lotTrace(user, lotId);
    const rows = result.traces.map((trace) => [
      trace.patientId,
      trace.itemNameSnapshot,
      trace.lotNumberSnapshot ?? '',
      trace.expirationSnapshot?.toISOString().slice(0, 10) ?? '',
      trace.quantity.toString(),
      trace.unitSnapshot,
      trace.occurredAt.toISOString(),
      trace.reversedAt ? 'REVERSED' : 'ACTIVE',
    ]);
    const body = [
      ['patient_id', 'item', 'lot', 'expiration', 'quantity', 'unit', 'occurred_at', 'status'],
      ...rows,
    ]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    await prisma.inventoryUsageExportAudit.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        lotId,
        generatedById: user.id,
        rowCount: rows.length,
        format: 'CSV',
        checksum: createHash('sha256').update(body).digest('hex'),
      },
    });
    return body;
  }

  async metrics(user: AuthenticatedUser) {
    requireInventory(user, 'VIEW');
    await this.expireReservations(user);
    const base = { organizationId: user.organizationId, clinicLocationId: user.locationId };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [today, review, failed, reservations, expiring, unmapped, reversals] = await Promise.all([
      prisma.inventoryUsageEvent.count({ where: { ...base, postedAt: { gte: start } } }),
      prisma.inventoryUsageEvent.count({ where: { ...base, status: 'NEEDS_REVIEW' } }),
      prisma.inventoryUsageEvent.count({ where: { ...base, status: 'FAILED' } }),
      prisma.inventoryReservation.count({
        where: { ...base, status: { in: ACTIVE_RESERVATIONS } },
      }),
      prisma.inventoryReservation.count({
        where: {
          ...base,
          status: { in: ACTIVE_RESERVATIONS },
          expiresAt: { lte: new Date(Date.now() + 86400000) },
        },
      }),
      prisma.inventoryUsageEvent.count({
        where: { ...base, status: 'NEEDS_REVIEW', failureCode: 'NO_USAGE_MAPPING' },
      }),
      prisma.inventoryUsageEvent.count({
        where: {
          ...base,
          eventType: { in: ['CLINICAL_REVERSAL', 'FINANCIAL_REVERSAL'] },
          occurredAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
      }),
    ]);
    return {
      usageEventsToday: today,
      pendingUsageReview: review,
      failedDeductions: failed,
      activeReservations: reservations,
      reservationsExpiring: expiring,
      unmappedClinicalItems: unmapped,
      recentReversals: reversals,
    };
  }

  private async postNonControlled(
    user: AuthenticatedUser,
    input: UsagePostInput,
    mapping: UsageMapping,
    replaceEventId?: string,
  ) {
    return this.serial(async (tx) => {
      if (replaceEventId) await tx.inventoryUsageEvent.delete({ where: { id: replaceEventId } });
      const event = await tx.inventoryUsageEvent.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          eventType: input.eventType,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          sourceEventVersion: input.sourceEventVersion,
          patientId: input.patientId ?? null,
          clientId: input.clientId ?? null,
          visitId: input.visitId ?? null,
          appointmentId: input.appointmentId ?? null,
          invoiceId: input.invoiceId ?? null,
          invoiceLineId: input.invoiceLineId ?? null,
          mappingId: mapping.id,
          mappingVersion: mapping.version,
          mappingSnapshot: this.mappingSnapshot(mapping),
          status: 'PENDING',
          occurredAt: input.occurredAt,
          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });
      for (const component of mapping.components.filter((value) => value.deductComponents)) {
        const confirmation = input.lines.find(
          (line) => line.componentId === component.id || line.itemId === component.itemId,
        );
        if (component.optional && !confirmation) continue;
        const itemId = confirmation?.substitutionItemId ?? confirmation?.itemId ?? component.itemId;
        const item = await tx.catalogItem.findFirst({
          where: {
            id: itemId,
            organizationId: user.organizationId,
            status: 'ACTIVE',
            inventoryTracked: true,
            OR: [{ locationId: null }, { locationId: user.locationId }],
          },
          include: {
            conversions: { where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } },
          },
        });
        if (!item) throw new NotFoundException('Mapped inventory component is unavailable');
        const calculated = this.calculate(component, input);
        const quantity = confirmation?.confirmedQuantity
          ? D(confirmation.confirmedQuantity)
          : calculated;
        const waste = D(confirmation?.wastedQuantity);
        if (quantity.lte(0) || waste.lt(0))
          throw new BadRequestException('Usage quantities must be positive');
        const baseQuantity = this.toBaseQuantity(
          item,
          component.quantityUnit,
          quantity.plus(waste),
        );
        const allocations = await this.allocations(
          tx,
          user,
          item,
          baseQuantity,
          mapping.lotSelectionPolicy,
          confirmation,
          component,
        );
        for (const allocation of allocations) {
          const balance = allocation.balance;
          const after = balance.onHand.minus(allocation.quantity);
          if (after.lt(0)) throw new ConflictException('Insufficient stock during posting');
          const reservation = confirmation?.reservationId
            ? await tx.inventoryReservation.findFirst({
                where: {
                  id: confirmation.reservationId,
                  organizationId: user.organizationId,
                  clinicLocationId: user.locationId,
                  status: { in: ACTIVE_RESERVATIONS },
                  itemId,
                },
              })
            : null;
          const reservationRemaining = reservation
            ? reservation.quantity.minus(reservation.consumedQuantity)
            : D(0);
          const reservationConsumed = Prisma.Decimal.min(allocation.quantity, reservationRemaining);
          const transaction = await tx.inventoryTransaction.create({
            data: {
              organizationId: user.organizationId,
              clinicLocationId: user.locationId,
              itemId,
              lotId: allocation.lot?.id ?? null,
              stockLocationId: balance.stockLocationId,
              transactionGroupId: event.id,
              transactionType:
                input.eventType === 'RETAIL_SALE_FINALIZED' ? 'RETAIL_SALE' : 'CLINICAL_USAGE',
              quantityDelta: allocation.quantity.neg(),
              previousBalance: balance.onHand,
              resultingBalance: after,
              reason: `USAGE_${input.eventType}`,
              userId: user.id,
              patientId: input.patientId ?? null,
              visitId: input.visitId ?? null,
              invoiceId: input.invoiceId ?? null,
              otherReference: `${input.sourceRecordType}:${input.sourceRecordId}:v${input.sourceEventVersion}`,
              notes: input.notes ?? null,
            },
          });
          await tx.stockBalance.update({
            where: { id: balance.id },
            data: {
              onHand: after,
              ...(reservationConsumed.gt(0)
                ? { reserved: { decrement: reservationConsumed } }
                : {}),
            },
          });
          if (allocation.lot)
            await tx.inventoryLot.update({
              where: { id: allocation.lot.id },
              data: {
                quantity: { decrement: allocation.quantity },
                ...(after.isZero() ? { status: 'DEPLETED' } : {}),
              },
            });
          if (reservation && reservationConsumed.gt(0)) {
            const consumed = reservation.consumedQuantity.plus(reservationConsumed);
            await tx.inventoryReservation.update({
              where: { id: reservation.id },
              data: {
                consumedQuantity: consumed,
                status: consumed.gte(reservation.quantity) ? 'CONSUMED' : 'PARTIALLY_CONSUMED',
                ...(consumed.gte(reservation.quantity) ? { consumedAt: new Date() } : {}),
              },
            });
          }
          await tx.inventoryUsageEventLine.create({
            data: {
              usageEventId: event.id,
              componentSnapshot: this.componentSnapshot(component),
              itemId,
              lotId: allocation.lot?.id ?? null,
              stockLocationId: balance.stockLocationId,
              calculatedQuantity: calculated,
              confirmedQuantity: allocation.quantity,
              wastedQuantity: D(0),
              unitSnapshot: item.conversions[0]?.stockUnit ?? component.quantityUnit,
              precisionSnapshot: 6,
              sourceBalance: balance.onHand,
              resultingBalance: after,
              inventoryTransactionId: transaction.id,
              reservationId: reservation?.id ?? null,
              reservationConsumed,
              substitutionItemId: confirmation?.substitutionItemId ?? null,
              reason: confirmation?.reason ?? null,
            },
          });
          if (input.patientId)
            await tx.patientInventoryTrace.create({
              data: {
                organizationId: user.organizationId,
                clinicLocationId: user.locationId,
                patientId: input.patientId,
                visitId: input.visitId ?? null,
                usageEventId: event.id,
                itemId,
                itemNameSnapshot: item.name,
                manufacturerSnapshot: item.manufacturer,
                lotNumberSnapshot: allocation.lot?.lotNumber ?? null,
                expirationSnapshot: allocation.lot?.expirationDate ?? null,
                quantity: allocation.quantity,
                unitSnapshot: item.conversions[0]?.stockUnit ?? component.quantityUnit,
                route: input.route ?? item.route,
                performedById: user.id,
                authorizingVeterinarianId: input.authorizingVeterinarianId ?? null,
                occurredAt: input.occurredAt,
              },
            });
        }
      }
      return tx.inventoryUsageEvent.update({
        where: { id: event.id },
        data: { status: 'POSTED', postedAt: new Date(), postedById: user.id },
        include: { lines: true },
      });
    });
  }

  private async postControlled(
    user: AuthenticatedUser,
    input: UsagePostInput,
    mapping: UsageMapping,
    replaceEventId?: string,
  ) {
    const preparedLines: Array<{
      component: UsageComponent;
      item: ControlledContainerWithDetails['profile']['item'];
      container: ControlledContainerWithDetails;
      quantity: Prisma.Decimal;
      waste: Prisma.Decimal;
    }> = [];
    const postedLines: Array<{
      component: UsageComponent;
      item: ControlledContainerWithDetails['profile']['item'];
      ledger: ControlledLedger;
      container: ControlledContainerWithDetails;
      quantity: Prisma.Decimal;
      waste: Prisma.Decimal;
    }> = [];
    for (const component of mapping.components.filter((value) => value.deductComponents)) {
      const confirmation = input.lines.find(
        (line) => line.componentId === component.id || line.itemId === component.itemId,
      );
      if (component.optional && !confirmation) continue;
      if (!confirmation?.controlledContainerId)
        throw new BadRequestException('Controlled container selection is required');
      const container = await prisma.controlledContainer.findFirst({
        where: {
          id: confirmation.controlledContainerId,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          status: { notIn: ['DISPOSED', 'DEPLETED', 'PENDING_DISPOSAL'] },
        },
        include: {
          profile: { include: { item: true } },
        },
      });
      if (!container || container.profile.itemId !== component.itemId)
        throw new NotFoundException('Authorized controlled container is unavailable');
      const lot = container.lotId
        ? await prisma.inventoryLot.findFirst({
            where: {
              id: container.lotId,
              organizationId: user.organizationId,
              stockLocation: { clinicLocationId: user.locationId },
            },
          })
        : null;
      if (container.lotId && !lot)
        throw new NotFoundException('Controlled container lot is unavailable');
      const containerWithDetails: ControlledContainerWithDetails = { ...container, lot };
      const calculated = this.calculate(component, input);
      const quantity = confirmation.confirmedQuantity
        ? D(confirmation.confirmedQuantity)
        : calculated;
      const waste = D(confirmation.wastedQuantity);
      preparedLines.push({
        component,
        item: container.profile.item,
        container: containerWithDetails,
        quantity,
        waste,
      });
    }
    for (const prepared of preparedLines) {
      const eventType = input.eventType === 'PRESCRIPTION_DISPENSED' ? 'DISPENSED' : 'ADMINISTERED';
      const ledger = await this.controlled.postEvent(user, {
        idempotencyKey: `${input.idempotencyKey}:${prepared.component.id}`,
        registrationId: prepared.container.registrationId,
        profileId: prepared.container.profileId,
        containerId: prepared.container.id,
        lotId: prepared.container.lotId,
        stockLocationId: prepared.container.stockLocationId,
        eventType,
        quantity: prepared.quantity.toString(),
        eventAt: input.occurredAt,
        reason: `Clinical source ${input.sourceRecordType}:${input.sourceRecordId}`,
        patientId: input.patientId,
        clientId: input.clientId,
        visitId: input.visitId,
        prescriptionReference: eventType === 'DISPENSED' ? input.sourceRecordId : undefined,
        authorizingVeterinarianId: input.authorizingVeterinarianId,
        notes: input.notes,
        attestation: 'Validated automatic clinical inventory usage event',
      });
      if (prepared.waste.gt(0))
        await this.controlled.postEvent(user, {
          idempotencyKey: `${input.idempotencyKey}:${prepared.component.id}:waste`,
          registrationId: prepared.container.registrationId,
          profileId: prepared.container.profileId,
          containerId: prepared.container.id,
          lotId: prepared.container.lotId,
          stockLocationId: prepared.container.stockLocationId,
          eventType: 'WASTED_DURING_ADMINISTRATION',
          quantity: prepared.waste.toString(),
          eventAt: input.occurredAt,
          reason: `Waste from ${input.sourceRecordType}:${input.sourceRecordId}`,
          patientId: input.patientId,
          clientId: input.clientId,
          visitId: input.visitId,
          authorizingVeterinarianId: input.authorizingVeterinarianId,
          notes: input.notes,
          attestation: 'Validated automatic clinical inventory waste event',
        });
      postedLines.push({
        component: prepared.component,
        item: prepared.item,
        ledger,
        container: prepared.container,
        quantity: prepared.quantity,
        waste: prepared.waste,
      });
    }
    return this.serial(async (tx) => {
      if (replaceEventId) await tx.inventoryUsageEvent.delete({ where: { id: replaceEventId } });
      const event = await tx.inventoryUsageEvent.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          eventType: input.eventType,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          sourceEventVersion: input.sourceEventVersion,
          patientId: input.patientId ?? null,
          clientId: input.clientId ?? null,
          visitId: input.visitId ?? null,
          appointmentId: input.appointmentId ?? null,
          invoiceId: input.invoiceId ?? null,
          invoiceLineId: input.invoiceLineId ?? null,
          mappingId: mapping.id,
          mappingVersion: mapping.version,
          mappingSnapshot: this.mappingSnapshot(mapping),
          status: 'POSTED',
          occurredAt: input.occurredAt,
          postedAt: new Date(),
          postedById: user.id,
          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });
      for (const posted of postedLines) {
        await tx.inventoryUsageEventLine.create({
          data: {
            usageEventId: event.id,
            componentSnapshot: this.componentSnapshot(posted.component),
            itemId: posted.item.id,
            lotId: posted.container.lotId,
            controlledContainerId: posted.container.id,
            stockLocationId: posted.container.stockLocationId,
            calculatedQuantity: posted.quantity,
            confirmedQuantity: posted.quantity,
            wastedQuantity: posted.waste,
            unitSnapshot: posted.container.profile.baseUnit,
            precisionSnapshot: posted.container.profile.administrationPrecision,
            sourceBalance: posted.ledger.quantityBefore,
            resultingBalance: posted.ledger.quantityAfter,
            inventoryTransactionId: posted.ledger.inventoryTransactionId,
            controlledLedgerEntryId: posted.ledger.id,
          },
        });
        if (input.patientId)
          await tx.patientInventoryTrace.create({
            data: {
              organizationId: user.organizationId,
              clinicLocationId: user.locationId,
              patientId: input.patientId,
              visitId: input.visitId ?? null,
              usageEventId: event.id,
              itemId: posted.item.id,
              itemNameSnapshot: posted.item.name,
              manufacturerSnapshot: posted.item.manufacturer,
              lotNumberSnapshot: posted.container.lot?.lotNumber ?? null,
              expirationSnapshot: posted.container.lot?.expirationDate ?? null,
              controlledContainerReference: `••••${posted.container.containerNumber.slice(-4)}`,
              quantity: posted.quantity,
              unitSnapshot: posted.container.profile.baseUnit,
              route: input.route ?? posted.item.route,
              performedById: user.id,
              authorizingVeterinarianId: input.authorizingVeterinarianId ?? null,
              occurredAt: input.occurredAt,
            },
          });
      }
      return tx.inventoryUsageEvent.findUniqueOrThrow({
        where: { id: event.id },
        include: { lines: true },
      });
    });
  }

  private async allocations(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    item: CatalogItemWithConversions,
    requested: Prisma.Decimal,
    policy: string,
    confirmation: UsageConfirmation | undefined,
    component: UsageComponent,
  ) {
    const balances = await tx.stockBalance.findMany({
      where: {
        organizationId: user.organizationId,
        itemId: item.id,
        stockLocation: { clinicLocationId: user.locationId, isActive: true },
        ...(confirmation?.stockLocationId
          ? { stockLocationId: confirmation.stockLocationId }
          : component.preferredStockLocationId
            ? { stockLocationId: component.preferredStockLocationId }
            : {}),
        ...(confirmation?.lotId ? { lotId: confirmation.lotId } : {}),
        OR: [
          { lotId: null },
          {
            lot: {
              status: 'AVAILABLE',
              OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }],
            },
          },
        ],
      },
      include: { lot: true },
      orderBy:
        policy === 'FIFO'
          ? { lot: { receivedDate: 'asc' } }
          : { lot: { expirationDate: { sort: 'asc', nulls: 'last' } } },
    });
    let remaining = requested;
    const result: Array<{
      balance: StockBalanceWithLot;
      lot: StockBalanceWithLot['lot'];
      quantity: Prisma.Decimal;
    }> = [];
    for (const balance of balances) {
      const available = balance.onHand
        .minus(balance.quarantined)
        .minus(balance.expired)
        .minus(balance.reserved);
      if (available.lte(0)) continue;
      const quantity = Prisma.Decimal.min(available, remaining);
      result.push({ balance, lot: balance.lot, quantity });
      remaining = remaining.minus(quantity);
      if (remaining.isZero()) break;
    }
    if (remaining.gt(0))
      throw new ConflictException(
        `Insufficient eligible stock; shortage ${remaining.toString()} ${component.quantityUnit}`,
      );
    return result;
  }

  private toBaseQuantity(item: CatalogItemWithConversions, unit: string, quantity: Prisma.Decimal) {
    const conversion = item.conversions[0];
    if (!conversion) throw new BadRequestException(`Missing unit conversion for ${item.name}`);
    if (unit === conversion.stockUnit) return quantity;
    if (unit === conversion.purchaseUnit) return quantity.mul(conversion.purchaseToStock);
    if (unit === conversion.dispenseUnit && conversion.stockToDispense)
      return quantity.div(conversion.stockToDispense);
    throw new BadRequestException(`No safe ${unit} to ${conversion.stockUnit} conversion`);
  }

  private calculate(component: UsageComponent, values: Record<string, unknown>) {
    const dose = D(values.dose ?? 1);
    const units = D(values.units ?? 1);
    const weight = D(values.patientWeight ?? 0);
    if (component.quantityRule === 'FIXED') return D(component.fixedQuantity);
    if (component.quantityRule === 'PER_DOSE') return D(component.doseMultiplier ?? 1).mul(dose);
    if (component.quantityRule === 'PER_UNIT') return D(component.fixedQuantity ?? 1).mul(units);
    if (component.quantityRule === 'PER_PATIENT_WEIGHT') {
      if (weight.lte(0)) throw new BadRequestException('Patient weight is required');
      return D(component.weightMultiplier).mul(weight);
    }
    if (component.quantityRule === 'USER_CONFIRMED')
      throw new BadRequestException('Staff confirmation is required');
    const config = component.formulaConfiguration;
    if (
      !config ||
      typeof config !== 'object' ||
      Array.isArray(config) ||
      typeof config.input !== 'string' ||
      !['dose', 'units', 'patientWeight'].includes(config.input)
    )
      throw new BadRequestException('Unsupported structured formula');
    return D(values[config.input])
      .mul(D(config.multiplier ?? 1))
      .plus(D(config.offset ?? 0));
  }

  private async validateMapping(user: AuthenticatedUser, input: UsageMappingInput) {
    const ids = input.components.map((component) => component.itemId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Duplicate physical component in mapping');
    const items = await prisma.catalogItem.findMany({
      where: {
        id: { in: ids },
        organizationId: user.organizationId,
        status: 'ACTIVE',
        inventoryTracked: true,
        OR: [{ locationId: null }, { locationId: user.locationId }],
      },
      include: { conversions: { where: { isActive: true } } },
    });
    if (items.length !== ids.length)
      throw new BadRequestException('Every component must be an active tracked inventory item');
    for (const component of input.components) {
      const item = items.find((value) => value.id === component.itemId);
      const conversion = item?.conversions[0];
      if (
        !conversion ||
        ![conversion.stockUnit, conversion.purchaseUnit, conversion.dispenseUnit].includes(
          component.quantityUnit,
        )
      )
        throw new BadRequestException(
          `Missing unit conversion for ${item?.name ?? component.itemId}`,
        );
      if (
        ['FIXED', 'PER_UNIT'].includes(component.quantityRule) &&
        (!component.fixedQuantity || D(component.fixedQuantity).lte(0))
      )
        throw new BadRequestException('Fixed quantities must be positive');
    }
    if (
      input.sourceType === 'BUNDLE' &&
      input.sourceCatalogItemId &&
      ids.includes(input.sourceCatalogItemId)
    )
      throw new BadRequestException('A bundle cannot consume itself');
    if (input.sourceCatalogItemId) {
      const reverse = await prisma.inventoryUsageMapping.findFirst({
        where: {
          organizationId: user.organizationId,
          sourceCatalogItemId: { in: ids },
          components: { some: { itemId: input.sourceCatalogItemId } },
          isActive: true,
        },
      });
      if (reverse) throw new BadRequestException('Circular usage mapping detected');
    }
  }

  private async reviewEvent(
    user: AuthenticatedUser,
    input: UsagePostInput,
    code: string,
    message: string,
    mapping?: UsageMapping,
  ) {
    return prisma.inventoryUsageEvent.upsert({
      where: {
        clinicLocationId_sourceRecordType_sourceRecordId_eventType_sourceEventVersion: {
          clinicLocationId: user.locationId,
          sourceRecordType: input.sourceRecordType,
          sourceRecordId: input.sourceRecordId,
          eventType: input.eventType,
          sourceEventVersion: input.sourceEventVersion,
        },
      },
      create: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        eventType: input.eventType,
        sourceRecordType: input.sourceRecordType,
        sourceRecordId: input.sourceRecordId,
        sourceEventVersion: input.sourceEventVersion,
        patientId: input.patientId ?? null,
        clientId: input.clientId ?? null,
        visitId: input.visitId ?? null,
        appointmentId: input.appointmentId ?? null,
        invoiceId: input.invoiceId ?? null,
        invoiceLineId: input.invoiceLineId ?? null,
        mappingId: mapping?.id ?? null,
        mappingVersion: mapping?.version ?? null,
        mappingSnapshot: mapping ? this.mappingSnapshot(mapping) : Prisma.JsonNull,
        status: 'NEEDS_REVIEW',
        failureCode: code,
        failureMessage: message,
        occurredAt: input.occurredAt,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
      },
      update: { status: 'NEEDS_REVIEW', failureCode: code, failureMessage: message },
    });
  }

  private async expireReservations(user: AuthenticatedUser) {
    const expired = await prisma.inventoryReservation.findMany({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        status: { in: ACTIVE_RESERVATIONS },
        expiresAt: { lte: new Date() },
      },
    });
    for (const reservation of expired)
      await this.serial(async (tx) => {
        const remaining = reservation.quantity.minus(reservation.consumedQuantity);
        await tx.stockBalance.updateMany({
          where: {
            itemId: reservation.itemId,
            stockLocationId: reservation.stockLocationId,
            lotId: reservation.lotId,
          },
          data: { reserved: { decrement: remaining } },
        });
        await tx.inventoryReservation.update({
          where: { id: reservation.id },
          data: { status: 'EXPIRED', releasedAt: new Date() },
        });
      });
  }

  private async mapping(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'VIEW_USAGE_MAPPINGS');
    const mapping = await prisma.inventoryUsageMapping.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        OR: [{ clinicLocationId: null }, { clinicLocationId: user.locationId }],
      },
      include: { components: { orderBy: { sequence: 'asc' } } },
    });
    if (!mapping) throw new NotFoundException('Usage mapping not found');
    return mapping;
  }

  private mappingSnapshot(mapping: UsageMapping): Prisma.InputJsonObject {
    return {
      id: mapping.id,
      version: mapping.version,
      sourceType: mapping.sourceType,
      sourceReference: mapping.sourceReference,
      deductionEvent: mapping.deductionEvent,
      reservationBehavior: mapping.reservationBehavior,
      lotSelectionPolicy: mapping.lotSelectionPolicy,
      components: mapping.components.map((component) => this.componentSnapshot(component)),
    };
  }

  private componentSnapshot(component: UsageComponent): Prisma.InputJsonObject {
    return {
      id: component.id,
      itemId: component.itemId,
      quantityRule: component.quantityRule,
      ...(component.fixedQuantity ? { fixedQuantity: component.fixedQuantity.toString() } : {}),
      quantityUnit: component.quantityUnit,
      ...(component.doseMultiplier ? { doseMultiplier: component.doseMultiplier.toString() } : {}),
      ...(component.weightMultiplier
        ? { weightMultiplier: component.weightMultiplier.toString() }
        : {}),
      optional: component.optional,
      staffConfirmationRequired: component.staffConfirmationRequired,
      lotSelectionRequired: component.lotSelectionRequired,
      wasteAllowance: component.wasteAllowance.toString(),
      ...(component.substitutionGroup ? { substitutionGroup: component.substitutionGroup } : {}),
      physicalKit: component.physicalKit,
      deductComponents: component.deductComponents,
    };
  }

  private async serial<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 0; attempt < 3; attempt++)
      try {
        return await prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2)
          throw error;
      }
    throw new ConflictException('Concurrent inventory usage conflict');
  }
}
