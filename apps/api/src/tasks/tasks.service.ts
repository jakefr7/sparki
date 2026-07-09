import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Task } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import type { CreateTaskInput, UpdateTaskInput } from './dto/tasks.schema';

export type EffectiveTaskStatus = 'Overdue' | 'Pending' | 'Completed';

/** "Overdue" is never stored — see the Prisma Task model comment — it's
 *  derived here from a Pending task whose dueAt has passed. */
export function effectiveTaskStatus(task: Pick<Task, 'status' | 'dueAt'>): EffectiveTaskStatus {
  if (task.status === 'Completed') return 'Completed';
  if (task.dueAt && task.dueAt.getTime() < Date.now()) return 'Overdue';
  return 'Pending';
}

function withEffectiveStatus(task: Task) {
  return { ...task, effectiveStatus: effectiveTaskStatus(task) };
}

/** Dashboard "Tasks" work queue — org/location shared (every teammate at
 *  the location sees the same list), unlike the personal Notes widget. */
@Injectable()
export class TasksService {
  async list(user: AuthenticatedUser) {
    const tasks = await prisma.task.findMany({
      where: { organizationId: user.organizationId, locationId: user.locationId },
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map(withEffectiveStatus);
  }

  async create(user: AuthenticatedUser, input: CreateTaskInput) {
    const assignee = await prisma.user.findFirst({
      where: { id: input.assigneeId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!assignee) {
      throw new BadRequestException(`Assignee ${input.assigneeId} not found in this organization`);
    }

    const task = await prisma.task.create({
      data: {
        organizationId: user.organizationId,
        locationId: user.locationId,
        title: input.title,
        assignee: input.assignee,
        assigneeId: input.assigneeId,
        assignedBy: input.assignedBy,
        dueAt: input.dueAt ?? null,
        createdById: user.id,
      },
    });
    return withEffectiveStatus(task);
  }

  /**
   * Only the person a task is assigned to (or whoever created it) can
   * change its status — otherwise anyone viewing the shared work queue
   * could check off someone else's task, which is exactly the confusing
   * behavior this guard exists to prevent.
   */
  async update(user: AuthenticatedUser, id: string, input: UpdateTaskInput) {
    const task = await this.findInOrganization(user, id);
    if (input.status !== undefined && task.assigneeId && task.assigneeId !== user.id && task.createdById !== user.id) {
      throw new ForbiddenException('Only the assignee or the task creator can change its status.');
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { ...(input.status !== undefined ? { status: input.status } : {}) },
    });
    return withEffectiveStatus(updated);
  }

  async delete(user: AuthenticatedUser, id: string) {
    await this.findInOrganization(user, id);
    await prisma.task.delete({ where: { id } });
    return { id };
  }

  private async findInOrganization(user: AuthenticatedUser, id: string) {
    const task = await prisma.task.findFirst({
      where: { id, organizationId: user.organizationId, locationId: user.locationId },
    });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }
}
