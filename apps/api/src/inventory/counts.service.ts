import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type CatalogItemType, Prisma, prisma } from '@sparki/db';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/types';
import type {
  AssignmentInput,
  CancelCountInput,
  CountEntryInput,
  CountTemplateInput,
  CreateCountInput,
  PostCountInput,
  RecountInput,
  ReviewLineInput,
} from './dto/counts.schema';
import { canInventory, requireInventory } from './inventory.permissions';

const D = (v: string | number | Prisma.Decimal | null | undefined) => new Prisma.Decimal(v ?? 0);
type CountConfiguration = CreateCountInput['configuration'];
type CountSession = Prisma.InventoryCountSessionGetPayload<Record<string, never>>;
type CountLine = Prisma.InventoryCountLineGetPayload<Record<string, never>>;
type CountSessionWithLines = Prisma.InventoryCountSessionGetPayload<{ include: { lines: true } }>;
type CountSessionDetails = Prisma.InventoryCountSessionGetPayload<{
  include: {
    lines: { include: { item: { include: { barcodes: true } }; entries: true } };
    assignments: true;
    events: { orderBy: { createdAt: 'desc' } };
  };
}>;
type CountDetailLine = CountSessionDetails['lines'][number];
type CountEventType = Prisma.InventoryCountEventCreateInput['type'];

@Injectable()
export class CountsService {
  async list(user: AuthenticatedUser) {
    requireInventory(user, 'VIEW_COUNTS');
    const rows = await prisma.inventoryCountSession.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: {
        _count: { select: { lines: true, assignments: true } },
        lines: { select: { status: true, recountRequired: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      ...r,
      progress: {
        total: r._count.lines,
        counted: r.lines.filter((l) => l.status !== 'NOT_COUNTED').length,
        recounts: r.lines.filter((l) => l.recountRequired).length,
      },
      permissions: this.permissions(user),
    }));
  }
  async get(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'VIEW_COUNTS');
    const row = await this.find(user, id);
    return this.present(user, row);
  }
  async create(user: AuthenticatedUser, input: CreateCountInput) {
    requireInventory(user, 'START_COUNTS');
    return this.serial(async (tx) => {
      const year = new Date().getFullYear();
      const seq = await tx.inventoryCountSequence.upsert({
        where: { organizationId_year: { organizationId: user.organizationId, year } },
        create: { organizationId: user.organizationId, year, nextValue: 2 },
        update: { nextValue: { increment: 1 } },
      });
      const session = await tx.inventoryCountSession.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          number: `COUNT-${year}-${String(seq.nextValue - 1).padStart(5, '0')}`,
          countType: input.countType,
          status: 'DRAFT',
          templateId: input.templateId ?? null,
          configurationSnapshot: input.configuration as Prisma.InputJsonValue,
          blindCount: input.blindCount,
          requireAllLines: input.requireAllLines,
          requireRecount: input.requireRecount,
          varianceQuantityThreshold: input.varianceQuantityThreshold
            ? D(input.varianceQuantityThreshold)
            : null,
          variancePercentThreshold: input.variancePercentThreshold
            ? D(input.variancePercentThreshold)
            : null,
          notes: input.notes ?? null,
          startedById: user.id,
        },
      });
      await this.event(tx, user, session.id, 'CREATED');
      if (input.startImmediately) return this.beginTx(tx, user, session.id);
      return session;
    });
  }
  async begin(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'START_COUNTS');
    return this.serial((tx) => this.beginTx(tx, user, id));
  }
  async enter(user: AuthenticatedUser, id: string, lineId: string, input: CountEntryInput) {
    requireInventory(user, 'PARTICIPATE_COUNTS');
    return this.serial(async (tx) => {
      const session = await tx.inventoryCountSession.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          status: { in: ['IN_PROGRESS', 'RECOUNT_REQUIRED'] },
        },
      });
      if (!session) throw new ConflictException('This count is not open for entry.');
      const line = await tx.inventoryCountLine.findFirst({
        where: { id: lineId, sessionId: id },
        include: { entries: true },
      });
      if (!line) throw new NotFoundException('Count line not found');
      const quantity = D(input.quantity);
      if (quantity.isNegative())
        throw new BadRequestException('Counted quantity cannot be negative.');
      const attempt = line.entries.length + 1;
      const entry = await tx.inventoryCountEntry.create({
        data: {
          countLineId: line.id,
          attemptNumber: attempt,
          quantity,
          enteredById: user.id,
          method: input.method,
          notes: input.notes ?? null,
          ...(input.deviceMetadata === undefined
            ? {}
            : { deviceMetadata: input.deviceMetadata as Prisma.InputJsonValue }),
        },
      });
      const variance = quantity.minus(line.expectedQuantitySnapshot),
        pct = line.expectedQuantitySnapshot.isZero()
          ? null
          : variance.abs().div(line.expectedQuantitySnapshot.abs()).mul(100);
      const recount = this.threshold(session, variance, pct);
      await tx.inventoryCountLine.update({
        where: { id: line.id },
        data: {
          firstCountedQuantity: line.firstCountedQuantity ?? quantity,
          finalCountedQuantity: quantity,
          varianceQuantity: variance,
          variancePercentage: pct,
          status: recount ? 'RECOUNT_REQUIRED' : 'COUNTED',
          recountRequired: recount,
          countedById: user.id,
          countedAt: new Date(),
          ...(attempt > 1 ? { recountReason: null } : {}),
        },
      });
      await this.event(tx, user, id, attempt > 1 ? 'RECOUNT_COMPLETED' : 'LINE_COUNTED', line.id, {
        attempt,
        method: input.method,
      });
      return entry;
    });
  }
  async scan(user: AuthenticatedUser, id: string, query: string) {
    requireInventory(user, 'PARTICIPATE_COUNTS');
    const session = await this.find(user, id);
    if (!['IN_PROGRESS', 'RECOUNT_REQUIRED'].includes(session.status))
      throw new ConflictException('This count is not open for scanning.');
    const q = query.trim();
    const matches = session.lines.filter(
      (l) =>
        l.item.sku?.toLowerCase() === q.toLowerCase() ||
        l.item.barcodes.some((b) => b.value === q) ||
        l.item.name.toLowerCase() === q.toLowerCase() ||
        l.item.name.toLowerCase().includes(q.toLowerCase()),
    );
    return {
      exact: matches.filter(
        (l) =>
          l.item.sku?.toLowerCase() === q.toLowerCase() ||
          l.item.barcodes.some((b) => b.value === q),
      ),
      matches: matches.slice(0, 20).map((l) => this.presentLine(user, session, l)),
      multipleContext: matches.length > 1,
    };
  }
  async submit(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'PARTICIPATE_COUNTS');
    return this.serial(async (tx) => {
      const session = await tx.inventoryCountSession.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          status: { in: ['IN_PROGRESS', 'RECOUNT_REQUIRED'] },
        },
        include: { lines: true },
      });
      if (!session)
        throw new ConflictException('Count cannot be submitted from its current state.');
      if (session.requireAllLines && session.lines.some((l) => !l.finalCountedQuantity))
        throw new ConflictException('All count lines must be completed before submission.');
      for (const line of session.lines.filter((l) => l.finalCountedQuantity !== null)) {
        const currentExpected = await this.adjustedExpected(tx, session, line);
        const variance = line.finalCountedQuantity!.minus(currentExpected);
        const pct = currentExpected.isZero()
          ? null
          : variance.abs().div(currentExpected.abs()).mul(100);
        const recount = session.requireRecount && this.threshold(session, variance, pct);
        await tx.inventoryCountLine.update({
          where: { id: line.id },
          data: {
            varianceQuantity: variance,
            variancePercentage: pct,
            recountRequired: recount,
            status: recount ? 'RECOUNT_REQUIRED' : 'COUNTED',
          },
        });
      }
      const remaining = await tx.inventoryCountLine.count({
        where: { sessionId: id, recountRequired: true },
      });
      const status = remaining ? 'RECOUNT_REQUIRED' : 'SUBMITTED';
      const updated = await tx.inventoryCountSession.update({
        where: { id },
        data: { status, submittedById: user.id, submittedAt: new Date() },
      });
      await this.event(tx, user, id, 'SUBMITTED', null, { recounts: remaining });
      return updated;
    });
  }
  async requestRecount(user: AuthenticatedUser, id: string, input: RecountInput) {
    requireInventory(user, 'REQUEST_RECOUNT');
    return this.serial(async (tx) => {
      const session = await tx.inventoryCountSession.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          status: { in: ['SUBMITTED', 'RECOUNT_REQUIRED'] },
        },
      });
      if (!session) throw new ConflictException('Recount cannot be requested now.');
      const changed = await tx.inventoryCountLine.updateMany({
        where: { id: { in: input.lineIds }, sessionId: id },
        data: { recountRequired: true, recountReason: input.reason, status: 'RECOUNT_REQUIRED' },
      });
      if (changed.count !== input.lineIds.length)
        throw new NotFoundException('One or more count lines were not found.');
      await tx.inventoryCountSession.update({
        where: { id },
        data: { status: 'RECOUNT_REQUIRED' },
      });
      await this.event(tx, user, id, 'RECOUNT_REQUESTED', null, {
        lineIds: input.lineIds,
        reason: input.reason,
      });
      return { count: changed.count };
    });
  }
  async reviewLine(user: AuthenticatedUser, id: string, lineId: string, input: ReviewLineInput) {
    requireInventory(user, 'REVIEW_COUNTS');
    return this.serial(async (tx) => {
      const session = await tx.inventoryCountSession.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          status: { in: ['SUBMITTED', 'RECOUNT_REQUIRED'] },
        },
      });
      if (!session) throw new ConflictException('This count is not awaiting review.');
      const line = await tx.inventoryCountLine.findFirst({ where: { id: lineId, sessionId: id } });
      if (!line) throw new NotFoundException('Count line not found');
      if (input.action === 'EXCLUDE' && !input.reason)
        throw new BadRequestException('A reason is required to exclude a line.');
      const updated = await tx.inventoryCountLine.update({
        where: { id: lineId },
        data: {
          status: input.action === 'ACCEPT' ? 'ACCEPTED' : 'EXCLUDED',
          recountRequired: false,
          recountReason: input.reason ?? null,
          notes: input.reason ?? line.notes,
        },
      });
      const remaining = await tx.inventoryCountLine.count({
        where: { sessionId: id, recountRequired: true },
      });
      if (!remaining)
        await tx.inventoryCountSession.update({ where: { id }, data: { status: 'SUBMITTED' } });
      return updated;
    });
  }
  async approve(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'APPROVE_COUNTS');
    return this.serial(async (tx) => {
      const session = await tx.inventoryCountSession.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          status: 'SUBMITTED',
        },
        include: { lines: true },
      });
      if (!session) throw new ConflictException('Only a submitted count can be approved.');
      if (
        session.lines.some(
          (l) => l.recountRequired || !['COUNTED', 'ACCEPTED', 'EXCLUDED'].includes(l.status),
        )
      )
        throw new ConflictException('Resolve all recounts and uncounted lines before approval.');
      const updated = await tx.inventoryCountSession.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
      });
      await this.event(tx, user, id, 'APPROVED');
      return updated;
    });
  }
  async post(user: AuthenticatedUser, id: string, input: PostCountInput) {
    requireInventory(user, 'POST_COUNTS');
    return this.serial(async (tx) => {
      const existing = await tx.inventoryCountSession.findFirst({
        where: { organizationId: user.organizationId, postingIdempotencyKey: input.idempotencyKey },
        include: { lines: true },
      });
      if (existing) return existing;
      const session = await tx.inventoryCountSession.findFirst({
        where: {
          id,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          status: 'APPROVED',
        },
        include: { lines: true },
      });
      if (!session) throw new ConflictException('Only an approved count can be posted.');
      for (const line of session.lines.filter((l) => l.status !== 'EXCLUDED'))
        await this.postLine(tx, user, session, line);
      const updated = await tx.inventoryCountSession.update({
        where: { id },
        data: {
          status: 'POSTED',
          postedById: user.id,
          postedAt: new Date(),
          postingIdempotencyKey: input.idempotencyKey,
        },
      });
      await this.event(tx, user, id, 'ADJUSTMENT_POSTED');
      return updated;
    });
  }
  async cancel(user: AuthenticatedUser, id: string, input: CancelCountInput) {
    requireInventory(user, 'CANCEL_COUNTS');
    const session = await this.find(user, id);
    if (['POSTED', 'CANCELLED'].includes(session.status))
      throw new ConflictException('Posted or cancelled counts are immutable.');
    const updated = await prisma.inventoryCountSession.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledById: user.id,
        cancelledAt: new Date(),
        cancellationReason: input.reason,
      },
    });
    await prisma.inventoryCountEvent.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        sessionId: id,
        type: 'CANCELLED',
        actorId: user.id,
        details: { reason: input.reason },
      },
    });
    return updated;
  }
  async assign(user: AuthenticatedUser, id: string, input: AssignmentInput) {
    requireInventory(user, 'START_COUNTS');
    await this.get(user, id);
    const assignee = await prisma.user.findFirst({
      where: { id: input.assignedUserId, organizationId: user.organizationId },
    });
    if (!assignee) throw new NotFoundException('Assignee not found');
    const row = await prisma.inventoryCountAssignment.create({
      data: {
        sessionId: id,
        assignedUserId: input.assignedUserId,
        stockLocationId: input.stockLocationId ?? null,
        assignedById: user.id,
      },
    });
    await prisma.inventoryCountEvent.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        sessionId: id,
        type: 'USER_ASSIGNED',
        actorId: user.id,
        details: {
          assignedUserId: input.assignedUserId,
          stockLocationId: input.stockLocationId ?? null,
        },
      },
    });
    return row;
  }
  async templates(user: AuthenticatedUser) {
    requireInventory(user, 'VIEW_COUNTS');
    return prisma.inventoryCountTemplate.findMany({
      where: { organizationId: user.organizationId, clinicLocationId: user.locationId },
      orderBy: { name: 'asc' },
    });
  }
  async createTemplate(user: AuthenticatedUser, input: CountTemplateInput) {
    requireInventory(user, 'MANAGE_COUNT_TEMPLATES');
    return prisma.inventoryCountTemplate.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        name: input.name,
        description: input.description ?? null,
        countType: input.countType,
        configuration: input.configuration,
        includeDescendantLocations: input.configuration.includeDescendants,
        includeZeroBalanceItems: input.configuration.includeZeroBalance,
        includeQuarantinedLots: input.configuration.includeQuarantined,
        includeInactiveItems: input.includeInactiveItems,
        createdById: user.id,
      },
    });
  }
  private async beginTx(tx: Prisma.TransactionClient, user: AuthenticatedUser, id: string) {
    const session = await tx.inventoryCountSession.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        status: 'DRAFT',
      },
    });
    if (!session) throw new ConflictException('Only a draft count can begin.');
    const config = session.configurationSnapshot as CountConfiguration;
    const allLocations = await tx.stockLocation.findMany({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        isActive: true,
      },
    });
    let locationIds: string[] = config.stockLocationIds?.length
      ? config.stockLocationIds
      : allLocations.map((l) => l.id);
    if (config.includeDescendants && config.stockLocationIds?.length) {
      let changed = true;
      while (changed) {
        const before = locationIds.length;
        locationIds.push(
          ...allLocations
            .filter((l) => l.parentId && locationIds.includes(l.parentId))
            .map((l) => l.id),
        );
        locationIds = [...new Set(locationIds)];
        changed = locationIds.length > before;
      }
    }
    const items = await tx.catalogItem.findMany({
      where: {
        organizationId: user.organizationId,
        status: 'ACTIVE',
        inventoryTracked: true,
        controlledSubstance: false,
        ...(config.itemIds?.length ? { id: { in: config.itemIds } } : {}),
        ...(config.itemTypes?.length
          ? { primaryType: { in: config.itemTypes as CatalogItemType[] } }
          : {}),
        ...(config.routes?.length ? { route: { in: config.routes } } : {}),
        ...(config.therapeuticClasses?.length
          ? { therapeuticClass: { in: config.therapeuticClasses } }
          : {}),
        ...(config.tags?.length ? { tags: { hasSome: config.tags } } : {}),
      },
      include: {
        barcodes: true,
        conversions: { where: { isActive: true }, take: 1 },
        balances: { where: { stockLocationId: { in: locationIds } }, include: { lot: true } },
      },
    });
    const lines: Prisma.InventoryCountLineCreateManyInput[] = [];
    for (const item of items) {
      for (const b of item.balances.filter(
        (b) => config.includeQuarantined || D(b.quarantined).isZero(),
      ))
        lines.push({
          sessionId: id,
          itemId: item.id,
          stockLocationId: b.stockLocationId,
          lotId: b.lotId,
          itemNameSnapshot: item.name,
          skuSnapshot: item.sku,
          barcodeSnapshot: item.barcodes.map((x) => x.value),
          baseUnitSnapshot: item.conversions[0]?.stockUnit ?? 'unit',
          lotNumberSnapshot: b.lot?.lotNumber ?? null,
          expirationSnapshot: b.lot?.expirationDate ?? null,
          lotStatusSnapshot: b.lot?.status ?? null,
          expectedQuantitySnapshot: b.onHand,
        });
      if (config.includeZeroBalance && item.balances.length === 0 && locationIds[0])
        lines.push({
          sessionId: id,
          itemId: item.id,
          stockLocationId: locationIds[0],
          itemNameSnapshot: item.name,
          skuSnapshot: item.sku,
          barcodeSnapshot: item.barcodes.map((x) => x.value),
          baseUnitSnapshot: item.conversions[0]?.stockUnit ?? 'unit',
          expectedQuantitySnapshot: 0,
        });
    }
    if (lines.length) await tx.inventoryCountLine.createMany({ data: lines, skipDuplicates: true });
    const now = new Date();
    const updated = await tx.inventoryCountSession.update({
      where: { id },
      data: { status: 'IN_PROGRESS', startedAt: now, expectedSnapshotAt: now },
    });
    await this.event(tx, user, id, 'STARTED');
    await this.event(tx, user, id, 'SCOPE_FROZEN', null, {
      lineCount: lines.length,
      controlledItemsExcluded: true,
    });
    return updated;
  }
  private async postLine(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    session: CountSessionWithLines,
    line: CountLine,
  ) {
    if (line.finalCountedQuantity === null)
      throw new ConflictException(`Line ${line.itemNameSnapshot} has no final count.`);
    const item = await tx.catalogItem.findFirst({
      where: { id: line.itemId, organizationId: user.organizationId },
    });
    if (!item || item.controlledSubstance)
      throw new ConflictException(
        `${line.itemNameSnapshot} cannot be posted through standard counts.`,
      );
    const location = await tx.stockLocation.findFirst({
      where: {
        id: line.stockLocationId,
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        isActive: true,
      },
    });
    if (!location)
      throw new ConflictException(`Location for ${line.itemNameSnapshot} is inaccessible.`);
    let balance = await tx.stockBalance.findFirst({
      where: { itemId: line.itemId, stockLocationId: line.stockLocationId, lotId: line.lotId },
    });
    const previous = balance?.onHand ?? D(0),
      delta = line.finalCountedQuantity.minus(previous),
      result = previous.plus(delta);
    if (result.isNegative())
      throw new ConflictException(
        `Posting ${line.itemNameSnapshot} would create negative inventory.`,
      );
    if (balance)
      balance = await tx.stockBalance.update({
        where: { id: balance.id },
        data: { onHand: result },
      });
    else
      balance = await tx.stockBalance.create({
        data: {
          organizationId: user.organizationId,
          itemId: line.itemId,
          stockLocationId: line.stockLocationId,
          lotId: line.lotId,
          onHand: result,
        },
      });
    if (line.lotId)
      await tx.inventoryLot.update({ where: { id: line.lotId }, data: { quantity: result } });
    const tr = await tx.inventoryTransaction.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        itemId: line.itemId,
        lotId: line.lotId,
        stockLocationId: line.stockLocationId,
        transactionGroupId: randomUUID(),
        transactionType: 'INVENTORY_COUNT_ADJUSTMENT',
        quantityDelta: delta,
        previousBalance: previous,
        resultingBalance: result,
        reason: 'INVENTORY_COUNT',
        otherReference: session.number,
        countSessionId: session.id,
        countLineId: line.id,
        userId: user.id,
      },
    });
    await tx.inventoryCountLine.update({
      where: { id: line.id },
      data: { postedTransactionId: tr.id, status: 'ACCEPTED', varianceQuantity: delta },
    });
  }
  private async adjustedExpected(
    tx: Prisma.TransactionClient,
    session: CountSession,
    line: CountLine,
  ) {
    const agg = await tx.inventoryTransaction.aggregate({
      where: {
        organizationId: session.organizationId,
        clinicLocationId: session.clinicLocationId,
        itemId: line.itemId,
        stockLocationId: line.stockLocationId,
        lotId: line.lotId,
        createdAt: { gt: session.expectedSnapshotAt! },
      },
      _sum: { quantityDelta: true },
    });
    return line.expectedQuantitySnapshot.plus(agg._sum?.quantityDelta ?? 0);
  }
  private threshold(session: CountSession, variance: Prisma.Decimal, pct: Prisma.Decimal | null) {
    return Boolean(
      (session.varianceQuantityThreshold && variance.abs().gt(session.varianceQuantityThreshold)) ||
      (session.variancePercentThreshold && pct && pct.gt(session.variancePercentThreshold)),
    );
  }
  private async find(user: AuthenticatedUser, id: string) {
    const row = await prisma.inventoryCountSession.findFirst({
      where: { id, organizationId: user.organizationId, clinicLocationId: user.locationId },
      include: {
        lines: { include: { item: { include: { barcodes: true } }, entries: true } },
        assignments: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Inventory count not found');
    return row;
  }
  private present(user: AuthenticatedUser, row: CountSessionDetails) {
    const showExpected =
      !row.blindCount ||
      (['SUBMITTED', 'RECOUNT_REQUIRED', 'APPROVED', 'POSTED'].includes(row.status) &&
        canInventory(user, 'REVIEW_COUNTS'));
    return {
      ...row,
      lines: row.lines.map((line) => this.presentLine(user, row, line, showExpected)),
      permissions: this.permissions(user),
    };
  }
  private presentLine(
    user: AuthenticatedUser,
    session: CountSession,
    line: CountDetailLine,
    showExpected = false,
  ) {
    if (showExpected) return line;
    const {
      expectedQuantitySnapshot: _e,
      varianceQuantity: _v,
      variancePercentage: _p,
      ...safe
    } = line;
    return safe;
  }
  private permissions(user: AuthenticatedUser) {
    return {
      canStart: canInventory(user, 'START_COUNTS'),
      canParticipate: canInventory(user, 'PARTICIPATE_COUNTS'),
      canReview: canInventory(user, 'REVIEW_COUNTS'),
      canApprove: canInventory(user, 'APPROVE_COUNTS'),
      canPost: canInventory(user, 'POST_COUNTS'),
      canManageTemplates: canInventory(user, 'MANAGE_COUNT_TEMPLATES'),
      canViewCosts: canInventory(user, 'VIEW_COUNT_COST'),
    };
  }
  private event(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    sessionId: string,
    type: CountEventType,
    lineId: string | null = null,
    details: Prisma.InputJsonValue | null = null,
  ) {
    return tx.inventoryCountEvent.create({
      data: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        sessionId,
        lineId,
        type,
        actorId: user.id,
        details: details as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      },
    });
  }
  private async serial<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let i = 0; i < 3; i++)
      try {
        return await prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2034' || i === 2)
          throw e;
      }
    throw new ConflictException('Concurrent count update failed; retry.');
  }
}
