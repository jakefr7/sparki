import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../src/auth/types';
import { UsageService } from '../src/inventory/usage.service';
import { ControlledService } from '../src/inventory/controlled.service';

describe('Inventory clinical usage (e2e)', () => {
  const service = new UsageService(new ControlledService());
  let user: AuthenticatedUser;
  let organizationId = '';
  let itemId = '';
  let lotId = '';
  let stockLocationId = '';
  let mappingId = '';
  let patientId = '';

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Inventory usage test' },
    });
    organizationId = organization.id;
    const location = await prisma.location.create({
      data: { organizationId, name: 'Usage clinic' },
    });
    const actor = await prisma.user.create({
      data: {
        organizationId,
        email: `usage-${crypto.randomUUID()}@example.test`,
        firstName: 'Usage',
        lastName: 'Manager',
        role: 'PRACTICE_MANAGER',
      },
    });
    const patient = await prisma.patient.create({
      data: { organizationId, name: 'Trace Patient', species: 'Canine' },
    });
    patientId = patient.id;
    const stockLocation = await prisma.stockLocation.create({
      data: { organizationId, clinicLocationId: location.id, name: 'Pharmacy' },
    });
    stockLocationId = stockLocation.id;
    const item = await prisma.catalogItem.create({
      data: {
        organizationId,
        locationId: location.id,
        name: 'Pass 5 vaccine fixture',
        manufacturer: 'Test Manufacturer',
        primaryType: 'VACCINE',
        status: 'ACTIVE',
        inventoryTracked: true,
        lotTracking: true,
        expirationTracking: true,
        conversions: {
          create: { purchaseUnit: 'tray', stockUnit: 'dose', purchaseToStock: 10 },
        },
      },
    });
    itemId = item.id;
    const lot = await prisma.inventoryLot.create({
      data: {
        organizationId,
        itemId,
        stockLocationId,
        lotNumber: 'VAX-TRACE-1',
        expirationDate: new Date('2028-01-01'),
        receivedDate: new Date('2026-01-01'),
        quantity: 5,
      },
    });
    lotId = lot.id;
    await prisma.stockBalance.create({
      data: {
        organizationId,
        itemId,
        stockLocationId,
        lotId,
        onHand: 5,
      },
    });
    user = {
      id: actor.id,
      email: actor.email,
      name: 'Usage Manager',
      organizationId,
      locationId: location.id,
      role: actor.role,
      canManageAdminSettings: false,
      canFinalizeRecordsForOthers: false,
    };
    const mapping = await service.createMapping(user, {
      sourceType: 'VACCINE',
      sourceReference: 'DAPP administration',
      organizationWide: false,
      reservationBehavior: 'WHEN_PREPARED',
      deductionEvent: 'VACCINE_ADMINISTERED',
      lotSelectionPolicy: 'FEFO',
      activate: true,
      components: [
        {
          itemId,
          quantityRule: 'FIXED',
          fixedQuantity: '1',
          quantityUnit: 'dose',
          optional: false,
          staffConfirmationRequired: false,
          lotSelectionRequired: true,
          fallbackBehavior: 'NONE',
          wasteAllowance: '0',
          physicalKit: false,
          deductComponents: true,
          sequence: 0,
        },
      ],
    });
    mappingId = mapping.id;
  });

  afterAll(async () => {
    await prisma.inventoryUsageExportAudit.deleteMany({ where: { organizationId } });
    await prisma.patientInventoryTrace.deleteMany({ where: { organizationId } });
    await prisma.inventoryUsageEventLine.deleteMany({
      where: { usageEvent: { organizationId } },
    });
    await prisma.inventoryUsageEvent.deleteMany({ where: { organizationId } });
    await prisma.inventoryReservation.deleteMany({ where: { organizationId } });
    await prisma.inventoryUsageComponent.deleteMany({
      where: { mapping: { organizationId } },
    });
    await prisma.inventoryUsageMapping.deleteMany({ where: { organizationId } });
    await prisma.inventoryTransaction.deleteMany({ where: { organizationId } });
    await prisma.stockBalance.deleteMany({ where: { organizationId } });
    await prisma.inventoryLot.deleteMany({ where: { organizationId } });
    await prisma.itemUnitConversion.deleteMany({ where: { item: { organizationId } } });
    await prisma.catalogItem.deleteMany({ where: { organizationId } });
    await prisma.stockLocation.deleteMany({ where: { organizationId } });
    await prisma.patient.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.location.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('reserves, consumes once, traces the lot, and reverses only with confirmed restock', async () => {
    const reservation = await service.createReservation(user, {
      itemId,
      lotId,
      stockLocationId,
      sourceEventType: 'VACCINE_ADMINISTERED',
      sourceEventId: 'vaccine-record-1',
      patientId,
      quantity: '1',
      baseUnit: 'dose',
      allowPartial: false,
      idempotencyKey: `reserve-${crypto.randomUUID()}`,
    });
    const balanceAfterReservation = await prisma.stockBalance.findFirstOrThrow({
      where: { itemId, lotId },
    });
    expect(balanceAfterReservation.onHand.toString()).toBe('5');
    expect(balanceAfterReservation.reserved.toString()).toBe('1');

    const idempotencyKey = `usage-${crypto.randomUUID()}`;
    const input = {
      eventType: 'VACCINE_ADMINISTERED' as const,
      sourceRecordType: 'VaccineAdministration',
      sourceRecordId: 'vaccine-record-1',
      sourceEventVersion: 1,
      mappingId,
      patientId,
      occurredAt: new Date(),
      idempotencyKey,
      lines: [
        {
          itemId,
          lotId,
          reservationId: reservation.id,
          confirmedQuantity: '1',
          wastedQuantity: '0',
        },
      ],
    };
    const posted = await service.postUsage(user, input);
    const retry = await service.postUsage(user, input);
    expect(retry.id).toBe(posted.id);
    expect(posted.status).toBe('POSTED');
    expect(
      await prisma.inventoryTransaction.count({
        where: { organizationId, otherReference: 'VaccineAdministration:vaccine-record-1:v1' },
      }),
    ).toBe(1);
    const balanceAfterUsage = await prisma.stockBalance.findFirstOrThrow({
      where: { itemId, lotId },
    });
    expect(balanceAfterUsage.onHand.toString()).toBe('4');
    expect(balanceAfterUsage.reserved.toString()).toBe('0');
    const traces = await service.patientTrace(user, patientId);
    expect(traces).toHaveLength(1);
    expect(traces[0].lotNumberSnapshot).toBe('VAX-TRACE-1');

    await service.reverseUsage(user, posted.id, {
      sourceRecordId: 'vaccine-reversal-1',
      disposition: 'FINANCIAL_ONLY',
      reason: 'Correction without physical return',
      occurredAt: new Date(),
      idempotencyKey: `reverse-financial-${crypto.randomUUID()}`,
    });
    const finalBalance = await prisma.stockBalance.findFirstOrThrow({
      where: { itemId, lotId },
    });
    expect(finalBalance.onHand.toString()).toBe('4');
    expect(
      await prisma.patientInventoryTrace.findFirstOrThrow({
        where: { organizationId, patientId },
      }),
    ).toMatchObject({ reversedAt: expect.any(Date) });
  });

  it('creates a review event instead of guessing when no mapping exists', async () => {
    const event = await service.postUsage(user, {
      eventType: 'LAB_TEST_COMPLETED',
      sourceRecordType: 'LaboratoryRun',
      sourceRecordId: 'unmapped-lab-1',
      sourceEventVersion: 1,
      sourceType: 'LAB_TEST',
      sourceReference: 'Unknown analyzer test',
      occurredAt: new Date(),
      idempotencyKey: `unmapped-${crypto.randomUUID()}`,
      lines: [],
    });
    expect(event).toMatchObject({
      status: 'NEEDS_REVIEW',
      failureCode: 'NO_USAGE_MAPPING',
    });
  });
});
