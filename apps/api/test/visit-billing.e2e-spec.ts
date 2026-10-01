import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { prisma } from '@sparki/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DEV_LOCATION_ID, DEV_ORGANIZATION_ID, DEV_USER_ID } from '../src/auth/development-user.service';

const TEST_SOURCE_SYSTEM = 'sparki-visit-billing-e2e';

describe('Visit checkout billing (e2e)', () => {
  let app: INestApplication;
  let primaryClientId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Any authenticated request lazily seeds the dev identity under
    // DEV_ORGANIZATION_ID; do it here so fixtures below can reference it.
    await request(app.getHttpServer()).get(`/patients/${DEV_ORGANIZATION_ID}`);

    const client = await prisma.client.create({
      data: { organizationId: DEV_ORGANIZATION_ID, firstName: 'Billing', lastName: 'Owner', sourceSystem: TEST_SOURCE_SYSTEM },
    });
    primaryClientId = client.id;
  });

  afterAll(async () => {
    const testVisitIds = (await prisma.visit.findMany({
      where: { organizationId: DEV_ORGANIZATION_ID, patient: { sourceSystem: TEST_SOURCE_SYSTEM } },
      select: { id: true },
    })).map((visit) => visit.id);
    await prisma.payment.deleteMany({ where: { invoice: { visitId: { in: testVisitIds } } } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { visitId: { in: testVisitIds } } } });
    await prisma.invoice.deleteMany({ where: { visitId: { in: testVisitIds } } });
    await prisma.catalogItem.deleteMany({ where: { organizationId: DEV_ORGANIZATION_ID, sourceSystem: TEST_SOURCE_SYSTEM } });
    await prisma.soapNote.deleteMany({ where: { visitId: { in: testVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: testVisitIds } } });
    await prisma.medicalRecord.deleteMany({ where: { patient: { organizationId: DEV_ORGANIZATION_ID, sourceSystem: TEST_SOURCE_SYSTEM } } });
    await prisma.patientClient.deleteMany({ where: { client: { organizationId: DEV_ORGANIZATION_ID }, patient: { sourceSystem: TEST_SOURCE_SYSTEM } } });
    await prisma.patient.deleteMany({ where: { organizationId: DEV_ORGANIZATION_ID, sourceSystem: TEST_SOURCE_SYSTEM } });
    await prisma.client.deleteMany({ where: { organizationId: DEV_ORGANIZATION_ID, sourceSystem: TEST_SOURCE_SYSTEM } });
    await app.close();
  });

  async function createPatient(name: string) {
    const patient = await prisma.patient.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        name,
        species: 'Canine',
        sourceSystem: TEST_SOURCE_SYSTEM,
        clients: { create: [{ clientId: primaryClientId, isPrimary: true }] },
      },
    });
    return patient.id;
  }

  /** A visit past intake/exam/discharge — the same minimum state
   *  `completeCheckout` requires, mirroring visits.e2e-spec.ts's full-closure
   *  test. Returns the visit id and the draft SOAP note (needed to finalize
   *  the record and reach Archived). */
  async function createVisitReadyForCheckout(reason: string) {
    const patientId = await createPatient(`Billing Patient ${reason}`);
    const visit = await prisma.visit.create({
      data: {
        organizationId: DEV_ORGANIZATION_ID,
        locationId: DEV_LOCATION_ID,
        patientId,
        clientId: primaryClientId,
        visitType: 'WalkIn',
        reason,
        state: 'VeterinarianExamInProgress',
        phase: 'Exam',
        primaryVeterinarianId: DEV_USER_ID,
        intake: { create: { chiefComplaint: 'Checkup', completedAt: new Date() } },
        examFindings: { create: { subjective: 'Stable', objective: 'Stable', assessment: 'Healthy', plan: 'None' } },
      },
    });
    const examComplete = await request(app.getHttpServer()).post(`/visits/${visit.id}/exam/complete`);
    expect(examComplete.status).toBe(201);
    const draft = examComplete.body.soapNotes[0] as { version: number };
    const discharge = await request(app.getHttpServer()).put(`/visits/${visit.id}/discharge`).send({ instructions: 'Rest', followUpRequired: false });
    expect(discharge.status).toBe(200);
    return { visitId: visit.id, draft };
  }

  async function finalizeRecord(visitId: string, draft: { version: number }) {
    const saved = await request(app.getHttpServer()).put(`/visits/${visitId}/record/draft`).send({
      version: draft.version,
      subjective: 'Stable',
      objective: 'Stable',
      assessment: 'Healthy',
      plan: 'None',
    });
    expect(saved.status).toBe(200);
    const finalized = await request(app.getHttpServer()).post(`/visits/${visitId}/record/finalize`);
    expect(finalized.status).toBe(201);
  }

  /** Finalizes the invoice (the freeze boundary the payment endpoint now
   *  requires) and returns the resulting invoice state. */
  async function finalizeInvoice(visitId: string) {
    const finalized = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/finalize`);
    expect(finalized.status).toBe(201);
    return finalized.body;
  }

  describe('Patient document downloads', () => {
    it('requires signoff, downloads all three PDF types, and leaves billing unchanged', async () => {
      const { visitId, draft } = await createVisitReadyForCheckout('Document downloads');
      const unsigned = await request(app.getHttpServer()).get(`/visits/${visitId}/documents/record`);
      expect(unsigned.status).toBe(409);
      const discharge = await request(app.getHttpServer()).get(`/visits/${visitId}/documents/discharge`);
      expect(discharge.status).toBe(200);
      expect(discharge.headers['content-type']).toContain('application/pdf');
      expect(discharge.headers['cache-control']).toContain('no-store');
      await finalizeRecord(visitId, draft);
      const record = await request(app.getHttpServer()).get(`/visits/${visitId}/documents/record`);
      expect(record.status).toBe(200);
      expect(record.headers['content-disposition']).toContain('record-');
      await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      await finalizeInvoice(visitId);
      const before = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      const receipt = await request(app.getHttpServer()).get(`/visits/${visitId}/documents/receipt`);
      expect(receipt.status).toBe(200);
      expect(receipt.headers['content-type']).toContain('application/pdf');
      const after = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      expect(after.body).toEqual(before.body);
      const missing = await request(app.getHttpServer()).get('/visits/nonexistent/documents/record');
      expect(missing.status).toBe(404);
    });
  });

  describe('Invoice creation and totals', () => {
    it('returns the same invoice for concurrent first reads without rewriting it', async () => {
      const { visitId } = await createVisitReadyForCheckout('Concurrent invoice reads');
      const reads = await Promise.all(Array.from({ length: 8 }, () =>
        request(app.getHttpServer()).get(`/visits/${visitId}/invoice`),
      ));
      for (const response of reads) {
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ status: 'DRAFT', totalCents: 0, lines: [] });
        expect(response.body.id).toBe(reads[0]!.body.id);
        expect(response.body.version).toBe(reads[0]!.body.version);
      }
    });

    it('creates an empty DRAFT invoice on first request and updates totals as lines are added', async () => {
      const { visitId } = await createVisitReadyForCheckout('Invoice totals');
      const created = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({
        status: 'DRAFT', totalCents: 0, amountPaidCents: 0, remainingBalanceCents: 0, lines: [],
        editable: true, canRecordPayment: false, finalizedAt: null,
      });

      const line1 = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({
        description: 'Exam fee', quantity: 1, unitAmountCents: 6500,
      });
      expect(line1.status).toBe(201);
      expect(line1.body).toMatchObject({ status: 'OPEN', totalCents: 6500, remainingBalanceCents: 6500, editable: true, canRecordPayment: false });

      const line2 = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({
        description: 'Rabies vaccine', quantity: 2, unitAmountCents: 6000,
      });
      expect(line2.status).toBe(201);
      expect(line2.body).toMatchObject({ status: 'OPEN', totalCents: 18500, remainingBalanceCents: 18500 });
      expect(line2.body.lines).toHaveLength(2);
      expect(line2.body.lines[1]).toMatchObject({ totalAmountCents: 12000, sourceType: 'MANUAL' });
    });

    it('404s for a visit that does not exist', async () => {
      const missing = await request(app.getHttpServer()).get('/visits/does-not-exist/invoice');
      expect(missing.status).toBe(404);
    });
  });

  describe('Editable invoice (before finalization)', () => {
    it('allows authorized staff to add and remove charges freely, changing the total', async () => {
      const { visitId } = await createVisitReadyForCheckout('Editable invoice');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 6500 });
      const second = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Nail trim', quantity: 1, unitAmountCents: 1500 });
      expect(second.body.totalCents).toBe(8000);

      const lineToRemove = second.body.lines.find((line: { description: string }) => line.description === 'Nail trim').id as string;
      const afterRemoval = await request(app.getHttpServer()).delete(`/visits/${visitId}/invoice/lines/${lineToRemove}`);
      expect(afterRemoval.status).toBe(200);
      expect(afterRemoval.body).toMatchObject({ totalCents: 6500, status: 'OPEN', editable: true });
      expect(afterRemoval.body.lines).toHaveLength(1);
    });
  });

  describe('Finalization freezes the invoice', () => {
    it('finalizes, freezing the total and recording who and when', async () => {
      const { visitId } = await createVisitReadyForCheckout('Finalize records actor and time');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 6500 });

      const before = Date.now();
      const finalized = await finalizeInvoice(visitId);
      expect(finalized).toMatchObject({ status: 'FINALIZED', totalCents: 6500, editable: false, canRecordPayment: true, finalizedById: DEV_USER_ID });
      expect(new Date(finalized.finalizedAt).getTime()).toBeGreaterThanOrEqual(before);
      expect(finalized.finalizedBy).toMatchObject({ id: DEV_USER_ID });
    });

    it('rejects further line addition and removal after finalization', async () => {
      const { visitId } = await createVisitReadyForCheckout('Finalized rejects mutation');
      const added = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 6500 });
      const lineId = added.body.lines[0].id as string;
      await finalizeInvoice(visitId);

      const addAttempt = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Late add', quantity: 1, unitAmountCents: 500 });
      expect(addAttempt.status).toBe(409);
      expect(addAttempt.body.message).toContain('finalized');

      const removeAttempt = await request(app.getHttpServer()).delete(`/visits/${visitId}/invoice/lines/${lineId}`);
      expect(removeAttempt.status).toBe(409);
      expect(removeAttempt.body.message).toContain('finalized');

      // The invoice must not have silently changed underneath either
      // rejected request.
      const stillFrozen = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      expect(stillFrozen.body).toMatchObject({ totalCents: 6500, lines: [expect.objectContaining({ id: lineId })] });
    });

    it('is idempotent: finalizing an already-finalized invoice returns the original finalization, not a new one', async () => {
      const { visitId } = await createVisitReadyForCheckout('Finalize idempotent');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 6500 });
      const first = await finalizeInvoice(visitId);
      const second = await finalizeInvoice(visitId);
      expect(second.finalizedAt).toBe(first.finalizedAt);
      expect(second.finalizedById).toBe(first.finalizedById);
    });
  });

  describe('Payment requires finalization', () => {
    it('rejects a payment before the invoice is finalized', async () => {
      const { visitId } = await createVisitReadyForCheckout('Payment before finalize rejected');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      const attempt = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 5000, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}` });
      expect(attempt.status).toBe(409);
      expect(attempt.body.message).toContain('Finalize');
      expect(await prisma.payment.count({ where: { invoice: { visitId } } })).toBe(0);
    });

    it('accepts a payment once the invoice has been finalized', async () => {
      const { visitId } = await createVisitReadyForCheckout('Payment after finalize accepted');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      await finalizeInvoice(visitId);
      const payment = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 5000, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}` });
      expect(payment.status).toBe(201);
      expect(payment.body).toMatchObject({ status: 'PAID', remainingBalanceCents: 0, canRecordPayment: false });
    });
  });

  describe('Recording payments', () => {
    it('supports a cash partial payment followed by a card payment that fully pays the invoice', async () => {
      const { visitId } = await createVisitReadyForCheckout('Partial then full payment');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 18450 });
      await finalizeInvoice(visitId);

      const partial = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({
        amountCents: 10000, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}`,
      });
      expect(partial.status).toBe(201);
      expect(partial.body).toMatchObject({ status: 'PARTIALLY_PAID', amountPaidCents: 10000, remainingBalanceCents: 8450, canRecordPayment: true });

      const full = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({
        amountCents: 8450, method: 'CARD', externalReference: 'GODADDY-TERMINAL-4471', idempotencyKey: `pay-${crypto.randomUUID()}`,
      });
      expect(full.status).toBe(201);
      expect(full.body).toMatchObject({ status: 'PAID', amountPaidCents: 18450, remainingBalanceCents: 0, canRecordPayment: false });
      expect(full.body.payments).toHaveLength(2);
      expect(full.body.payments[1]).toMatchObject({
        method: 'CARD', provider: 'EXTERNAL', status: 'RECORDED', externalReference: 'GODADDY-TERMINAL-4471', recordedById: DEV_USER_ID,
      });

      const history = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice/payments`);
      expect(history.status).toBe(200);
      expect(history.body).toHaveLength(2);
    });

    it('replays a duplicate submission by idempotency key instead of creating a second payment', async () => {
      const { visitId } = await createVisitReadyForCheckout('Duplicate payment prevention');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      await finalizeInvoice(visitId);
      const key = `pay-${crypto.randomUUID()}`;

      const first = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 5000, method: 'CASH', idempotencyKey: key });
      expect(first.status).toBe(201);
      const retry = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 5000, method: 'CASH', idempotencyKey: key });
      expect(retry.status).toBe(201);
      expect(retry.body.payments).toHaveLength(1);
      expect(retry.body.amountPaidCents).toBe(5000);
    });

    it('rejects a payment amount that exceeds the remaining balance', async () => {
      const { visitId } = await createVisitReadyForCheckout('Overpayment rejected');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      await finalizeInvoice(visitId);
      const overpay = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 5001, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}` });
      expect(overpay.status).toBe(409);
      expect(overpay.body.message).toContain('exceeds the remaining balance');
    });

    it('rejects a payment against an invoice that is already paid in full', async () => {
      const { visitId } = await createVisitReadyForCheckout('Already paid rejection');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      await finalizeInvoice(visitId);
      const paid = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 5000, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}` });
      expect(paid.status).toBe(201);
      const again = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 1, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}` });
      expect(again.status).toBe(409);
      expect(again.body.message).toContain('already paid in full');
    });

    it('rejects an invalid (non-positive) amount before touching the invoice', async () => {
      const { visitId } = await createVisitReadyForCheckout('Invalid amount rejected');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      await finalizeInvoice(visitId);
      const invalid = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 0, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}` });
      expect(invalid.status).toBe(400);
    });
  });

  describe('Finalized invoice lines are historical snapshots', () => {
    it('keeps frozen line values stable even after the referenced CatalogItem changes', async () => {
      const catalogItem = await prisma.catalogItem.create({
        data: {
          organizationId: DEV_ORGANIZATION_ID,
          name: 'Wellness Exam (billing e2e)',
          primaryType: 'SERVICE',
          billable: true,
          retailPrice: 65,
          sourceSystem: TEST_SOURCE_SYSTEM,
        },
      });
      const { visitId } = await createVisitReadyForCheckout('Snapshot stability');
      const added = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({
        description: 'Wellness Exam', quantity: 1, unitAmountCents: 6500, catalogItemId: catalogItem.id,
      });
      expect(added.body.lines[0]).toMatchObject({ description: 'Wellness Exam', unitAmountCents: 6500, totalAmountCents: 6500, sourceType: 'CATALOG_ITEM' });
      await finalizeInvoice(visitId);

      // A later price/name change on the CatalogItem itself must never
      // reach back into the already-finalized historical invoice.
      await prisma.catalogItem.update({ where: { id: catalogItem.id }, data: { name: 'Wellness Exam (renamed)', retailPrice: 120 } });

      const reloaded = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      expect(reloaded.body.lines[0]).toMatchObject({ description: 'Wellness Exam', unitAmountCents: 6500, totalAmountCents: 6500 });
      expect(reloaded.body.totalCents).toBe(6500);
    });
  });

  describe('Receipt contract', () => {
    it('rejects a receipt for an invoice that has not been finalized', async () => {
      const { visitId } = await createVisitReadyForCheckout('Receipt before finalize rejected');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      const receipt = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice/receipt`);
      expect(receipt.status).toBe(409);
    });

    it('returns itemized receipt data matching the finalized invoice and payment records', async () => {
      const { visitId } = await createVisitReadyForCheckout('Receipt matches invoice');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 6500 });
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Rabies vaccine', quantity: 2, unitAmountCents: 6000 });
      await finalizeInvoice(visitId);
      const payment = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({
        amountCents: 18500, method: 'CARD', externalReference: 'GODADDY-TERMINAL-7002', idempotencyKey: `pay-${crypto.randomUUID()}`,
      });
      expect(payment.status).toBe(201);

      const receipt = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice/receipt`);
      expect(receipt.status).toBe(200);
      expect(receipt.body).toMatchObject({
        visitId,
        status: 'PAID',
        organization: { id: DEV_ORGANIZATION_ID },
        location: { id: DEV_LOCATION_ID },
        client: { id: primaryClientId },
        subtotalCents: 18500,
        totalCents: 18500,
        amountPaidCents: 18500,
        remainingBalanceCents: 0,
      });
      expect(receipt.body.lines).toHaveLength(2);
      expect(receipt.body.lines[1]).toMatchObject({ description: 'Rabies vaccine', unitAmountCents: 6000, totalAmountCents: 12000 });
      expect(Number(receipt.body.lines[1].quantity)).toBe(2);
      expect(receipt.body.payments).toHaveLength(1);
      expect(receipt.body.payments[0]).toMatchObject({ amountCents: 18500, method: 'CARD', externalReference: 'GODADDY-TERMINAL-7002' });
      expect(receipt.body.finalizedBy).toMatchObject({ id: DEV_USER_ID });
    });
  });

  describe('Zero-dollar checkout', () => {
    it('completes checkout with no invoice lines and no payment record, auto-finalizing the invoice', async () => {
      const { visitId } = await createVisitReadyForCheckout('Zero dollar checkout');
      const invoice = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      expect(invoice.body).toMatchObject({ totalCents: 0, remainingBalanceCents: 0, finalizedAt: null, editable: true });

      const checkout = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: true });
      expect(checkout.status).toBe(201);

      const paymentCount = await prisma.payment.count({ where: { invoice: { visitId } } });
      expect(paymentCount).toBe(0);
      const finishedCheckout = await prisma.visitCheckout.findUniqueOrThrow({ where: { visitId } });
      expect(finishedCheckout).toMatchObject({ balanceStatus: 'Paid', outstandingBalanceCents: null });

      // Every completed visit that has an Invoice leaves it finalized —
      // there is no separate user action for a $0 invoice.
      const afterCheckout = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      expect(afterCheckout.body).toMatchObject({ status: 'PAID', editable: false, canRecordPayment: false, finalizedById: DEV_USER_ID });
      expect(afterCheckout.body.finalizedAt).not.toBeNull();

      // The now-closed invoice is no longer editable...
      const addAttempt = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Late add', quantity: 1, unitAmountCents: 500 });
      expect(addAttempt.status).toBe(409);

      // ...and receipt data is available now that it's finalized.
      const receipt = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice/receipt`);
      expect(receipt.status).toBe(200);
      expect(receipt.body).toMatchObject({ visitId, status: 'PAID', totalCents: 0, remainingBalanceCents: 0, lines: [], payments: [] });
    });

    it('finalizing a zero-dollar invoice marks it paid immediately without a fake payment', async () => {
      const { visitId } = await createVisitReadyForCheckout('Zero dollar finalize');
      await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      const finalized = await finalizeInvoice(visitId);
      expect(finalized).toMatchObject({ status: 'PAID', totalCents: 0, remainingBalanceCents: 0, canRecordPayment: false });
      expect(await prisma.payment.count({ where: { invoice: { visitId } } })).toBe(0);
    });

    it('does not change the original finalization metadata on a repeated checkout-completion attempt', async () => {
      const { visitId } = await createVisitReadyForCheckout('Zero dollar repeated checkout');
      await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      const checkout = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: true });
      expect(checkout.status).toBe(201);

      const first = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      expect(first.body.finalizedAt).not.toBeNull();

      // Checkout was already completed — this rejects before ever touching
      // the invoice again.
      const repeated = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: true });
      expect(repeated.status).toBe(409);

      const second = await request(app.getHttpServer()).get(`/visits/${visitId}/invoice`);
      expect(second.body.finalizedAt).toBe(first.body.finalizedAt);
      expect(second.body.finalizedById).toBe(first.body.finalizedById);
      expect(second.body.version).toBe(first.body.version);
    });
  });

  describe('Checkout blocked by a real outstanding invoice balance', () => {
    it('does not let the frontend mark checkout paid when the invoice still has a balance', async () => {
      const { visitId } = await createVisitReadyForCheckout('Outstanding balance blocks checkout');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      // The frontend cannot lie its way past the real balance by claiming
      // NoBalanceReported — the invoice-aware path ignores/overrides it.
      const blocked = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: true, balanceDisposition: 'NoBalanceReported' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toContain('outstanding balance');
    });
  });

  describe('Legacy self-reported checkout stays unchanged when no invoice exists', () => {
    it('still completes with NoBalanceReported when nothing ever created an invoice for the visit', async () => {
      const { visitId } = await createVisitReadyForCheckout('Legacy self-reported checkout');
      const checkout = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: true, balanceDisposition: 'NoBalanceReported' });
      expect(checkout.status).toBe(201);
      expect(await prisma.invoice.findUnique({ where: { visitId } })).toBeNull();
    });

    it('requires balanceDisposition when no invoice exists', async () => {
      const { visitId } = await createVisitReadyForCheckout('Legacy balanceDisposition required');
      const missing = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: true });
      expect(missing.status).toBe(400);
    });
  });

  describe('Payment recording, checkout completion, and visit close are independent', () => {
    it('keeps a recorded payment intact when checkout completion fails, then reopens cleanly and closes the visit', async () => {
      const { visitId, draft } = await createVisitReadyForCheckout('Reopen after payment then close');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 18450 });
      await finalizeInvoice(visitId);

      const payment = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({
        amountCents: 18450, method: 'CARD', externalReference: 'GODADDY-TERMINAL-9001', idempotencyKey: `pay-${crypto.randomUUID()}`,
      });
      expect(payment.status).toBe(201);
      expect(payment.body).toMatchObject({ status: 'PAID', remainingBalanceCents: 0 });

      // Checkout completion fails for an unrelated reason (client contact
      // not confirmed yet) — the payment must not be affected by this.
      const failedCheckout = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: false });
      expect(failedCheckout.status).toBe(409);

      const stateAfterFailure = await request(app.getHttpServer()).get(`/visits/${visitId}/checkout`);
      expect(stateAfterFailure.status).toBe(200);
      expect(stateAfterFailure.body.invoice).toMatchObject({ status: 'PAID', remainingBalanceCents: 0 });
      expect(stateAfterFailure.body.invoice.payments).toHaveLength(1);
      expect(stateAfterFailure.body.checkoutCompletion).toMatchObject({ completed: false });

      // Reopening and completing checkout for real must not ask staff to
      // record the payment again.
      const checkout = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: true });
      expect(checkout.status).toBe(201);
      expect(checkout.body).toMatchObject({ state: 'RecordCompletionPending' });
      expect(await prisma.payment.count({ where: { invoice: { visitId } } })).toBe(1);

      await finalizeRecord(visitId, draft);
      const closedVisit = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
      expect(closedVisit).toMatchObject({ state: 'Archived', phase: 'Closed' });

      // Already-closed visit handling: checkout and payment recording both
      // reject cleanly instead of silently doing nothing or double-charging.
      const secondCheckout = await request(app.getHttpServer()).post(`/visits/${visitId}/checkout/complete`).send({ clientContactConfirmed: true });
      expect(secondCheckout.status).toBe(409);
      expect(secondCheckout.body.message).toContain('already been completed');

      const paymentAfterClose = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 100, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}` });
      expect(paymentAfterClose.status).toBe(409);
      expect(paymentAfterClose.body.message).toContain('already closed');
    });
  });

  describe('Invoice void', () => {
    it('voids an editable invoice with no payments and removes a line before voiding', async () => {
      const { visitId } = await createVisitReadyForCheckout('Void editable invoice');
      const added = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      const lineId = added.body.lines[0].id as string;

      const removed = await request(app.getHttpServer()).delete(`/visits/${visitId}/invoice/lines/${lineId}`);
      expect(removed.status).toBe(200);
      expect(removed.body.lines).toHaveLength(0);

      const voided = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/void`).send({ reason: 'Visit cancelled before service' });
      expect(voided.status).toBe(201);
      expect(voided.body.status).toBe('VOID');
    });

    it('still allows voiding a finalized invoice that has not been paid yet', async () => {
      const { visitId } = await createVisitReadyForCheckout('Void finalized invoice');
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      await finalizeInvoice(visitId);

      const voided = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/void`).send({ reason: 'Client cancelled after finalizing' });
      expect(voided.status).toBe(201);
      expect(voided.body.status).toBe('VOID');
    });

    it('cannot void or remove a line once a payment has been recorded', async () => {
      const { visitId } = await createVisitReadyForCheckout('Line removal and void guards');
      const added = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/lines`).send({ description: 'Exam fee', quantity: 1, unitAmountCents: 5000 });
      const lineId = added.body.lines[0].id as string;
      await finalizeInvoice(visitId);
      await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/payments`).send({ amountCents: 5000, method: 'CASH', idempotencyKey: `pay-${crypto.randomUUID()}` });

      const removed = await request(app.getHttpServer()).delete(`/visits/${visitId}/invoice/lines/${lineId}`);
      expect(removed.status).toBe(409);

      const voided = await request(app.getHttpServer()).post(`/visits/${visitId}/invoice/void`).send({ reason: 'Entered by mistake' });
      expect(voided.status).toBe(409);
    });
  });
});
