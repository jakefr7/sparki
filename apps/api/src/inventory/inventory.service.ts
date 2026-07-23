import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma } from '@sparki/db';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/types';
import type {
  ActivityQuery,
  AdjustmentInput,
  InventoryQuery,
  ItemInput,
  UpdateItemInput,
} from './dto/inventory.schema';
import { canInventory, requireInventory } from './inventory.permissions';

const scopedInclude = (locationId: string) =>
  ({
    barcodes: true,
    conversions: { orderBy: { effectiveFrom: 'desc' as const } },
    lots: {
      where: { stockLocation: { clinicLocationId: locationId } },
      include: { stockLocation: true },
    },
    balances: {
      where: { stockLocation: { clinicLocationId: locationId } },
      include: {
        stockLocation: true,
        lot: { select: { id: true, lotNumber: true, expirationDate: true, status: true } },
      },
    },
    documents: true,
    transactions: { where: { clinicLocationId: locationId } },
    countLines: {
      where: { session: { clinicLocationId: locationId, status: 'POSTED' } },
      include: { session: { select: { id: true, number: true, postedAt: true } } },
      orderBy: { updatedAt: 'desc' as const },
      take: 10,
    },
  }) as const;
const money = (value: string | null | undefined) =>
  value == null || value === '' ? null : new Prisma.Decimal(value);
const decimalEqual = (current: Prisma.Decimal | null, next: string | null | undefined) =>
  current === null ? next == null || next === '' : next != null && next !== '' && current.eq(next);
export const availableQuantity = (b: {
  onHand: Prisma.Decimal;
  quarantined: Prisma.Decimal;
  expired: Prisma.Decimal;
  reserved: Prisma.Decimal;
}) => b.onHand.minus(b.quarantined).minus(b.expired).minus(b.reserved);
export const adjustmentAmounts = (
  previous: Prisma.Decimal,
  entered: Prisma.Decimal,
  mode: 'DELTA' | 'COUNTED',
) => {
  const delta = mode === 'COUNTED' ? entered.minus(previous) : entered;
  return { delta, resulting: previous.plus(delta) };
};

@Injectable()
export class InventoryService {
  async list(user: AuthenticatedUser, query: InventoryQuery) {
    requireInventory(user, 'VIEW');
    const controlledAccess = await this.hasControlledAccess(user);
    const items = await prisma.catalogItem.findMany({
      where: {
        organizationId: user.organizationId,
        ...(controlledAccess ? {} : { controlledSubstance: false }),
        AND: [
          { OR: [{ locationId: null }, { locationId: user.locationId }] },
          ...(query.search
            ? [
                {
                  OR: [
                    { name: { contains: query.search, mode: 'insensitive' as const } },
                    { sku: { contains: query.search, mode: 'insensitive' as const } },
                    {
                      barcodes: {
                        some: { value: { contains: query.search, mode: 'insensitive' as const } },
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
        ...(query.type ? { primaryType: query.type as never } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      },
      include: scopedInclude(user.locationId),
      orderBy: { name: 'asc' },
    });
    return items.map((item) => this.present(user, item));
  }

  async get(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'VIEW');
    const item = await this.findItem(user, id);
    if (item.controlledSubstance && !(await this.hasControlledAccess(user)))
      throw new NotFoundException('Inventory item not found');
    return this.present(user, item);
  }

  async overview(user: AuthenticatedUser) {
    const items = await this.list(user, {});
    const now = new Date();
    const day90 = new Date(now.getTime() + 90 * 86400000);
    const attention = items.flatMap((item) =>
      item.attention.map((message) => ({ itemId: item.id, itemName: item.name, message })),
    );
    const recent = await prisma.inventoryTransaction.count({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        createdAt: { gte: new Date(now.getTime() - 7 * 86400000) },
      },
    });
    const [openOrders, pendingApproval, partiallyReceived, overdueDeliveries, receiptIssues] =
      await Promise.all([
        prisma.purchaseOrder.count({
          where: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            status: { in: ['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'] },
          },
        }),
        prisma.purchaseOrder.count({
          where: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            status: 'PENDING_APPROVAL',
          },
        }),
        prisma.purchaseOrder.count({
          where: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            status: 'PARTIALLY_RECEIVED',
          },
        }),
        prisma.purchaseOrder.count({
          where: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] },
            expectedDate: { lt: now },
          },
        }),
        prisma.inventoryReceiptLine.count({
          where: {
            receipt: { organizationId: user.organizationId, clinicLocationId: user.locationId },
            OR: [{ rejectedQuantity: { gt: 0 } }, { quarantinedQuantity: { gt: 0 } }],
          },
        }),
      ]);
    const [activeCounts, countsAwaitingReview, recountsRequired, unresolvedVariances, lastFull] =
      await Promise.all([
        prisma.inventoryCountSession.count({
          where: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            status: { in: ['DRAFT', 'IN_PROGRESS'] },
          },
        }),
        prisma.inventoryCountSession.count({
          where: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            status: { in: ['SUBMITTED', 'APPROVED'] },
          },
        }),
        prisma.inventoryCountSession.count({
          where: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            status: 'RECOUNT_REQUIRED',
          },
        }),
        prisma.inventoryCountLine.count({
          where: {
            session: {
              organizationId: user.organizationId,
              clinicLocationId: user.locationId,
              status: { in: ['SUBMITTED', 'RECOUNT_REQUIRED'] },
            },
            varianceQuantity: { not: 0 },
          },
        }),
        prisma.inventoryCountSession.findFirst({
          where: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            countType: 'FULL',
            status: 'POSTED',
          },
          orderBy: { postedAt: 'desc' },
          select: { postedAt: true },
        }),
      ]);
    return {
      metrics: {
        needsAttention: attention.length,
        lowOrOut: items.filter((i) => i.attention.some((a) => /stock|balance/i.test(a))).length,
        expiringSoon: items.filter((i) => i.nextExpiration && new Date(i.nextExpiration) <= day90)
          .length,
        totalActiveItems: items.filter((i) => i.status === 'ACTIVE').length,
        recentAdjustments: recent,
        openOrders,
        pendingApproval,
        partiallyReceived,
        overdueDeliveries,
        receiptIssues,
        activeCounts,
        countsAwaitingReview,
        recountsRequired,
        unresolvedVariances,
      },
      attention,
      lastFullCountDate: lastFull?.postedAt ?? null,
    };
  }

  async create(user: AuthenticatedUser, input: ItemInput) {
    requireInventory(user, 'EDIT_ITEMS');
    try {
      return await prisma.$transaction(async (tx) => {
        const item = await tx.catalogItem.create({
          data: {
            organizationId: user.organizationId,
            locationId: user.locationId,
            name: input.name,
            description: input.description ?? null,
            primaryType: input.primaryType,
            route: input.route ?? null,
            therapeuticClass: input.therapeuticClass ?? null,
            species: input.species,
            tags: input.tags,
            brand: input.brand ?? null,
            manufacturer: input.manufacturer ?? null,
            sku: input.sku || null,
            status: input.status,
            imageUrl: input.imageUrl ?? null,
            billable: input.billable,
            inventoryTracked: input.inventoryTracked,
            taxable: input.taxable,
            retailPrice: money(input.retailPrice),
            internalNotes: input.internalNotes ?? null,
            lotTracking: input.lotTracking,
            expirationTracking: input.expirationTracking,
            controlledSubstance: input.controlledSubstance,
            deaSchedule: input.deaSchedule ?? null,
            minimumStock: money(input.minimumStock),
            maximumStock: money(input.maximumStock),
            reorderPoint: money(input.reorderPoint),
            reorderQuantity: money(input.reorderQuantity),
            createdById: user.id,
            updatedById: user.id,
          },
        });
        if (input.barcodes.length)
          await tx.itemBarcode.createMany({
            data: input.barcodes.map((b) => ({
              ...b,
              unit: b.unit ?? null,
              organizationId: user.organizationId,
              itemId: item.id,
            })),
          });
        if (input.conversion)
          await tx.itemUnitConversion.create({
            data: {
              ...input.conversion,
              dispenseUnit: input.conversion.dispenseUnit ?? null,
              billingUnit: input.conversion.billingUnit ?? null,
              itemId: item.id,
              purchaseToStock: new Prisma.Decimal(input.conversion.purchaseToStock),
              stockToDispense: money(input.conversion.stockToDispense),
              stockToBilling: money(input.conversion.stockToBilling),
            },
          });
        return item;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('SKU or barcode is already in use in this organization.');
      throw error;
    }
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateItemInput) {
    requireInventory(user, 'EDIT_ITEMS');
    const current = await this.findItem(user, id);
    const { barcodes, conversion, ...data } = input;
    return prisma.$transaction(async (tx) => {
      if (barcodes) {
        await tx.itemBarcode.deleteMany({ where: { itemId: id } });
        if (barcodes.length)
          await tx.itemBarcode.createMany({
            data: barcodes.map((b) => ({
              ...b,
              unit: b.unit ?? null,
              organizationId: user.organizationId,
              itemId: id,
            })),
          });
      }
      if (conversion) {
        const active = current.conversions.find((candidate) => candidate.isActive);
        if (active && active.stockUnit !== conversion.stockUnit && current.transactions.length)
          throw new ConflictException(
            'The base stock unit cannot be changed after inventory transactions exist. Add a new compatible package conversion instead.',
          );
        const changed =
          !active ||
          active.purchaseUnit !== conversion.purchaseUnit ||
          active.stockUnit !== conversion.stockUnit ||
          active.dispenseUnit !== (conversion.dispenseUnit ?? null) ||
          active.billingUnit !== (conversion.billingUnit ?? null) ||
          !active.purchaseToStock.eq(conversion.purchaseToStock) ||
          !decimalEqual(active.stockToDispense, conversion.stockToDispense) ||
          !decimalEqual(active.stockToBilling, conversion.stockToBilling);
        if (changed) {
          if (active)
            await tx.itemUnitConversion.update({
              where: { id: active.id },
              data: { isActive: false, archivedAt: new Date() },
            });
          await tx.itemUnitConversion.create({
            data: {
              itemId: id,
              purchaseUnit: conversion.purchaseUnit,
              stockUnit: conversion.stockUnit,
              dispenseUnit: conversion.dispenseUnit ?? null,
              billingUnit: conversion.billingUnit ?? null,
              purchaseToStock: new Prisma.Decimal(conversion.purchaseToStock),
              stockToDispense: money(conversion.stockToDispense),
              stockToBilling: money(conversion.stockToBilling),
            },
          });
        }
      } else if (input.conversion === null && current.transactions.length)
        throw new ConflictException(
          'Unit conversions cannot be removed after inventory transactions exist. Add a new conversion instead.',
        );
      return tx.catalogItem.update({
        where: { id },
        data: {
          ...data,
          ...(data.sku !== undefined ? { sku: data.sku || null } : {}),
          ...(data.retailPrice !== undefined ? { retailPrice: money(data.retailPrice) } : {}),
          ...(data.minimumStock !== undefined ? { minimumStock: money(data.minimumStock) } : {}),
          ...(data.maximumStock !== undefined ? { maximumStock: money(data.maximumStock) } : {}),
          ...(data.reorderPoint !== undefined ? { reorderPoint: money(data.reorderPoint) } : {}),
          ...(data.reorderQuantity !== undefined
            ? { reorderQuantity: money(data.reorderQuantity) }
            : {}),
          updatedById: user.id,
        } as never,
      });
    });
  }

  async archive(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'ARCHIVE');
    const item = await this.findItem(user, id);
    if (item.controlledSubstance) {
      const blocked = await prisma.controlledDiscrepancyCase.count({
        where: {
          organizationId: user.organizationId,
          itemId: id,
          status: { notIn: ['RESOLVED', 'CLOSED_NO_ADJUSTMENT'] },
        },
      });
      if (blocked)
        throw new ConflictException(
          'Controlled items with unresolved compliance work cannot be archived.',
        );
    }
    return prisma.catalogItem.update({
      where: { id },
      data: { status: 'INACTIVE', archivedAt: new Date(), updatedById: user.id },
    });
  }
  async delete(user: AuthenticatedUser, id: string) {
    requireInventory(user, 'DELETE_UNUSED');
    await this.findItem(user, id);
    const history = await prisma.catalogItem.findUnique({
      where: { id },
      select: {
        _count: { select: { transactions: true, lots: true, balances: true, documents: true } },
      },
    });
    const reasons = Object.entries(history?._count ?? {})
      .filter(([, count]) => count > 0)
      .map(([name]) => name);
    if (reasons.length)
      throw new ConflictException(
        `This item cannot be deleted because it has ${reasons.join(', ')}. Archive it instead.`,
      );
    await prisma.catalogItem.delete({ where: { id } });
    return { id };
  }

  async locations(user: AuthenticatedUser) {
    requireInventory(user, 'VIEW');
    return prisma.stockLocation.findMany({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async adjust(user: AuthenticatedUser, input: AdjustmentInput) {
    requireInventory(user, 'ADJUST');
    return this.withSerializableRetry(async (tx) => {
      const item = await tx.catalogItem.findFirst({
        where: {
          id: input.itemId,
          organizationId: user.organizationId,
          OR: [{ locationId: null }, { locationId: user.locationId }],
        },
      });
      const location = await tx.stockLocation.findFirst({
        where: {
          id: input.stockLocationId,
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          isActive: true,
        },
      });
      if (!item || !location) throw new NotFoundException('Item or stock location not found');
      if (item.status !== 'ACTIVE')
        throw new ConflictException(
          'Archived or discontinued items cannot receive routine stock adjustments.',
        );
      if (!item.inventoryTracked)
        throw new BadRequestException('This item does not track inventory.');
      if (item.lotTracking && !input.lotId && !input.lotNumber)
        throw new BadRequestException('A lot number is required for this item.');
      if (item.expirationTracking && !input.lotId && !input.expirationDate)
        throw new BadRequestException('An expiration date is required for this item.');
      let lotId = input.lotId ?? null;
      if (lotId) {
        const lot = await tx.inventoryLot.findFirst({
          where: {
            id: lotId,
            itemId: item.id,
            organizationId: user.organizationId,
            stockLocationId: location.id,
          },
        });
        if (!lot) throw new NotFoundException('Lot not found');
      } else if (input.lotNumber) {
        const lot = await tx.inventoryLot.create({
          data: {
            organizationId: user.organizationId,
            itemId: item.id,
            stockLocationId: location.id,
            lotNumber: input.lotNumber,
            expirationDate: input.expirationDate ?? null,
          },
        });
        lotId = lot.id;
      }
      let balance = await tx.stockBalance.findFirst({
        where: { itemId: item.id, stockLocationId: location.id, lotId },
      });
      const previous = balance?.onHand ?? new Prisma.Decimal(0);
      const entered = new Prisma.Decimal(input.quantity);
      const { delta, resulting } = adjustmentAmounts(previous, entered, input.mode);
      if (resulting.isNegative())
        throw new BadRequestException(
          'This adjustment would create negative inventory. Correct the quantity or contact an inventory manager.',
        );
      const kind =
        input.reason === 'OPENING_BALANCE'
          ? 'OPENING_BALANCE'
          : input.reason === 'INVENTORY_COUNT'
            ? 'INVENTORY_COUNT_ADJUSTMENT'
            : input.reason === 'EXPIRED'
              ? 'EXPIRED'
              : input.reason === 'DAMAGED'
                ? 'DAMAGED'
                : input.reason === 'RETURNED'
                  ? 'RETURNED'
                  : 'MANUAL_ADJUSTMENT';
      if (balance)
        balance = await tx.stockBalance.update({
          where: { id: balance.id },
          data: {
            onHand: resulting,
            ...(kind === 'EXPIRED' ? { expired: { increment: delta.abs() } } : {}),
          },
        });
      else
        balance = await tx.stockBalance.create({
          data: {
            organizationId: user.organizationId,
            itemId: item.id,
            stockLocationId: location.id,
            lotId,
            onHand: resulting,
          },
        });
      if (lotId)
        await tx.inventoryLot.update({
          where: { id: lotId },
          data: { quantity: resulting, ...(kind === 'EXPIRED' ? { status: 'EXPIRED' } : {}) },
        });
      const transaction = await tx.inventoryTransaction.create({
        data: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          itemId: item.id,
          lotId,
          stockLocationId: location.id,
          transactionGroupId: randomUUID(),
          transactionType: kind,
          quantityDelta: delta,
          previousBalance: previous,
          resultingBalance: resulting,
          reason: input.reason,
          notes: input.notes ?? null,
          userId: user.id,
        },
      });
      return { transaction, balance: { ...balance, available: availableQuantity(balance) } };
    });
  }

  async activity(user: AuthenticatedUser, query: ActivityQuery) {
    requireInventory(user, 'AUDIT');
    return prisma.inventoryTransaction.findMany({
      where: {
        organizationId: user.organizationId,
        clinicLocationId: user.locationId,
        ...(query.itemId ? { itemId: query.itemId } : {}),
        ...(query.type ? { transactionType: query.type as never } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      include: {
        item: { select: { name: true } },
        stockLocation: { select: { name: true } },
        lot: { select: { lotNumber: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }

  private async findItem(user: AuthenticatedUser, id: string) {
    const item = await prisma.catalogItem.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
        OR: [{ locationId: null }, { locationId: user.locationId }],
      },
      include: scopedInclude(user.locationId),
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }
  private async hasControlledAccess(user: AuthenticatedUser) {
    return (
      (await prisma.controlledAuthorization.count({
        where: {
          organizationId: user.organizationId,
          clinicLocationId: user.locationId,
          userId: user.id,
          status: 'ACTIVE',
          effectiveDate: { lte: new Date() },
          OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }],
        },
      })) > 0
    );
  }
  private present<T extends Awaited<ReturnType<InventoryService['findItem']>>>(
    user: AuthenticatedUser,
    item: T,
  ) {
    const total = item.balances.reduce((sum, b) => sum.plus(b.onHand), new Prisma.Decimal(0));
    const availableTotal = item.balances.reduce(
      (sum, b) => sum.plus(availableQuantity(b)),
      new Prisma.Decimal(0),
    );
    const quarantined = item.balances.reduce(
      (sum, b) => sum.plus(b.quarantined),
      new Prisma.Decimal(0),
    );
    const expired = item.balances.reduce((sum, b) => sum.plus(b.expired), new Prisma.Decimal(0));
    const expirations = item.lots
      .filter((l) => l.expirationDate)
      .sort((a, b) => a.expirationDate!.getTime() - b.expirationDate!.getTime());
    const attention: string[] = [];
    if (item.inventoryTracked && total.eq(0)) attention.push('Out of stock');
    else if (item.reorderPoint && availableTotal.lte(item.reorderPoint))
      attention.push('Below reorder point');
    if (total.isNegative()) attention.push('Negative balance');
    for (const lot of item.lots) {
      if (lot.status === 'QUARANTINED' && lot.quantity.gt(0))
        attention.push(`Quarantined lot ${lot.lotNumber ?? 'unlabeled'}`);
      if (item.lotTracking && (!lot.lotNumber || (item.expirationTracking && !lot.expirationDate)))
        attention.push('Lot setup incomplete');
    }
    const next = expirations[0]?.expirationDate;
    if (next) {
      const days = Math.ceil((next.getTime() - Date.now()) / 86400000);
      if (days < 0) attention.push('Expired stock');
      else if (days <= 90)
        attention.push(`Expires within ${days <= 30 ? 30 : days <= 60 ? 60 : 90} days`);
    }
    const lots = item.lots.map((lot) =>
      canInventory(user, 'VIEW_COSTS')
        ? lot
        : (({ receivedUnitCost: _cost, ...safe }) => safe)(lot),
    );
    return {
      ...item,
      lots,
      onHand: total,
      available: availableTotal,
      quarantined,
      expired,
      nextExpiration: next ?? null,
      primaryLocation: item.balances[0]?.stockLocation.name ?? null,
      attention,
      countHistory: item.countLines,
      lastCount: item.countLines[0] ?? null,
      permissions: {
        canEdit: canInventory(user, 'EDIT_ITEMS'),
        canArchive: canInventory(user, 'ARCHIVE'),
        canDelete: canInventory(user, 'DELETE_UNUSED'),
        canViewCosts: canInventory(user, 'VIEW_COSTS'),
      },
    };
  }
  private async withSerializableRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new ConflictException(
      'Concurrent inventory adjustment could not be completed. Please retry.',
    );
  }
}
