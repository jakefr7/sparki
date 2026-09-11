import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  prisma,
  type UserRole,
  type VisitWorkItemStatus,
  type VisitWorkItemType,
} from '@sparki/db';
import type {
  CreateVisitWorkItemInput,
  UpdateVisitWorkItemInput,
} from './dto/visit-work-item.schema';
import { TERMINAL_VISIT_STATES } from './visit-states';
import { UsageService } from '../inventory/usage.service';

const CLINICAL_ORDER_TYPES: VisitWorkItemType[] = ['Diagnostic', 'Treatment', 'Medication'];

@Injectable()
export class VisitWorkItemsService {
  constructor(private readonly usage: UsageService) {}
  async create(
    visitId: string,
    organizationId: string,
    locationId: string,
    actorId: string,
    actorRole: UserRole,
    input: CreateVisitWorkItemInput,
  ) {
    if (
      CLINICAL_ORDER_TYPES.includes(input.type) &&
      !['OWNER', 'VETERINARIAN'].includes(actorRole)
    ) {
      throw new ForbiddenException(
        'Only a veterinarian may order diagnostics, treatment, or medication.',
      );
    }
    if (input.assigneeId) {
      const assignee = await prisma.user.findFirst({
        where: {
          id: input.assigneeId,
          organizationId,
          isActive: true,
          clinicLocationAccess: {
            some: { clinicLocationId: locationId, organizationId, isActive: true },
          },
        },
      });
      if (!assignee)
        throw new ConflictException('The selected assignee does not have access to this location.');
    }
    return prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findFirst({
        where: { id: visitId, organizationId, locationId },
      });
      if (!visit) throw new NotFoundException(`Visit ${visitId} not found`);
      if (TERMINAL_VISIT_STATES.includes(visit.state))
        throw new ConflictException('Work cannot be added to a closed visit.');
      const item = await tx.visitWorkItem.create({
        data: {
          organizationId,
          locationId,
          visitId,
          type: input.type,
          title: input.title,
          assigneeId: input.assigneeId ?? null,
          assigneeRole: input.assigneeRole ?? null,
          ...(input.plan
            ? {
                result: {
                  plan: JSON.parse(JSON.stringify(input.plan)) as Prisma.InputJsonValue,
                  orderedById: actorId,
                  orderedAt: new Date().toISOString(),
                },
              }
            : {}),
        },
      });
      await tx.visitWorkItemChange.create({
        data: {
          workItemId: item.id,
          visitId,
          actorId,
          toStatus: 'Pending',
          reason: 'Work item created',
        },
      });
      return item;
    });
  }

  async update(
    visitId: string,
    itemId: string,
    organizationId: string,
    locationId: string,
    actorId: string,
    actorRole: UserRole,
    input: UpdateVisitWorkItemInput,
  ) {
    const updated = await prisma.$transaction(
      async (tx) => {
        const item = await tx.visitWorkItem.findFirst({
          where: { id: itemId, visitId, organizationId, locationId },
          include: { visit: true },
        });
        if (!item) throw new NotFoundException('Visit work item not found.');
        if (TERMINAL_VISIT_STATES.includes(item.visit.state) && isVisitBoundWork(item.type)) {
          throw new ConflictException('Clinical work on a closed visit cannot be changed.');
        }
        assertMayUpdateWorkItem(
          item,
          actorId,
          actorRole,
          input.status,
          Boolean(input.clientDecision),
        );
        const priorResult = isJsonObject(item.result) ? item.result : {};
        const priorPlan = isJsonObject(priorResult.plan) ? priorResult.plan : {};
        const planChanged = Boolean(input.title || input.plan);
        const reopening = item.status === 'Completed' && input.status !== 'Completed';
        if (reopening && !input.reason)
          throw new ConflictException('A reason is required to reopen completed work.');
        const medicationReversal = item.type === 'Medication' && reopening;
        const pendingInventoryReconciliation =
          item.type === 'Medication' &&
          isJsonObject(item.result) &&
          item.result.requiresInventoryReconciliation === true;
        if (pendingInventoryReconciliation && input.status === 'Completed' && !input.reason) {
          throw new ConflictException(
            'Document how medication stock was reconciled before completing this item.',
          );
        }
        const workflowMetadata: Prisma.JsonObject = {
          ...priorResult,
          ...(input.clientDecision
            ? {
                clientDecision: {
                  ...input.clientDecision,
                  actorId,
                  attestedAt: new Date().toISOString(),
                },
              }
            : {}),
          ...(input.execution
            ? {
                execution: {
                  ...input.execution,
                  performerId: actorId,
                  recordedAt: new Date().toISOString(),
                },
              }
            : {}),
          ...(input.plan
            ? {
                plan: {
                  ...priorPlan,
                  ...input.plan,
                },
                planEditedById: actorId,
                planEditedAt: new Date().toISOString(),
              }
            : {}),
        };
        const metadata = medicationReversal
          ? {
              ...workflowMetadata,
              requiresInventoryReconciliation: true,
              action: 'Return medication to stock or document waste',
            }
          : pendingInventoryReconciliation && input.status === 'Completed'
            ? {
                ...workflowMetadata,
                requiresInventoryReconciliation: false,
                reconciliationNote: input.reason,
              }
            : item.type === 'Medication' && input.status === 'Completed' && !input.inventoryUsage
              ? {
                  ...workflowMetadata,
                  requiresInventoryReconciliation: true,
                  action: 'Inventory Reconciliation Required',
                }
              : Object.keys(workflowMetadata).length
                ? workflowMetadata
                : undefined;
        const changed = await tx.visitWorkItem.updateMany({
          where: { id: item.id, status: item.status },
          data: {
            status: input.status,
            title: input.title ?? item.title,
            completedAt: input.status === 'Completed' ? new Date() : null,
            completedById: input.status === 'Completed' ? actorId : null,
            ...(metadata ? { result: metadata } : {}),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('This work item changed elsewhere. Refresh and try again.');
        await tx.visitWorkItemChange.create({
          data: {
            workItemId: item.id,
            visitId,
            actorId,
            fromStatus: item.status,
            toStatus: input.status,
            reason: input.reason ?? (planChanged ? 'Care plan revised' : null),
            ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
          },
        });
        return tx.visitWorkItem.findUniqueOrThrow({ where: { id: item.id } });
      },
      { isolationLevel: 'Serializable' },
    );
    if (input.status === 'Completed' && input.inventoryUsage) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId } });
      const inventory = await this.usage.postUsage(
        {
          id: user.id,
          email: user.email,
          name: user.displayName ?? `${user.firstName} ${user.lastName}`,
          organizationId,
          locationId,
          role: actorRole,
          canManageAdminSettings: user.canManageAdminSettings,
          canFinalizeRecordsForOthers: user.canFinalizeRecordsForOthers,
        },
        { ...input.inventoryUsage, visitId, sourceRecordId: itemId },
      );
      return { ...updated, inventoryUsage: inventory };
    }
    return updated;
  }
}

function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isVisitBoundWork(type: VisitWorkItemType) {
  return [
    'IntakeCompletion',
    'Diagnostic',
    'Estimate',
    'ClientApproval',
    'Treatment',
    'Medication',
    'ClientCommunication',
    'Discharge',
    'RecordSignoff',
  ].includes(type);
}

function assertMayUpdateWorkItem(
  item: { type: VisitWorkItemType; assigneeId: string | null; assigneeRole: UserRole | null },
  actorId: string,
  actorRole: UserRole,
  target: VisitWorkItemStatus,
  recordingClientDecision = false,
) {
  if (actorRole === 'OWNER') return;
  const assigned = item.assigneeId === actorId || item.assigneeRole === actorRole;
  if (CLINICAL_ORDER_TYPES.includes(item.type)) {
    if (
      ['Declined', 'Deferred', 'Cancelled', 'Pending'].includes(target) &&
      !recordingClientDecision &&
      actorRole !== 'VETERINARIAN'
    ) {
      throw new ForbiddenException(
        'Only a veterinarian may change or reverse an ordered clinical item.',
      );
    }
    if (!assigned && actorRole !== 'VETERINARIAN') {
      throw new ForbiddenException('This clinical work item is not assigned to you.');
    }
    return;
  }
  if (!assigned && !['PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN'].includes(actorRole)) {
    throw new ForbiddenException('This work item is not assigned to you.');
  }
}
