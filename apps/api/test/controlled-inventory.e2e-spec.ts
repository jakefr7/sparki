import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@sparki/db';
import { ControlledService } from '../src/inventory/controlled.service';
import type { AuthenticatedUser } from '../src/auth/types';
describe('Controlled inventory ledger (e2e)', () => {
  const service = new ControlledService();
  let user: AuthenticatedUser,
    organizationId = '',
    registrationId = '',
    profileId = '',
    containerId = '',
    lotId = '',
    stockLocationId = '';
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: 'Controlled ledger test' } });
    organizationId = org.id;
    const location = await prisma.location.create({
      data: { organizationId, name: 'Registered clinic' },
    });
    const actor = await prisma.user.create({
      data: {
        organizationId,
        email: `controlled-${crypto.randomUUID()}@example.test`,
        firstName: 'Controlled',
        lastName: 'Receiver',
        role: 'PRACTICE_MANAGER',
      },
    });
    const stock = await prisma.stockLocation.create({
      data: { organizationId, clinicLocationId: location.id, name: 'Secure cabinet' },
    });
    stockLocationId = stock.id;
    const item = await prisma.catalogItem.create({
      data: {
        organizationId,
        locationId: location.id,
        name: 'Controlled fixture',
        primaryType: 'MEDICATION',
        inventoryTracked: true,
        controlledSubstance: true,
        deaSchedule: 'IV',
        lotTracking: true,
        conversions: { create: { purchaseUnit: 'vial', stockUnit: 'mL', purchaseToStock: 10 } },
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        organizationId,
        itemId: item.id,
        stockLocationId: stock.id,
        lotNumber: 'CTRL-TEST',
        quantity: 0,
      },
    });
    lotId = lot.id;
    const registration = await prisma.controlledRegistration.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        type: 'DEA',
        authority: 'Test authority',
        registrationNumber: `TEST-${crypto.randomUUID()}`,
        registrantName: 'Test Registrant',
        legalName: 'Test Clinic',
        registeredAddress: 'Test only',
        effectiveDate: new Date(),
        schedules: ['IV'],
        createdById: actor.id,
      },
    });
    registrationId = registration.id;
    await prisma.controlledAuthorization.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        registrationId,
        userId: actor.id,
        authorizationTypes: ['RECEIVER', 'CONTROLLED_CUSTODIAN'],
        effectiveDate: new Date(Date.now() - 1000),
        grantedById: actor.id,
      },
    });
    const profile = await prisma.controlledItemProfile.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        registrationId,
        itemId: item.id,
        federalSchedule: 'IV',
        dosageForm: 'injection',
        strength: '1 mg/mL',
        baseUnit: 'mL',
        containerTracking: true,
        secureStockLocationIds: [stock.id],
        createdById: actor.id,
      },
    });
    profileId = profile.id;
    const container = await prisma.controlledContainer.create({
      data: {
        organizationId,
        clinicLocationId: location.id,
        registrationId,
        profileId,
        lotId: lot.id,
        stockLocationId: stock.id,
        containerNumber: 'TEST-C-1',
        packageQuantity: 1,
        initialQuantity: 0,
        currentQuantity: 0,
      },
    });
    containerId = container.id;
    user = {
      id: actor.id,
      email: actor.email,
      name: 'Controlled Receiver',
      organizationId,
      locationId: location.id,
      role: actor.role,
      canManageAdminSettings: false,
      canFinalizeRecordsForOthers: false,
    };
  });
  afterAll(async () => {
    await prisma.controlledExternalReportEvent.deleteMany({
      where: { report: { organizationId } },
    });
    await prisma.controlledExternalReport.deleteMany({ where: { organizationId } });
    await prisma.controlledLedgerEntry.deleteMany({ where: { organizationId } });
    await prisma.controlledLedgerSequence.deleteMany({ where: { registrationId } });
    await prisma.controlledDiscrepancyCase.deleteMany({ where: { organizationId } });
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
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.location.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });
  it('atomically receives stock and returns the same immutable entry on browser retry', async () => {
    const idempotencyKey = `receive-${crypto.randomUUID()}`;
    const input = {
      idempotencyKey,
      registrationId,
      profileId,
      containerId,
      lotId,
      stockLocationId,
      eventType: 'RECEIVED' as const,
      quantity: '5',
      eventAt: new Date(),
      reason: 'Controlled receiving test',
      attestation: 'I confirm this controlled receipt is accurate.',
    };
    const first = await service.postEvent(user, input),
      retry = await service.postEvent(user, input);
    expect(retry.id).toBe(first.id);
    const entries = await prisma.controlledLedgerEntry.findMany({
      where: { organizationId, idempotencyKey },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].quantityAfter.toString()).toBe('5');
    const transaction = await prisma.inventoryTransaction.findUniqueOrThrow({
      where: { id: entries[0].inventoryTransactionId },
    });
    expect(transaction.transactionType).toBe('PURCHASE');
    expect(transaction.resultingBalance.toString()).toBe('5');
    const container = await prisma.controlledContainer.findUniqueOrThrow({
      where: { id: containerId },
    });
    expect(container.currentQuantity.toString()).toBe('5');
  });
});
