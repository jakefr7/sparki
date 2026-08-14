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
  let controlledItemId = '';
  let controlledMappingId = '';
  let controlledContainerId = '';
  let invalidControlledContainerId = '';
  let controlledRegistrationId = '';
  let visitId = '';

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

    const controlledItem = await prisma.catalogItem.create({
      data: {
        organizationId,
        locationId: location.id,
        name: 'Controlled usage fixture',
        manufacturer: 'Controlled Test Manufacturer',
        primaryType: 'MEDICATION',
        status: 'ACTIVE',
        inventoryTracked: true,
        controlledSubstance: true,
        deaSchedule: 'IV',
        lotTracking: true,
        expirationTracking: true,
        conversions: {
          create: { purchaseUnit: 'vial', stockUnit: 'mL', purchaseToStock: 10 },
        },
      },
    });
    controlledItemId = controlledItem.id;
    const controlledLot = await prisma.inventoryLot.create({
      data: {
        organizationId,
        itemId: controlledItem.id,
        stockLocationId,
        lotNumber: 'CTRL-USAGE-1',
        expirationDate: new Date('2029-02-03'),
        receivedDate: new Date('2026-01-01'),
        quantity: 5,
      },
    });
    await prisma.stockBalance.create({
      data: {
        organizationId,
        itemId: controlledItem.id,
        stockLocationId,
        lotId: controlledLot.id,
        onHand: 5,
      },
    });
    const registration = await prisma.controlledRegistration.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        type: 'DEA',
        authority: 'Test authority',
        registrationNumber: `USAGE-${crypto.randomUUID()}`,
        registrantName: 'Test Registrant',
        legalName: 'Test Clinic',
        registeredAddress: 'Test only',
        effectiveDate: new Date('2026-01-01'),
        schedules: ['IV'],
        createdById: actor.id,
      },
    });
    controlledRegistrationId = registration.id;
    await prisma.controlledAuthorization.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        registrationId: registration.id,
        userId: actor.id,
        authorizationTypes: ['ADMINISTRATOR', 'AUTHORIZED_PRESCRIBER'],
        effectiveDate: new Date('2026-01-01'),
        grantedById: actor.id,
      },
    });
    const profile = await prisma.controlledItemProfile.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        registrationId: registration.id,
        itemId: controlledItem.id,
        federalSchedule: 'IV',
        dosageForm: 'injection',
        strength: '1 mg/mL',
        baseUnit: 'mL',
        containerTracking: true,
        secureStockLocationIds: [stockLocationId],
        createdById: actor.id,
      },
    });
    const controlledContainer = await prisma.controlledContainer.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        registrationId: registration.id,
        profileId: profile.id,
        lotId: controlledLot.id,
        stockLocationId,
        containerNumber: 'USAGE-C-1',
        packageQuantity: 1,
        initialQuantity: 5,
        currentQuantity: 5,
      },
    });
    controlledContainerId = controlledContainer.id;
    const otherLocation = await prisma.location.create({
      data: { organizationId, name: 'Other usage clinic' },
    });
    const otherStockLocation = await prisma.stockLocation.create({
      data: { organizationId, clinicLocationId: otherLocation.id, name: 'Other secure cabinet' },
    });
    const outOfScopeLot = await prisma.inventoryLot.create({
      data: {
        organizationId,
        itemId: controlledItem.id,
        stockLocationId: otherStockLocation.id,
        lotNumber: 'CTRL-OTHER-LOCATION',
        quantity: 5,
      },
    });
    const invalidContainer = await prisma.controlledContainer.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        registrationId: registration.id,
        profileId: profile.id,
        lotId: outOfScopeLot.id,
        stockLocationId,
        containerNumber: 'USAGE-C-INVALID-LOT',
        packageQuantity: 1,
        initialQuantity: 5,
        currentQuantity: 5,
      },
    });
    invalidControlledContainerId = invalidContainer.id;
    const visit = await prisma.visit.create({
      data: {
        organizationId,
        locationId: location.id,
        patientId,
        visitType: 'WalkIn',
        reason: 'Controlled usage test',
        state: 'Arrived',
        primaryVeterinarianId: actor.id,
      },
    });
    visitId = visit.id;
    const controlledMapping = await service.createMapping(user, {
      sourceType: 'MEDICATION',
      sourceReference: 'Controlled administration',
      organizationWide: false,
      reservationBehavior: 'OFF',
      deductionEvent: 'MEDICATION_ADMINISTERED',
      lotSelectionPolicy: 'MANUAL',
      activate: true,
      components: [
        {
          itemId: controlledItem.id,
          quantityRule: 'FIXED',
          fixedQuantity: '1',
          quantityUnit: 'mL',
          optional: false,
          staffConfirmationRequired: true,
          lotSelectionRequired: true,
          fallbackBehavior: 'NONE',
          wasteAllowance: '0',
          physicalKit: false,
          deductComponents: true,
          sequence: 0,
        },
      ],
    });
    controlledMappingId = controlledMapping.id;
  });

  afterAll(async () => {
    await prisma.inventoryUsageExportAudit.deleteMany({ where: { organizationId } });
    await prisma.patientInventoryTrace.deleteMany({ where: { organizationId } });
    await prisma.inventoryUsageEventLine.deleteMany({
      where: { usageEvent: { organizationId } },
    });
    await prisma.inventoryUsageEvent.deleteMany({ where: { organizationId } });
    await prisma.visit.deleteMany({ where: { organizationId } });
    await prisma.inventoryReservation.deleteMany({ where: { organizationId } });
    await prisma.inventoryUsageComponent.deleteMany({
      where: { mapping: { organizationId } },
    });
    await prisma.inventoryUsageMapping.deleteMany({ where: { organizationId } });
    await prisma.controlledLedgerEntry.deleteMany({ where: { organizationId } });
    await prisma.controlledLedgerSequence.deleteMany({
      where: { registrationId: controlledRegistrationId },
    });
    await prisma.controlledContainer.deleteMany({ where: { organizationId } });
    await prisma.controlledItemProfile.deleteMany({ where: { organizationId } });
    await prisma.controlledAuthorization.deleteMany({ where: { organizationId } });
    await prisma.controlledRegistration.deleteMany({ where: { organizationId } });
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

  it('posts controlled usage with lot snapshots and rejects an out-of-location container lot without writes', async () => {
    const posted = await service.postUsage(user, {
      eventType: 'MEDICATION_ADMINISTERED',
      sourceRecordType: 'MedicationAdministration',
      sourceRecordId: 'controlled-administration-1',
      sourceEventVersion: 1,
      mappingId: controlledMappingId,
      patientId,
      visitId,
      authorizingVeterinarianId: user.id,
      occurredAt: new Date('2026-08-13T12:00:00.000Z'),
      idempotencyKey: `controlled-usage-${crypto.randomUUID()}`,
      lines: [
        {
          itemId: controlledItemId,
          controlledContainerId,
          confirmedQuantity: '1',
          wastedQuantity: '0',
        },
      ],
    });

    const trace = await prisma.patientInventoryTrace.findFirstOrThrow({
      where: { usageEventId: posted.id, itemId: controlledItemId },
    });
    expect(trace.lotNumberSnapshot).toBe('CTRL-USAGE-1');
    expect(trace.expirationSnapshot?.toISOString().slice(0, 10)).toBe('2029-02-03');

    const countsBefore = {
      usageEvents: await prisma.inventoryUsageEvent.count({ where: { organizationId } }),
      ledgerEntries: await prisma.controlledLedgerEntry.count({ where: { organizationId } }),
      transactions: await prisma.inventoryTransaction.count({ where: { organizationId } }),
      traces: await prisma.patientInventoryTrace.count({ where: { organizationId } }),
    };
    await expect(
      service.postUsage(user, {
        eventType: 'MEDICATION_ADMINISTERED',
        sourceRecordType: 'MedicationAdministration',
        sourceRecordId: 'controlled-administration-invalid-lot',
        sourceEventVersion: 1,
        mappingId: controlledMappingId,
        patientId,
        visitId,
        authorizingVeterinarianId: user.id,
        occurredAt: new Date('2026-08-13T12:05:00.000Z'),
        idempotencyKey: `controlled-usage-invalid-${crypto.randomUUID()}`,
        lines: [
          {
            itemId: controlledItemId,
            controlledContainerId: invalidControlledContainerId,
            confirmedQuantity: '1',
            wastedQuantity: '0',
          },
        ],
      }),
    ).rejects.toThrow('Controlled container lot is unavailable');
    expect({
      usageEvents: await prisma.inventoryUsageEvent.count({ where: { organizationId } }),
      ledgerEntries: await prisma.controlledLedgerEntry.count({ where: { organizationId } }),
      transactions: await prisma.inventoryTransaction.count({ where: { organizationId } }),
      traces: await prisma.patientInventoryTrace.count({ where: { organizationId } }),
    }).toEqual(countsBefore);
  });
});
