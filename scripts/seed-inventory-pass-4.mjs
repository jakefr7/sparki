import { PrismaClient, Prisma } from '../packages/db/generated/client/index.js';
import { randomUUID } from 'node:crypto';
const db = new PrismaClient();
const D = (v) => new Prisma.Decimal(v);
async function main() {
  const location = await db.location.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!location) throw new Error('Seed clinic first.');
  const users = await db.user.findMany({
    where: { organizationId: location.organizationId, isActive: true },
  });
  const owner = users.find((u) => ['OWNER', 'PRACTICE_MANAGER'].includes(u.role)) ?? users[0];
  if (!owner) throw new Error('Seed users first.');
  let cabinet = await db.stockLocation.findFirst({
    where: { clinicLocationId: location.id, name: 'Controlled Cabinet' },
  });
  cabinet ??= await db.stockLocation.create({
    data: {
      organizationId: location.organizationId,
      clinicLocationId: location.id,
      name: 'Controlled Cabinet',
    },
  });
  const registration = await db.controlledRegistration.upsert({
    where: {
      organizationId_clinicLocationId_type_registrationNumber: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        type: 'DEA',
        registrationNumber: 'DEMO-TN-0001',
      },
    },
    create: {
      organizationId: location.organizationId,
      clinicLocationId: location.id,
      type: 'DEA',
      authority: 'Drug Enforcement Administration',
      registrationNumber: 'DEMO-TN-0001',
      registrantUserId: owner.id,
      registrantName: `${owner.firstName} ${owner.lastName}`,
      legalName: 'Sparki Demo Animal Hospital',
      registeredAddress: 'Development fixture — not a real registration',
      effectiveDate: new Date('2026-01-01'),
      schedules: ['II', 'III', 'IV', 'V'],
      jurisdiction: 'TN',
      policy: { preset: 'TN_DEVELOPMENT', disclaimer: 'Workflow defaults only; not legal advice.' },
      createdById: owner.id,
    },
    update: { isActive: true },
  });
  for (const user of users.filter((u) => u.role !== 'CLIENT')) {
    const types =
      user.id === owner.id
        ? [
            'REGISTRANT',
            'CONTROLLED_CUSTODIAN',
            'RECEIVER',
            'ADMINISTRATOR',
            'DISPENSER',
            'COUNTER',
            'WITNESS',
            'RECONCILIATION_REVIEWER',
            'DISCREPANCY_INVESTIGATOR',
            'DISPOSAL_APPROVER',
            'REPORTING_MANAGER',
            'AUTHORIZED_PRESCRIBER',
          ]
        : user.role === 'VETERINARIAN'
          ? ['AUTHORIZED_PRESCRIBER', 'ADMINISTRATOR', 'DISPENSER', 'COUNTER', 'WITNESS']
          : ['COUNTER', 'WITNESS'];
    const found = await db.controlledAuthorization.findFirst({
      where: { registrationId: registration.id, userId: user.id, status: 'ACTIVE' },
    });
    if (!found)
      await db.controlledAuthorization.create({
        data: {
          organizationId: location.organizationId,
          clinicLocationId: location.id,
          registrationId: registration.id,
          userId: user.id,
          authorizationTypes: types,
          effectiveDate: new Date('2026-01-01'),
          grantedById: owner.id,
          notes: 'Development authorization fixture',
        },
      });
  }
  const fixtures = [
    ['Butorphanol 10 mg/mL injection', 'BUT-10', 'IV', '10 mg/mL', '10'],
    ['Buprenorphine 0.3 mg/mL injection', 'BUP-03', 'III', '0.3 mg/mL', '5'],
    ['Hydromorphone 2 mg/mL injection', 'HYD-2', 'II', '2 mg/mL', '10'],
    ['Ketamine 100 mg/mL injection', 'KET-100', 'III', '100 mg/mL', '20'],
    ['Midazolam 5 mg/mL injection', 'MID-5', 'IV', '5 mg/mL', '10'],
    ['Phenobarbital 60 mg tablets', 'PHENO-60', 'IV', '60 mg', '100'],
  ];
  for (const [name, sku, schedule, strength, qty] of fixtures) {
    let item = await db.catalogItem.findFirst({
      where: {
        organizationId: location.organizationId,
        sourceSystem: 'sparki-controlled-demo',
        sourceId: sku,
      },
    });
    item ??= await db.catalogItem.create({
      data: {
        organizationId: location.organizationId,
        locationId: location.id,
        name,
        sku,
        primaryType: 'MEDICATION',
        inventoryTracked: true,
        controlledSubstance: true,
        deaSchedule: schedule,
        lotTracking: true,
        expirationTracking: true,
        sourceSystem: 'sparki-controlled-demo',
        sourceId: sku,
        conversions: {
          create: {
            purchaseUnit: 'container',
            stockUnit: sku === 'PHENO-60' ? 'tablet' : 'mL',
            purchaseToStock: D(qty),
          },
        },
      },
    });
    const existingProfile = await db.controlledItemProfile.findFirst({
      where: { registrationId: registration.id, itemId: item.id, isActive: true },
    });
    const profile =
      existingProfile ??
      (await db.controlledItemProfile.create({
        data: {
          organizationId: location.organizationId,
          clinicLocationId: location.id,
          registrationId: registration.id,
          itemId: item.id,
          federalSchedule: schedule,
          stateSchedule: schedule,
          dosageForm: sku === 'PHENO-60' ? 'tablet' : 'injection',
          strength,
          baseUnit: sku === 'PHENO-60' ? 'tablet' : 'mL',
          containerTracking: true,
          exactCountRequired: true,
          openContainerTracking: true,
          secureStockLocationIds: [cabinet.id],
          discrepancyThreshold: D('0.001'),
          witnessRules: { waste: true, disposal: true },
          countFrequencyDays: 30,
          reportingConfiguration: {
            enabled: sku === 'PHENO-60',
            jurisdiction: 'TN',
            authority: 'Tennessee CSMD',
            dueDays: 1,
            label: 'Reporting preparation and status tracking',
          },
          createdById: owner.id,
        },
      }));
    let lot = await db.inventoryLot.findFirst({
      where: { itemId: item.id, stockLocationId: cabinet.id, lotNumber: `DEMO-${sku}` },
    });
    lot ??= await db.inventoryLot.create({
      data: {
        organizationId: location.organizationId,
        itemId: item.id,
        stockLocationId: cabinet.id,
        lotNumber: `DEMO-${sku}`,
        expirationDate: new Date('2027-12-31'),
        receivedDate: new Date(),
        quantity: D(qty),
      },
    });
    let container = await db.controlledContainer.findFirst({
      where: { registrationId: registration.id, containerNumber: `CC-${sku}-001` },
    });
    container ??= await db.controlledContainer.create({
      data: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        registrationId: registration.id,
        profileId: profile.id,
        lotId: lot.id,
        stockLocationId: cabinet.id,
        containerNumber: `CC-${sku}-001`,
        packageQuantity: 1,
        initialQuantity: D(qty),
        currentQuantity: D(qty),
        status: sku === 'BUT-10' ? 'OPEN' : 'SEALED',
        openedById: sku === 'BUT-10' ? owner.id : null,
        openedAt: sku === 'BUT-10' ? new Date() : null,
      },
    });
    await db.stockBalance.upsert({
      where: {
        itemId_stockLocationId_lotId: {
          itemId: item.id,
          stockLocationId: cabinet.id,
          lotId: lot.id,
        },
      },
      create: {
        organizationId: location.organizationId,
        itemId: item.id,
        stockLocationId: cabinet.id,
        lotId: lot.id,
        onHand: D(qty),
      },
      update: {},
    });
    const idem = `fixture-initial-${sku}`;
    if (
      !(await db.controlledLedgerEntry.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: location.organizationId,
            idempotencyKey: idem,
          },
        },
      }))
    ) {
      const group = randomUUID();
      const tr = await db.inventoryTransaction.create({
        data: {
          organizationId: location.organizationId,
          clinicLocationId: location.id,
          itemId: item.id,
          lotId: lot.id,
          stockLocationId: cabinet.id,
          transactionGroupId: group,
          transactionType: 'OPENING_BALANCE',
          quantityDelta: D(qty),
          previousBalance: 0,
          resultingBalance: D(qty),
          reason: 'CONTROLLED_INITIAL_BALANCE',
          otherReference: idem,
          userId: owner.id,
        },
      });
      await db.controlledLedgerEntry.create({
        data: {
          organizationId: location.organizationId,
          clinicLocationId: location.id,
          registrationId: registration.id,
          profileId: profile.id,
          itemId: item.id,
          lotId: lot.id,
          containerId: container.id,
          inventoryTransactionId: tr.id,
          transactionGroupId: group,
          entryNumber: `CL-2026-FIX-${sku}`,
          idempotencyKey: idem,
          eventType: 'INITIAL_BALANCE',
          eventAt: new Date(),
          quantityBefore: 0,
          quantityChanged: D(qty),
          quantityAfter: D(qty),
          baseUnitSnapshot: profile.baseUnit,
          dosageFormSnapshot: profile.dosageForm,
          strengthSnapshot: profile.strength,
          scheduleSnapshot: schedule,
          reason: 'Development opening balance',
          performedById: owner.id,
          attestation: { text: 'I confirm this development fixture.', version: 'controlled-v1' },
        },
      });
    }
  }
  const first = await db.controlledItemProfile.findFirstOrThrow({
    where: { registrationId: registration.id },
  });
  if (
    !(await db.controlledDiscrepancyCase.findFirst({
      where: { organizationId: location.organizationId, caseNumber: 'CD-2026-90001' },
    }))
  )
    await db.controlledDiscrepancyCase.create({
      data: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        registrationId: registration.id,
        profileId: first.id,
        itemId: first.itemId,
        caseNumber: 'CD-2026-90001',
        detectedById: owner.id,
        severity: 'MEDIUM',
        classification: 'UNKNOWN',
        status: 'OPEN',
        investigationNotes:
          'Unexplained development variance. Do not classify as theft without investigation.',
      },
    });
  if (
    !(await db.controlledExternalReport.findFirst({
      where: { registrationId: registration.id, type: 'STATE_DISPENSING' },
    }))
  )
    await db.controlledExternalReport.create({
      data: {
        organizationId: location.organizationId,
        clinicLocationId: location.id,
        registrationId: registration.id,
        type: 'STATE_DISPENSING',
        status: 'ACTION_REQUIRED',
        jurisdiction: 'TN',
        authority: 'Tennessee CSMD',
        sourceRecords: { fixture: true },
        dueAt: new Date(Date.now() + 86400000),
        notes: 'Reporting preparation and status tracking. External filing not yet confirmed.',
      },
    });
  console.log('Inventory Pass 4 controlled fixtures ready. Compliance-supporting demo data only.');
}
main().finally(() => db.$disconnect());
