import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  prisma,
  type Prisma,
  type UserRole,
  type VisitPhase,
  type VisitState,
  type VisitTransitionSource,
  type VisitWorkItemType,
} from '@sparki/db';
import { workflowStatusKey } from '@sparki/config';

export const VISIT_LIFECYCLE_INCLUDE = {
  patient: true,
  client: true,
  appointment: true,
  primaryVeterinarian: true,
  assignedTechnician: true,
  currentOwner: true,
  intake: true,
  examFindings: true,
  workItems: { orderBy: { createdAt: 'asc' as const } },
  exceptions: { where: { resolvedAt: null }, orderBy: { createdAt: 'asc' as const } },
  handoffs: { orderBy: { createdAt: 'desc' as const }, take: 10 },
  signoffDelegates: { include: { delegate: true } },
  soapNotes: { orderBy: { createdAt: 'desc' as const } },
  discharge: true,
  checkout: true,
  workflowStep: true,
} satisfies Prisma.VisitInclude;

export interface VisitTransitionCommand {
  visitId: string;
  organizationId: string;
  locationId: string;
  actorId: string;
  actorRole: UserRole;
  expectedStates: VisitState[];
  toState: VisitState;
  toPhase: VisitPhase;
  reason?: string;
  source?: VisitTransitionSource;
  requestId?: string;
  currentOwnerId?: string | null;
  nextAction?: string | null;
  timestamps?: Partial<Pick<
    Prisma.VisitUpdateInput,
    'arrivedAt' | 'intakeStartedAt' | 'examStartedAt' | 'dischargeReadyAt' | 'departedAt' | 'closedAt' | 'archivedAt'
  >>;
  createWorkItems?: Array<{
    type: VisitWorkItemType;
    title: string;
    assigneeId?: string | null;
    assigneeRole?: UserRole | null;
    dueAt?: Date | null;
  }>;
  completeWorkItemTypes?: VisitWorkItemType[];
  handoff?: {
    toUserId?: string | null;
    toRole?: UserRole | null;
    summary: string;
  };
  metadata?: Prisma.InputJsonValue;
  createException?: {
    type: string;
    severity: 'Info' | 'Warning' | 'Critical';
    reason: string;
    nextAction: string;
    ownerId?: string | null;
    dueAt?: Date | null;
  };
  resolveExceptionTypes?: string[];
  workflowStepId?: string | null;
}

@Injectable()
export class VisitLifecycleService {
  async transition(command: VisitTransitionCommand) {
    return prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findFirst({
        where: {
          id: command.visitId,
          organizationId: command.organizationId,
          locationId: command.locationId,
        },
        include: { intake: true, examFindings: true, discharge: true, checkout: true },
      });
      if (!visit) throw new NotFoundException(`Visit ${command.visitId} not found`);
      if (!command.expectedStates.includes(visit.state)) {
        throw new ConflictException(
          `Visit changed while you were viewing it. It is currently ${visit.state}. Refresh and try again.`,
        );
      }

      assertVisitTransitionRequirements(visit, command.toState);

      const workflowStepId = command.workflowStepId !== undefined
        ? command.workflowStepId
        : await resolveWorkflowStepId(tx, command.organizationId, command.locationId, command.toState, command.toPhase);

      const changed = await tx.visit.updateMany({
        where: {
          id: visit.id,
          organizationId: command.organizationId,
          locationId: command.locationId,
          version: visit.version,
          state: visit.state,
        },
        data: {
          state: command.toState,
          phase: command.toPhase,
          version: { increment: 1 },
          lastUpdatedById: command.actorId,
          ...(command.currentOwnerId !== undefined ? { currentOwnerId: command.currentOwnerId } : {}),
          ...(command.nextAction !== undefined ? { nextAction: command.nextAction } : {}),
          workflowStepId,
          ...(command.timestamps ?? {}),
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('This visit was updated by someone else. Refresh and try again.');
      }

      await tx.visitTransition.create({
        data: {
          organizationId: command.organizationId,
          locationId: command.locationId,
          visitId: visit.id,
          actorId: command.actorId,
          source: command.source ?? 'User',
          fromPhase: visit.phase,
          toPhase: command.toPhase,
          fromState: visit.state,
          toState: command.toState,
          reason: command.reason?.trim() || null,
          requestId: command.requestId ?? null,
          ...(command.metadata !== undefined ? { metadata: command.metadata } : {}),
        },
      });

      if (command.completeWorkItemTypes?.length) {
        await tx.visitWorkItem.updateMany({
          where: {
            visitId: visit.id,
            type: { in: command.completeWorkItemTypes },
            status: { in: ['Pending', 'InProgress'] },
          },
          data: { status: 'Completed', completedAt: new Date(), completedById: command.actorId },
        });
      }

      for (const item of command.createWorkItems ?? []) {
        const existing = await tx.visitWorkItem.findFirst({
          where: { visitId: visit.id, type: item.type, status: { in: ['Pending', 'InProgress'] } },
        });
        if (!existing) {
          await tx.visitWorkItem.create({
            data: {
              organizationId: command.organizationId,
              locationId: command.locationId,
              visitId: visit.id,
              type: item.type,
              title: item.title,
              assigneeId: item.assigneeId ?? null,
              assigneeRole: item.assigneeRole ?? null,
              dueAt: item.dueAt ?? null,
            },
          });
        }
      }

      if (command.handoff) {
        await tx.visitHandoff.create({
          data: {
            organizationId: command.organizationId,
            locationId: command.locationId,
            visitId: visit.id,
            fromUserId: visit.currentOwnerId,
            toUserId: command.handoff.toUserId ?? null,
            toRole: command.handoff.toRole ?? null,
            summary: command.handoff.summary,
            createdById: command.actorId,
          },
        });
      }

      if (command.createException) {
        await tx.visitException.create({
          data: {
            organizationId: command.organizationId,
            locationId: command.locationId,
            visitId: visit.id,
            type: command.createException.type,
            severity: command.createException.severity,
            reason: command.createException.reason,
            nextAction: command.createException.nextAction,
            ownerId: command.createException.ownerId ?? null,
            dueAt: command.createException.dueAt ?? null,
            createdById: command.actorId,
          },
        });
      }

      if (command.resolveExceptionTypes?.length) {
        await tx.visitException.updateMany({
          where: {
            visitId: visit.id,
            type: { in: command.resolveExceptionTypes },
            resolvedAt: null,
          },
          data: {
            resolvedAt: new Date(),
            resolvedById: command.actorId,
            resolution: command.reason?.trim() || 'Required work completed',
          },
        });
      }

      return tx.visit.findUniqueOrThrow({ where: { id: visit.id }, include: VISIT_LIFECYCLE_INCLUDE });
    }, { isolationLevel: 'Serializable' });
  }

}

async function resolveWorkflowStepId(
  tx: Prisma.TransactionClient,
  organizationId: string,
  locationId: string,
  state: VisitState,
  phase: VisitPhase,
) {
  const canonicalStatus = workflowStatusKey('visit', state);
  const canonical = canonicalStatus ? await tx.dashboardStatusColorSetting.findFirst({
    where: { organizationId, locationId, status: canonicalStatus, isEnabled: true },
    select: { id: true },
  }) : null;
  if (canonical) return canonical.id;
  const phaseDefault = await tx.dashboardStatusColorSetting.findFirst({
    where: { organizationId, locationId, lifecyclePhase: phase, isEnabled: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return phaseDefault?.id ?? null;
}

export function assertVisitTransitionRequirements(
  visit: {
    visitType: string;
    intake: { completedAt: Date | null } | null;
    examFindings: { completedAt: Date | null } | null;
    discharge?: unknown | null;
    checkout?: unknown | null;
  },
  target: VisitState,
) {
  if (target === 'VeterinarianExamReady' && !visit.intake?.completedAt) {
    throw new ConflictException('Complete intake before sending this patient to the veterinarian.');
  }
  if (target === 'PlanDrafted' && !visit.examFindings?.completedAt) {
    throw new ConflictException('Complete the veterinarian exam before finalizing the care plan.');
  }
  if (target === 'TreatmentPending' && !['TechnicianAppointment', 'Emergency'].includes(visit.visitType) && !visit.examFindings?.completedAt) {
    throw new ConflictException('A veterinarian exam is required before treatment for this visit.');
  }
  if (target === 'CheckoutReady') {
    if (!visit.intake?.completedAt) throw new ConflictException('Complete intake before moving to discharge.');
    if (visit.visitType !== 'TechnicianAppointment' && !visit.examFindings?.completedAt) {
      throw new ConflictException('Complete the veterinarian exam before moving to discharge.');
    }
  }
  if (target === 'RecordCompletionPending' && (!visit.discharge || !visit.checkout)) {
    throw new ConflictException('Complete discharge and checkout before moving to record closure.');
  }
}
