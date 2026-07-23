import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@sparki/db';
import { InventoryService } from '../src/inventory/inventory.service';
import type { AuthenticatedUser } from '../src/auth/types';

describe('Inventory concurrency (e2e)', () => {
  const service = new InventoryService();
  let user: AuthenticatedUser;
  let organizationId: string;
  let itemId: string;
  let stockLocationId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({ data: { name: 'Inventory concurrency test' } });
    organizationId = organization.id;
    const location = await prisma.location.create({ data: { organizationId, name: 'Concurrency clinic' } });
    const actor = await prisma.user.create({ data: { organizationId, email: `inventory-${crypto.randomUUID()}@example.test`, firstName: 'Inventory', lastName: 'Tester', role: 'PRACTICE_MANAGER' } });
    const stockLocation = await prisma.stockLocation.create({ data: { organizationId, clinicLocationId: location.id, name: 'Pharmacy' } });
    const item = await prisma.catalogItem.create({ data: { organizationId, locationId: location.id, name: 'Concurrent adjustment fixture', primaryType: 'SUPPLY', inventoryTracked: true } });
    itemId = item.id; stockLocationId = stockLocation.id;
    user = { id: actor.id, email: actor.email, name: 'Inventory Tester', organizationId, locationId: location.id, role: actor.role, canManageAdminSettings: false, canFinalizeRecordsForOthers: false };
  });

  afterAll(async () => {
    await prisma.inventoryTransaction.deleteMany({ where: { organizationId } });
    await prisma.stockBalance.deleteMany({ where: { organizationId } });
    await prisma.catalogItem.deleteMany({ where: { organizationId } });
    await prisma.stockLocation.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.location.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  it('serializes two simultaneous postings with coherent snapshots', async () => {
    await Promise.all([
      service.adjust(user, { itemId, stockLocationId, mode: 'DELTA', quantity: '1.000000', reason: 'CORRECTION' }),
      service.adjust(user, { itemId, stockLocationId, mode: 'DELTA', quantity: '1.000000', reason: 'CORRECTION' }),
    ]);
    const transactions = await prisma.inventoryTransaction.findMany({ where: { itemId }, orderBy: { previousBalance: 'asc' } });
    expect(transactions.map((entry) => [entry.previousBalance.toString(), entry.resultingBalance.toString()])).toEqual([['0', '1'], ['1', '2']]);
    const balance = await prisma.stockBalance.findFirstOrThrow({ where: { itemId } });
    expect(balance.onHand.toString()).toBe('2');
  });
});
