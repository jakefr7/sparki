import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type InvoiceLineSourceType, type InvoiceStatus, type Prisma } from '@sparki/db';
import { assertBelongsToOrganization } from '../common/assert-organization-scope';
import { TERMINAL_VISIT_STATES } from './visit-states';
import { getCheckoutReadinessBlockers } from './visit-lifecycle.service';
import type { AddInvoiceLineInput, RecordExternalPaymentInput } from './dto/visit-billing.schema';

const USER_SUMMARY_SELECT = { id: true, firstName: true, lastName: true, displayName: true } satisfies Prisma.UserSelect;

const PAYMENT_HISTORY_INCLUDE = {
  recordedBy: { select: USER_SUMMARY_SELECT },
} satisfies Prisma.PaymentInclude;

const INVOICE_STATE_INCLUDE = {
  finalizedBy: { select: USER_SUMMARY_SELECT },
  lines: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { recordedAt: 'asc' as const }, include: PAYMENT_HISTORY_INCLUDE },
} satisfies Prisma.InvoiceInclude;

interface InvoiceTotals {
  totalCents: number;
  amountPaidCents: number;
  remainingBalanceCents: number;
  hasLines: boolean;
}

/**
 * The financial backbone for receptionist Checkout: Sparki owns this
 * invoice/payment ledger while clinics keep processing money through their
 * own terminal or processor. Every Payment this service creates is staff
 * attesting an amount was already collected externally — this service never
 * claims Sparki processed, authorized, or charged anything.
 *
 * `totalCents`/`amountPaidCents`/`remainingBalanceCents` are never persisted
 * columns; they're recomputed here from InvoiceLine/Payment rows on every
 * read so there's no manually-editable total to drift from reality.
 * `Invoice.status` and `Invoice.version` are persisted, but only ever
 * written by `recomputeAndBumpVersion` below — no DTO in
 * dto/visit-billing.schema.ts accepts either as input.
 *
 * The real clinic workflow this models: Build invoice (EDITABLE) -> Finalize
 * invoice (freezes the amount reception processes on the clinic's external
 * terminal) -> Record payment -> Receipt -> Finish checkout. The
 * business-meaningful boundary is `Invoice.finalizedAt`, not line count or
 * payment count — `addLine`/`removeLine` reject once it's set, and
 * `recordExternalPayment` refuses until it is. Reopening a finalized invoice
 * is deliberately not implemented; do not add a path that clears
 * `finalizedAt`.
 */
@Injectable()
export class VisitBillingService {
  async listForPatient(patientId: string, organizationId: string, locationId: string) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId }, select: { id: true } });
    if (!patient) throw new NotFoundException(`Patient ${patientId} not found`);
    const invoices = await prisma.invoice.findMany({
      where: { patientId, organizationId, locationId },
      include: {
        visit: { select: { id: true, reason: true, visitType: true, createdAt: true, state: true } },
        lines: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { recordedAt: 'asc' }, include: PAYMENT_HISTORY_INCLUDE },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invoices.map((invoice) => {
      const totalCents = invoice.lines.reduce((sum, line) => sum + line.totalAmountCents, 0);
      const amountPaidCents = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
      return {
        id: invoice.id,
        visitId: invoice.visitId,
        visit: invoice.visit,
        status: invoice.status,
        version: invoice.version,
        editable: !invoice.finalizedAt && !invoice.voidedAt,
        finalizedAt: invoice.finalizedAt,
        createdAt: invoice.createdAt,
        totalCents,
        amountPaidCents,
        remainingBalanceCents: Math.max(totalCents - amountPaidCents, 0),
        lines: invoice.lines,
        payments: invoice.payments,
      };
    });
  }

  /** Read-only: the current invoice + its computed totals, or `null` if no
   *  invoice has been created for this visit yet. Used by
   *  VisitDischargeService so checkout completion can defer to real
   *  financial state without ever creating an invoice as a side effect of a
   *  legacy self-reported checkout call, and so it knows whether a $0
   *  invoice still needs to be auto-finalized before the visit closes. */
  async getBalanceSummary(
    visitId: string,
    organizationId: string,
    locationId: string,
  ): Promise<{ invoiceId: string; version: number; finalizedAt: Date | null } & InvoiceTotals | null> {
    const visit = await prisma.visit.findFirst({ where: { id: visitId, organizationId, locationId }, select: { id: true } });
    if (!visit) return null;
    const invoice = await prisma.invoice.findUnique({ where: { visitId }, select: { id: true, version: true, finalizedAt: true } });
    if (!invoice) return null;
    const totals = await computeInvoiceTotals(prisma, invoice.id);
    return { invoiceId: invoice.id, version: invoice.version, finalizedAt: invoice.finalizedAt, ...totals };
  }

  /** The full "get checkout state" contract: client/patient/visit context,
   *  checkout readiness/blockers, the invoice (lazily created on first
   *  request), follow-up requirement, and prior checkout-completion state.
   *  The frontend should not need to calculate any of this itself. */
  async getCheckoutState(visitId: string, organizationId: string, locationId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findFirst({
        where: { id: visitId, organizationId, locationId },
        include: {
          client: true,
          patient: true,
          location: { select: { allowCheckoutWithOutstandingBalance: true } },
          intake: true,
          examFindings: true,
          discharge: true,
          checkout: true,
          exceptions: { where: { resolvedAt: null, severity: 'Critical' } },
          workItems: {
            where: {
              type: { in: ['Diagnostic', 'Estimate', 'ClientApproval', 'Treatment', 'Medication', 'ClientCommunication'] },
              status: { in: ['Pending', 'InProgress'] },
            },
          },
        },
      });
      if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);

      let invoice = await tx.invoice.findUnique({ where: { visitId } });
      if (!invoice) {
        invoice = await tx.invoice.create({
          data: {
            organizationId,
            locationId,
            visitId,
            patientId: visit.patientId,
            clientId: visit.clientId,
            createdById: actorId,
          },
        });
      }
      const invoiceState = await loadInvoiceState(tx, invoice.id);

      const blockers = getCheckoutReadinessBlockers(visit);
      if (!visit.discharge) blockers.push('Complete discharge instructions before checkout.');

      return {
        client: visit.client,
        patient: visit.patient,
        visit: {
          id: visit.id,
          state: visit.state,
          phase: visit.phase,
          visitType: visit.visitType,
          departedAt: visit.departedAt,
          closedAt: visit.closedAt,
        },
        readiness: { ready: blockers.length === 0, blockers },
        invoice: invoiceState,
        followUp: { required: Boolean(visit.discharge?.followUpRequired), plan: visit.discharge?.followUpPlan ?? null },
        checkoutCompletion: {
          completed: Boolean(visit.checkout),
          completedAt: visit.checkout?.completedAt ?? null,
          completedById: visit.checkout?.completedById ?? null,
          balanceStatus: visit.checkout?.balanceStatus ?? null,
        },
        allowCheckoutWithOutstandingBalance: visit.location.allowCheckoutWithOutstandingBalance,
      };
    });
  }

  /** "get invoice": ensures an Invoice exists for the visit (creating an
   *  empty DRAFT one on first call — a $0 visit never needs a fake payment
   *  to complete Checkout, see VisitBillingService.spec) and returns it with
   *  its lines, payments, and computed totals. */
  async getInvoice(visitId: string, organizationId: string, locationId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await getOrCreateInvoice(tx, visitId, organizationId, locationId, actorId);
      return loadInvoiceState(tx, invoice.id);
    });
  }

  async getPaymentHistory(visitId: string, organizationId: string, locationId: string) {
    const invoice = await requireInvoiceForVisit(prisma, visitId, organizationId, locationId);
    return prisma.payment.findMany({ where: { invoiceId: invoice.id }, orderBy: { recordedAt: 'asc' }, include: PAYMENT_HISTORY_INCLUDE });
  }

  /** GET .../invoice/receipt: authoritative, server-computed data for an
   *  itemized receipt, derived from the finalized invoice and its Payment
   *  records — never calculated by the frontend. Unavailable before
   *  finalization: pre-finalization totals can still change, so there is
   *  nothing authoritative yet to hand back. If Sparki gains real
   *  PDF/document-generation infrastructure later, it should render from
   *  this same contract rather than recomputing anything. */
  async getReceipt(visitId: string, organizationId: string, locationId: string) {
    const invoice = await requireInvoiceForVisit(prisma, visitId, organizationId, locationId);
    if (!invoice.finalizedAt) {
      throw new ConflictException('This invoice has not been finalized yet; there is no receipt to produce.');
    }
    const [organization, location, client, patient, state] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true } }),
      prisma.location.findUniqueOrThrow({ where: { id: locationId }, select: { id: true, name: true } }),
      invoice.clientId
        ? prisma.client.findUnique({ where: { id: invoice.clientId }, select: { id: true, firstName: true, lastName: true, email: true, phone: true } })
        : Promise.resolve(null),
      prisma.patient.findUniqueOrThrow({ where: { id: invoice.patientId }, select: { id: true, name: true, species: true } }),
      loadInvoiceState(prisma, invoice.id),
    ]);
    return {
      invoiceId: state.id,
      visitId: state.visitId,
      status: state.status,
      finalizedAt: state.finalizedAt,
      finalizedBy: state.finalizedBy,
      organization,
      location,
      client,
      patient,
      lines: state.lines,
      // Sparki does not model tax or discounts yet — subtotal and total are
      // always equal today. Both are returned so a document template can
      // already reserve a subtotal row for when that changes.
      subtotalCents: state.totalCents,
      totalCents: state.totalCents,
      payments: state.payments,
      amountPaidCents: state.amountPaidCents,
      remainingBalanceCents: state.remainingBalanceCents,
    };
  }

  async addLine(visitId: string, organizationId: string, locationId: string, actorId: string, input: AddInvoiceLineInput) {
    return prisma.$transaction(async (tx) => {
      const invoice = await getOrCreateInvoice(tx, visitId, organizationId, locationId, actorId);
      if (invoice.voidedAt) throw new ConflictException('This invoice has been voided.');
      assertInvoiceEditable(invoice);
      await assertVisitNotClosed(tx, visitId, organizationId, locationId);
      if (input.catalogItemId) {
        await assertBelongsToOrganization(tx.catalogItem, 'Catalog item', input.catalogItemId, organizationId);
      }
      const sourceType: InvoiceLineSourceType = input.catalogItemId ? 'CATALOG_ITEM' : input.sourceRecordId ? 'VISIT_WORK_ITEM' : 'MANUAL';
      const totalAmountCents = Math.round(input.quantity * input.unitAmountCents);
      await tx.invoiceLine.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          description: input.description,
          quantity: input.quantity,
          unitAmountCents: input.unitAmountCents,
          totalAmountCents,
          sourceType,
          sourceRecordId: input.sourceRecordId ?? null,
          catalogItemId: input.catalogItemId ?? null,
          createdById: actorId,
        },
      });
      await recomputeAndBumpVersion(tx, invoice.id);
      return loadInvoiceState(tx, invoice.id);
    }, { isolationLevel: 'Serializable' });
  }

  async removeLine(visitId: string, lineId: string, organizationId: string, locationId: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await requireInvoiceForVisit(tx, visitId, organizationId, locationId);
      if (invoice.voidedAt) throw new ConflictException('This invoice has been voided.');
      assertInvoiceEditable(invoice);
      await assertVisitNotClosed(tx, visitId, organizationId, locationId);
      const line = await tx.invoiceLine.findFirst({ where: { id: lineId, invoiceId: invoice.id } });
      if (!line) throw new NotFoundException('Invoice line not found.');
      await tx.invoiceLine.delete({ where: { id: lineId } });
      await recomputeAndBumpVersion(tx, invoice.id);
      return loadInvoiceState(tx, invoice.id);
    }, { isolationLevel: 'Serializable' });
  }

  /** Finalize: freezes invoice line financial data and establishes the
   *  final amount reception processes on the clinic's external terminal.
   *  Idempotent — finalizing an already-finalized invoice returns its
   *  existing frozen state (same `finalizedAt`/`finalizedById`) rather than
   *  erroring, so a double-click isn't a scary failure. There is
   *  deliberately no "unfinalize"/reopen operation yet. */
  async finalizeInvoice(visitId: string, organizationId: string, locationId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await requireInvoiceForVisit(tx, visitId, organizationId, locationId);
      if (invoice.voidedAt) throw new ConflictException('This invoice has been voided.');
      if (invoice.finalizedAt) return loadInvoiceState(tx, invoice.id);
      await assertVisitNotClosed(tx, visitId, organizationId, locationId);
      await tx.invoice.update({ where: { id: invoice.id }, data: { finalizedAt: new Date(), finalizedById: actorId } });
      await recomputeAndBumpVersion(tx, invoice.id);
      return loadInvoiceState(tx, invoice.id);
    }, { isolationLevel: 'Serializable' });
  }

  /** Cancels an invoice that has no recorded payments — e.g. a visit whose
   *  charges were entered by mistake or that itself gets cancelled. This is
   *  not a refund: voiding is only ever allowed before any money has been
   *  recorded as collected. Available both before and after finalization,
   *  as long as nothing has been paid yet. */
  async voidInvoice(visitId: string, organizationId: string, locationId: string, actorId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await requireInvoiceForVisit(tx, visitId, organizationId, locationId);
      if (invoice.voidedAt) return loadInvoiceState(tx, invoice.id);
      const totals = await computeInvoiceTotals(tx, invoice.id);
      if (totals.amountPaidCents > 0) {
        throw new ConflictException('Cannot void an invoice that has recorded payments.');
      }
      await tx.invoice.update({ where: { id: invoice.id }, data: { voidedAt: new Date(), voidedById: actorId, voidReason: reason } });
      await recomputeAndBumpVersion(tx, invoice.id);
      return loadInvoiceState(tx, invoice.id);
    }, { isolationLevel: 'Serializable' });
  }

  /** RecordExternalPayment: staff confirms an amount was already collected
   *  through the clinic's own terminal/processor. Sparki records that fact —
   *  it never processes, authorizes, or charges anything itself. */
  async recordExternalPayment(
    visitId: string,
    organizationId: string,
    locationId: string,
    actorId: string,
    input: RecordExternalPaymentInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const invoice = await requireInvoiceForVisit(tx, visitId, organizationId, locationId);

      // Idempotent replay: a browser retry with the same key returns the
      // current invoice state instead of creating a second payment.
      const existingPayment = await tx.payment.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
      });
      if (existingPayment) {
        if (existingPayment.invoiceId !== invoice.id) {
          throw new ConflictException('This idempotency key was already used to record a payment on a different invoice.');
        }
        return loadInvoiceState(tx, invoice.id);
      }

      await assertVisitNotClosed(tx, visitId, organizationId, locationId);
      if (invoice.voidedAt) throw new ConflictException('This invoice has been voided and cannot accept payment.');
      if (!invoice.finalizedAt) {
        throw new ConflictException('Finalize the invoice before recording a payment against it.');
      }
      if (input.expectedInvoiceVersion !== undefined && input.expectedInvoiceVersion !== invoice.version) {
        throw new ConflictException('This invoice changed since you last viewed it. Refresh and try again.');
      }

      const totals = await computeInvoiceTotals(tx, invoice.id);
      if (totals.remainingBalanceCents <= 0) {
        throw new ConflictException('This invoice is already paid in full.');
      }
      if (input.amountCents > totals.remainingBalanceCents) {
        throw new ConflictException(
          `Amount exceeds the remaining balance of $${(totals.remainingBalanceCents / 100).toFixed(2)}.`,
        );
      }

      await tx.payment.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          amountCents: input.amountCents,
          method: input.method,
          provider: 'EXTERNAL',
          status: 'RECORDED',
          externalReference: input.externalReference ?? null,
          note: input.note ?? null,
          idempotencyKey: input.idempotencyKey,
          recordedById: actorId,
        },
      });
      await recomputeAndBumpVersion(tx, invoice.id);
      return loadInvoiceState(tx, invoice.id);
    }, { isolationLevel: 'Serializable' });
  }
}

async function getOrCreateInvoice(tx: Prisma.TransactionClient, visitId: string, organizationId: string, locationId: string, actorId: string) {
  const visit = await tx.visit.findFirst({ where: { id: visitId, organizationId, locationId }, select: { id: true, patientId: true, clientId: true } });
  if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
  const existing = await tx.invoice.findUnique({ where: { visitId } });
  if (existing) return existing;
  // Concurrent profile/checkout reads can both see no invoice. Insert once
  // without rewriting the existing invoice or its original authorship.
  await tx.invoice.createMany({
    data: [{ organizationId, locationId, visitId, patientId: visit.patientId, clientId: visit.clientId, createdById: actorId }],
    skipDuplicates: true,
  });
  return tx.invoice.findUniqueOrThrow({ where: { visitId } });
}

async function requireInvoiceForVisit(tx: Prisma.TransactionClient | typeof prisma, visitId: string, organizationId: string, locationId: string) {
  const visit = await tx.visit.findFirst({ where: { id: visitId, organizationId, locationId }, select: { id: true } });
  if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
  const invoice = await tx.invoice.findUnique({ where: { visitId } });
  if (!invoice) throw new NotFoundException('No invoice exists yet for this visit. Load checkout details first.');
  return invoice;
}

async function assertVisitNotClosed(tx: Prisma.TransactionClient, visitId: string, organizationId: string, locationId: string) {
  const visit = await tx.visit.findFirst({ where: { id: visitId, organizationId, locationId }, select: { state: true } });
  if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
  if (TERMINAL_VISIT_STATES.includes(visit.state)) throw new ConflictException('This visit is already closed.');
}

/** The editable/finalized boundary: once `finalizedAt` is set, invoice line
 *  mutations are rejected outright — regardless of whether any payment has
 *  been recorded yet. This is the single authoritative gate; nothing should
 *  infer editability from line or payment count instead. */
function assertInvoiceEditable(invoice: { finalizedAt: Date | null }) {
  if (invoice.finalizedAt) {
    throw new ConflictException('This invoice has been finalized and can no longer be edited.');
  }
}

async function computeInvoiceTotals(tx: Prisma.TransactionClient | typeof prisma, invoiceId: string): Promise<InvoiceTotals> {
  const [lineAgg, paymentAgg, lineCount] = await Promise.all([
    tx.invoiceLine.aggregate({ where: { invoiceId }, _sum: { totalAmountCents: true } }),
    tx.payment.aggregate({ where: { invoiceId, status: 'RECORDED' }, _sum: { amountCents: true } }),
    tx.invoiceLine.count({ where: { invoiceId } }),
  ]);
  const totalCents = lineAgg._sum.totalAmountCents ?? 0;
  const amountPaidCents = paymentAgg._sum.amountCents ?? 0;
  return { totalCents, amountPaidCents, remainingBalanceCents: Math.max(totalCents - amountPaidCents, 0), hasLines: lineCount > 0 };
}

/** DRAFT/OPEN are pre-finalization display nuance only (empty vs
 *  has-charges) — `finalizedAt` is the actual readiness gate everything else
 *  in this service checks. Do not add logic elsewhere that infers
 *  editability or payment-eligibility from this label instead of the real
 *  `finalizedAt`/`voidedAt` columns. */
function deriveInvoiceStatus(totals: InvoiceTotals, finalizedAt: Date | null, voided: boolean): InvoiceStatus {
  if (voided) return 'VOID';
  if (!finalizedAt) return totals.hasLines ? 'OPEN' : 'DRAFT';
  if (totals.amountPaidCents >= totals.totalCents) return 'PAID'; // also covers a $0 invoice
  if (totals.amountPaidCents > 0) return 'PARTIALLY_PAID';
  return 'FINALIZED';
}

/** Recomputes Invoice.status from current lines/payments/finalizedAt and
 *  bumps Invoice.version. Called at the end of every mutating operation
 *  above — never accepts status/version/finalizedAt as caller input, so
 *  financial state stays server-controlled. */
async function recomputeAndBumpVersion(tx: Prisma.TransactionClient, invoiceId: string) {
  const [current, totals] = await Promise.all([
    tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
    computeInvoiceTotals(tx, invoiceId),
  ]);
  const status = deriveInvoiceStatus(totals, current.finalizedAt, Boolean(current.voidedAt));
  await tx.invoice.update({ where: { id: invoiceId }, data: { status, version: { increment: 1 } } });
}

async function loadInvoiceState(tx: Prisma.TransactionClient | typeof prisma, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: INVOICE_STATE_INCLUDE });
  const totals = await computeInvoiceTotals(tx, invoiceId);
  return {
    ...invoice,
    ...totals,
    // Explicit booleans so the frontend never infers these from line/payment
    // count itself (see VisitBillingService doc comment).
    editable: !invoice.finalizedAt && !invoice.voidedAt,
    canRecordPayment: Boolean(invoice.finalizedAt) && !invoice.voidedAt && totals.remainingBalanceCents > 0,
  };
}
