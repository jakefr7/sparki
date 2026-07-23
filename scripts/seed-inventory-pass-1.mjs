import { PrismaClient, Prisma } from '../packages/db/generated/client/index.js';
import { randomUUID } from 'node:crypto';
const db = new PrismaClient();
const refreshExpirations = process.argv.includes('--refresh-expirations');
const fixtures = [
  ['Carprofen 75 mg tablets', 'MEDICATION', 'CARP-75', '54.00', 18, 20],
  ['Gabapentin 100 mg capsules', 'MEDICATION', 'GABA-100', '32.00', 0, 15],
  ['Convenia injectable', 'MEDICATION', 'CONV-10', '118.00', 3, 2],
  ['Cytopoint 20 mg vial', 'MEDICATION', 'CYTO-20', '95.00', 4, 3],
  ['PureVax Feline Rabies vaccine', 'VACCINE', 'PURE-RAB', '31.00', 12, 8],
  ['Nobivac Canine DAPP vaccine', 'VACCINE', 'NOB-DAPP', '24.00', 10, 8],
  ['SNAP 4Dx Plus test', 'DIAGNOSTIC', 'SNAP-4DX', '49.00', 7, 5],
  ['Lactated Ringer’s 1 L bag', 'SUPPLY', 'LRS-1L', '18.00', 16, 10],
  ['22 gauge IV catheters', 'SUPPLY', 'IVC-22', '4.50', 22, 15],
  ['3 mL syringes', 'SUPPLY', 'SYR-3', '0.85', 90, 50],
  ['Hill’s Prescription Diet k/d', 'FOOD', 'HILLS-KD', '58.00', 6, 4],
  ['Elizabethan collars — assorted sizes', 'RETAIL', 'ECOLLAR-ASST', '18.00', 9, 6],
  ['Absorbable suture material', 'SUPPLY', 'SUT-ABS', '12.00', 14, 10],
  ['Chlorhexidine shampoo', 'RETAIL', 'CHX-SHAMP', '22.00', 2, 5],
];
async function main() {
  const location = await db.location.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!location) throw new Error('Seed clinic data first.');
  const user =
    (await db.user.findFirst({
      where: {
        organizationId: location.organizationId,
        role: { in: ['OWNER', 'PRACTICE_MANAGER'] },
      },
    })) ?? (await db.user.findFirst({ where: { organizationId: location.organizationId } }));
  if (!user) throw new Error('Seed clinic users first.');
  let pharmacy = await db.stockLocation.findFirst({
    where: { clinicLocationId: location.id, name: 'Pharmacy', parentId: null },
  });
  pharmacy ??= await db.stockLocation.create({
    data: {
      organizationId: location.organizationId,
      clinicLocationId: location.id,
      name: 'Pharmacy',
    },
  });
  let treatment = await db.stockLocation.findFirst({
    where: { clinicLocationId: location.id, name: 'Treatment Room', parentId: null },
  });
  treatment ??= await db.stockLocation.create({
    data: {
      organizationId: location.organizationId,
      clinicLocationId: location.id,
      name: 'Treatment Room',
    },
  });
  const cabinet =
    (await db.stockLocation.findFirst({ where: { parentId: pharmacy.id, name: 'Cabinet 2' } })) ??
    (await db.stockLocation.create({
      data: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        parentId: pharmacy.id,
        name: 'Cabinet 2',
      },
    }));
  const shelf =
    (await db.stockLocation.findFirst({ where: { parentId: cabinet.id, name: 'Shelf B' } })) ??
    (await db.stockLocation.create({
      data: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        parentId: cabinet.id,
        name: 'Shelf B',
      },
    }));
  const bin =
    (await db.stockLocation.findFirst({ where: { parentId: shelf.id, name: 'Bin 4' } })) ??
    (await db.stockLocation.create({
      data: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        parentId: shelf.id,
        name: 'Bin 4',
      },
    }));
  for (const [name, primaryType, sku, price, qty, reorder] of fixtures) {
    let item = await db.catalogItem.findFirst({
      where: {
        organizationId: location.organizationId,
        sourceSystem: 'sparki-demo',
        sourceId: sku,
      },
    });
    item ??= await db.catalogItem.create({
      data: {
        organizationId: location.organizationId,
        locationId: location.id,
        name,
        primaryType,
        sku,
        retailPrice: new Prisma.Decimal(price),
        billable: true,
        taxable: primaryType === 'RETAIL' || primaryType === 'FOOD',
        inventoryTracked: true,
        lotTracking: primaryType === 'MEDICATION' || primaryType === 'VACCINE',
        expirationTracking: primaryType === 'MEDICATION' || primaryType === 'VACCINE',
        reorderPoint: new Prisma.Decimal(reorder),
        sourceSystem: 'sparki-demo',
        sourceId: sku,
        createdById: user.id,
        updatedById: user.id,
      },
    });
    const hasHistory = await db.inventoryTransaction.count({ where: { itemId: item.id } });
    if (hasHistory) continue;
    const stockLocationId = primaryType === 'SUPPLY' ? treatment.id : bin.id;
    let lotId = null;
    if (item.lotTracking) {
      const days = sku === 'CARP-75' ? 30 : sku === 'PURE-RAB' ? 60 : 180;
      const lot = await db.inventoryLot.create({
        data: {
          organizationId: location.organizationId,
          itemId: item.id,
          stockLocationId,
          lotNumber: `${sku}-A`,
          expirationDate: new Date(Date.now() + days * 86400000),
          quantity: new Prisma.Decimal(qty),
        },
      });
      lotId = lot.id;
    }
    await db.stockBalance.create({
      data: {
        organizationId: location.organizationId,
        itemId: item.id,
        stockLocationId,
        lotId,
        onHand: new Prisma.Decimal(qty),
      },
    });
    await db.inventoryTransaction.create({
      data: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        itemId: item.id,
        lotId,
        stockLocationId,
        transactionGroupId: randomUUID(),
        transactionType: 'OPENING_BALANCE',
        quantityDelta: new Prisma.Decimal(qty),
        previousBalance: new Prisma.Decimal(0),
        resultingBalance: new Prisma.Decimal(qty),
        reason: 'OPENING_BALANCE',
        notes: 'Persistent Inventory Pass 1 development fixture',
        userId: user.id,
      },
    });
  }
  const carprofen = await db.catalogItem.findFirst({
    where: { organizationId: location.organizationId, sku: 'CARP-75' },
  });
  if (carprofen && (await db.inventoryLot.count({ where: { itemId: carprofen.id } })) < 3) {
    await db.inventoryLot.createMany({
      data: [
        {
          organizationId: location.organizationId,
          itemId: carprofen.id,
          stockLocationId: bin.id,
          lotNumber: 'CARP-75-EXPIRED',
          expirationDate: new Date(Date.now() - 10 * 86400000),
          status: 'EXPIRED',
          quantity: 2,
        },
        {
          organizationId: location.organizationId,
          itemId: carprofen.id,
          stockLocationId: bin.id,
          lotNumber: 'CARP-75-QUAR',
          expirationDate: new Date(Date.now() + 120 * 86400000),
          status: 'QUARANTINED',
          quantity: 4,
        },
      ],
    });
  }
  if (refreshExpirations) {
    await db.inventoryLot.updateMany({
      where: { organizationId: location.organizationId, lotNumber: 'CARP-75-A' },
      data: { expirationDate: new Date(Date.now() + 30 * 86400000) },
    });
    await db.inventoryLot.updateMany({
      where: { organizationId: location.organizationId, lotNumber: 'PURE-RAB-A' },
      data: { expirationDate: new Date(Date.now() + 60 * 86400000) },
    });
    await db.inventoryLot.updateMany({
      where: { organizationId: location.organizationId, lotNumber: 'CARP-75-EXPIRED' },
      data: { expirationDate: new Date(Date.now() - 10 * 86400000), status: 'EXPIRED' },
    });
    await db.inventoryLot.updateMany({
      where: { organizationId: location.organizationId, lotNumber: 'CARP-75-QUAR' },
      data: { expirationDate: new Date(Date.now() + 120 * 86400000), status: 'QUARANTINED' },
    });
  }
  console.log(`Inventory Pass 1 fixtures are ready for ${location.name}.`);
}
main().finally(() => db.$disconnect());
