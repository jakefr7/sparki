import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@sparki/db';
import { CountsService } from '../src/inventory/counts.service';
import type { AuthenticatedUser } from '../src/auth/types';

describe('Inventory count lifecycle (e2e)', () => {
  const service = new CountsService();
  let user: AuthenticatedUser,
    organizationId = '',
    itemId = '',
    stockLocationId = '',
    sessionId = '';
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Inventory count test' },
    });
    organizationId = organization.id;
    const location = await prisma.location.create({
      data: { organizationId, name: 'Count clinic' },
    });
    const actor = await prisma.user.create({
      data: {
        organizationId,
        email: `counts-${crypto.randomUUID()}@example.test`,
        firstName: 'Count',
        lastName: 'Manager',
        role: 'PRACTICE_MANAGER',
      },
    });
    const stock = await prisma.stockLocation.create({
      data: { organizationId, clinicLocationId: location.id, name: 'Pharmacy' },
    });
    stockLocationId = stock.id;
    const item = await prisma.catalogItem.create({
      data: {
        organizationId,
        locationId: location.id,
        name: 'Count fixture',
        primaryType: 'SUPPLY',
        inventoryTracked: true,
        conversions: { create: { purchaseUnit: 'box', stockUnit: 'each', purchaseToStock: 1 } },
      },
    });
    itemId = item.id;
    await prisma.stockBalance.create({
      data: { organizationId, itemId, stockLocationId, onHand: 10 },
    });
    user = {
      id: actor.id,
      email: actor.email,
      name: 'Count Manager',
      organizationId,
      locationId: location.id,
      role: actor.role,
      canManageAdminSettings: false,
      canFinalizeRecordsForOthers: false,
    };
  });
  afterAll(async () => {
    await prisma.inventoryCountEvent.deleteMany({ where: { organizationId } });
    await prisma.inventoryCountEntry.deleteMany({
      where: { line: { session: { organizationId } } },
    });
    await prisma.inventoryCountLine.deleteMany({ where: { session: { organizationId } } });
    await prisma.inventoryCountAssignment.deleteMany({ where: { session: { organizationId } } });
    await prisma.inventoryCountSession.deleteMany({ where: { organizationId } });
    await prisma.inventoryCountSequence.deleteMany({ where: { organizationId } });
    await prisma.inventoryTransaction.deleteMany({ where: { organizationId } });
    await prisma.stockBalance.deleteMany({ where: { organizationId } });
    await prisma.itemUnitConversion.deleteMany({ where: { item: { organizationId } } });
    await prisma.catalogItem.deleteMany({ where: { organizationId } });
    await prisma.stockLocation.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.location.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });
  it('protects a blind snapshot and posts one immutable ledger adjustment', async () => {
    const created = await service.create(user, {
      countType: 'LOCATION',
      configuration: {
        stockLocationIds: [stockLocationId],
        itemIds: [itemId],
        itemTypes: [],
        routes: [],
        therapeuticClasses: [],
        tags: [],
        lotIds: [],
        includeDescendants: true,
        includeZeroBalance: false,
        includeQuarantined: false,
      },
      blindCount: true,
      requireAllLines: true,
      requireRecount: true,
      varianceQuantityThreshold: '100',
      variancePercentThreshold: '100',
      startImmediately: true,
    });
    sessionId = created.id;
    const active = await service.get(user, sessionId);
    expect(active.lines).toHaveLength(1);
    expect(active.lines[0]).not.toHaveProperty('expectedQuantitySnapshot');
    await service.enter(user, sessionId, active.lines[0].id, {
      quantity: '8',
      method: 'BARCODE_SCAN',
    });
    await service.submit(user, sessionId);
    const review = await service.get(user, sessionId);
    expect(review.lines[0].expectedQuantitySnapshot.toString()).toBe('10');
    await service.approve(user, sessionId);
    await service.post(user, sessionId, { idempotencyKey: `post-${crypto.randomUUID()}` });
    const duplicate = await service.post(user, sessionId, {
      idempotencyKey: (
        await prisma.inventoryCountSession.findUniqueOrThrow({ where: { id: sessionId } })
      ).postingIdempotencyKey!,
    });
    expect(duplicate.status).toBe('POSTED');
    const balance = await prisma.stockBalance.findFirstOrThrow({ where: { itemId } });
    expect(balance.onHand.toString()).toBe('8');
    const transactions = await prisma.inventoryTransaction.findMany({
      where: { countSessionId: sessionId },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].transactionType).toBe('INVENTORY_COUNT_ADJUSTMENT');
    expect(transactions[0].quantityDelta.toString()).toBe('-2');
  });
});
