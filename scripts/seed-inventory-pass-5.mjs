import { PrismaClient, Prisma } from '../packages/db/generated/client/index.js';

const db = new PrismaClient();
const D = (value) => new Prisma.Decimal(value);

const fixtures = [
  ['Carprofen', 'MEDICATION', 'PRESCRIPTION_DISPENSED', 'PER_UNIT', '1'],
  ['Gabapentin', 'MEDICATION', 'PRESCRIPTION_DISPENSED', 'PER_UNIT', '1'],
  ['Convenia', 'MEDICATION', 'MEDICATION_ADMINISTERED', 'USER_CONFIRMED', null],
  ['Cytopoint', 'MEDICATION', 'MEDICATION_ADMINISTERED', 'PER_DOSE', '1'],
  ['Nobivac DAPP', 'VACCINE', 'VACCINE_ADMINISTERED', 'FIXED', '1'],
  ['PureVax Feline Rabies', 'VACCINE', 'VACCINE_ADMINISTERED', 'FIXED', '1'],
  ['SNAP 4Dx', 'LAB_TEST', 'LAB_TEST_COMPLETED', 'FIXED', '1'],
  ['IV fluid', 'TREATMENT', 'TREATMENT_COMPLETED', 'USER_CONFIRMED', null],
  ['dental', 'PROCEDURE', 'PROCEDURE_COMPLETED', 'FIXED', '1'],
  ['surgery', 'SURGERY', 'SURGERY_COMPLETED', 'FIXED', '1'],
  ["Hill's Prescription Diet", 'RETAIL_SALE', 'RETAIL_SALE_FINALIZED', 'PER_UNIT', '1'],
];

async function main() {
  const location = await db.location.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!location) throw new Error('Seed clinic data first.');
  const manager = await db.user.findFirst({
    where: {
      organizationId: location.organizationId,
      role: { in: ['OWNER', 'PRACTICE_MANAGER'] },
    },
  });
  if (!manager) throw new Error('Seed an inventory manager first.');
  const items = await db.catalogItem.findMany({
    where: {
      organizationId: location.organizationId,
      inventoryTracked: true,
      status: 'ACTIVE',
    },
    include: { conversions: { where: { isActive: true }, take: 1 }, balances: true },
  });
  for (const [needle, sourceType, deductionEvent, quantityRule, quantity] of fixtures) {
    const item = items.find((candidate) =>
      candidate.name.toLowerCase().includes(needle.toLowerCase()),
    );
    if (!item) continue;
    if (!item.conversions[0]) {
      const stockUnit = /tablet/i.test(item.name)
        ? 'tablet'
        : /capsule/i.test(item.name)
          ? 'capsule'
          : /vaccine|nobivac|purevax/i.test(item.name)
            ? 'dose'
            : /injection|convenia|fluid/i.test(item.name)
              ? 'mL'
              : 'unit';
      item.conversions[0] = await db.itemUnitConversion.create({
        data: {
          itemId: item.id,
          purchaseUnit: stockUnit,
          stockUnit,
          purchaseToStock: D(1),
        },
      });
    }
    const sourceReference = `${needle} fixture`;
    const existing = await db.inventoryUsageMapping.findFirst({
      where: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        sourceType,
        sourceReference,
        version: 1,
      },
    });
    if (!existing)
      await db.inventoryUsageMapping.create({
        data: {
          organizationId: location.organizationId,
          clinicLocationId: location.id,
          sourceType,
          sourceReference,
          sourceCatalogItemId: item.id,
          version: 1,
          isActive: true,
          reservationBehavior:
            sourceType === 'RETAIL_SALE'
              ? 'WHEN_APPROVED'
              : ['MEDICATION', 'VACCINE'].includes(sourceType)
                ? 'WHEN_PREPARED'
                : 'OFF',
          deductionEvent,
          lotSelectionPolicy:
            item.expirationTracking || item.lotTracking ? 'FEFO' : 'LOCATION_PRIORITY',
          createdById: manager.id,
          updatedById: manager.id,
          notes: 'Persistent Inventory Pass 5 fixture',
          components: {
            create: {
              itemId: item.id,
              quantityRule,
              fixedQuantity: quantity ? D(quantity) : null,
              doseMultiplier: quantityRule === 'PER_DOSE' ? D(quantity ?? 1) : null,
              quantityUnit: item.conversions[0].stockUnit,
              staffConfirmationRequired: quantityRule === 'USER_CONFIRMED',
              lotSelectionRequired: item.lotTracking,
              wasteAllowance: D('0'),
            },
          },
        },
      });
  }
  const missingMappingKey = 'fixture-pass5-missing-mapping';
  await db.inventoryUsageEvent.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: location.organizationId,
        idempotencyKey: missingMappingKey,
      },
    },
    create: {
      organizationId: location.organizationId,
      clinicLocationId: location.id,
      eventType: 'LAB_TEST_COMPLETED',
      sourceRecordType: 'FixtureLabRun',
      sourceRecordId: 'fixture-unmapped-lab',
      sourceEventVersion: 1,
      status: 'NEEDS_REVIEW',
      failureCode: 'NO_USAGE_MAPPING',
      failureMessage: 'No active usage mapping exists',
      occurredAt: new Date(),
      idempotencyKey: missingMappingKey,
    },
    update: {},
  });
  const insufficientKey = 'fixture-pass5-insufficient-stock';
  await db.inventoryUsageEvent.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: location.organizationId,
        idempotencyKey: insufficientKey,
      },
    },
    create: {
      organizationId: location.organizationId,
      clinicLocationId: location.id,
      eventType: 'PROCEDURE_COMPLETED',
      sourceRecordType: 'FixtureProcedure',
      sourceRecordId: 'fixture-insufficient-procedure',
      sourceEventVersion: 1,
      status: 'NEEDS_REVIEW',
      failureCode: 'INSUFFICIENT_STOCK',
      failureMessage: 'Insufficient eligible stock for mapped component',
      occurredAt: new Date(),
      idempotencyKey: insufficientKey,
    },
    update: {},
  });
  const reservable = items.find(
    (item) =>
      !item.controlledSubstance &&
      item.balances.some((balance) =>
        balance.onHand
          .minus(balance.reserved)
          .minus(balance.quarantined)
          .minus(balance.expired)
          .gte(1),
      ),
  );
  const balance = reservable?.balances.find((candidate) =>
    candidate.onHand
      .minus(candidate.reserved)
      .minus(candidate.quarantined)
      .minus(candidate.expired)
      .gte(1),
  );
  if (reservable && balance) {
    const key = 'fixture-pass5-active-reservation';
    const existing = await db.inventoryReservation.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: location.organizationId,
          idempotencyKey: key,
        },
      },
    });
    if (!existing)
      await db.$transaction(async (tx) => {
        await tx.stockBalance.update({
          where: { id: balance.id },
          data: { reserved: { increment: D(1) } },
        });
        await tx.inventoryReservation.create({
          data: {
            organizationId: location.organizationId,
            clinicLocationId: location.id,
            itemId: reservable.id,
            lotId: balance.lotId,
            stockLocationId: balance.stockLocationId,
            sourceEventType: 'MEDICATION_ADMINISTERED',
            sourceEventId: 'fixture-active-visit',
            quantity: D(1),
            baseUnitSnapshot: reservable.conversions[0]?.stockUnit ?? 'unit',
            reservedById: manager.id,
            expiresAt: new Date(Date.now() + 12 * 3600000),
            idempotencyKey: key,
          },
        });
      });
  }
  console.log(
    'Inventory Pass 5 fixtures ready: usage mappings, review states, and reservation state.',
  );
}

main().finally(() => db.$disconnect());
