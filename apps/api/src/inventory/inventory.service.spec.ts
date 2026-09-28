import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma, prisma } from '@sparki/db';
import { adjustmentAmounts, availableQuantity, InventoryService } from './inventory.service';
import { adjustmentSchema, itemSchema } from './dto/inventory.schema';

describe('inventory decimal and ledger rules', () => {
  afterEach(() => vi.restoreAllMocks());
  it('keeps unit conversion factors as decimal strings', () => {
    const parsed = itemSchema.parse({
      name: 'Tablets',
      primaryType: 'MEDICATION',
      conversion: { purchaseUnit: 'box', stockUnit: 'tablet', purchaseToStock: '100.00000000' },
    });
    expect(parsed.conversion?.purchaseToStock).toBe('100.00000000');
  });
  it('computes available without making it editable', () => {
    expect(
      availableQuantity({
        onHand: new Prisma.Decimal('10.5'),
        quarantined: new Prisma.Decimal('2'),
        expired: new Prisma.Decimal('.5'),
        reserved: new Prisma.Decimal('1'),
      }).toString(),
    ).toBe('7');
  });
  it('computes delta and counted ledger snapshots exactly', () => {
    const counted = adjustmentAmounts(
      new Prisma.Decimal('7.25'),
      new Prisma.Decimal('9.10'),
      'COUNTED',
    );
    expect(counted.delta.toString()).toBe('1.85');
    expect(counted.resulting.toString()).toBe('9.1');
  });
  it('rejects floating point numbers at the API boundary', () => {
    expect(() =>
      adjustmentSchema.parse({
        itemId: crypto.randomUUID(),
        stockLocationId: crypto.randomUUID(),
        quantity: 0.1,
        reason: 'CORRECTION',
      }),
    ).toThrow();
  });
  it('requires a structured adjustment reason', () => {
    expect(() =>
      adjustmentSchema.parse({
        itemId: crypto.randomUUID(),
        stockLocationId: crypto.randomUUID(),
        quantity: '1',
        reason: 'correction',
      }),
    ).toThrow();
  });
  it('requires notes for OTHER', () => {
    expect(() =>
      adjustmentSchema.parse({
        itemId: crypto.randomUUID(),
        stockLocationId: crypto.randomUUID(),
        quantity: '1',
        reason: 'OTHER',
      }),
    ).toThrow(/Notes are required/);
  });
  it('retains location isolation during search and strips received cost', async () => {
    vi.spyOn(prisma.controlledAuthorization, 'count').mockResolvedValue(0);
    const findMany = vi.spyOn(prisma.catalogItem, 'findMany').mockResolvedValue([
      {
        id: crypto.randomUUID(),
        organizationId: 'org',
        locationId: 'loc',
        name: 'Needle',
        status: 'ACTIVE',
        inventoryTracked: true,
        reorderPoint: null,
        balances: [],
        transactions: [],
        barcodes: [],
        conversions: [],
        documents: [],
        lots: [
          {
            id: crypto.randomUUID(),
            quantity: new Prisma.Decimal(1),
            status: 'AVAILABLE',
            lotNumber: 'A',
            expirationDate: null,
            receivedUnitCost: new Prisma.Decimal('4.25'),
            stockLocation: { name: 'Shelf' },
          },
        ],
      },
    ] as never);
    const result = await new InventoryService().list(
      {
        id: 'user',
        email: 'tech@example.test',
        name: 'Tech',
        organizationId: 'org',
        locationId: 'loc',
        role: 'TECHNICIAN',
        subscriptionStatus: 'ACTIVE',
        canManageAdminSettings: false,
        canFinalizeRecordsForOthers: false,
      },
      { search: 'needle' },
    );
    const where = findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ organizationId: 'org' });
    const clauses = Array.isArray(where?.AND) ? where.AND : [];
    expect(clauses[0]).toEqual({ OR: [{ locationId: null }, { locationId: 'loc' }] });
    expect(result[0]?.lots[0]).not.toHaveProperty('receivedUnitCost');
  });
});
