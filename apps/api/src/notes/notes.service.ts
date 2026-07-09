import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import type { CreateNoteInput, ReorderNotesInput, UpdateNoteInput } from './dto/notes.schema';

/**
 * Dashboard "Notes" widget — personal to the signed-in user (see the
 * Prisma model comment) — every query and mutation is scoped to
 * organizationId AND userId, not just organizationId, so one teammate can
 * never see or edit another's notes.
 */
@Injectable()
export class NotesService {
  async list(user: AuthenticatedUser) {
    return prisma.note.findMany({
      where: { organizationId: user.organizationId, userId: user.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(user: AuthenticatedUser, input: CreateNoteInput) {
    // New notes lead the list — mirrors the widget's existing "newest first"
    // behavior from before this had a backend.
    const lowest = await prisma.note.aggregate({
      where: { organizationId: user.organizationId, userId: user.id },
      _min: { sortOrder: true },
    });
    const sortOrder = (lowest._min.sortOrder ?? 0) - 1;

    return prisma.note.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        body: input.body,
        sortOrder,
      },
    });
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateNoteInput) {
    await this.findOwned(user, id);
    return prisma.note.update({
      where: { id },
      data: { ...(input.body !== undefined ? { body: input.body } : {}) },
    });
  }

  async delete(user: AuthenticatedUser, id: string) {
    await this.findOwned(user, id);
    await prisma.note.delete({ where: { id } });
    return { id };
  }

  async reorder(user: AuthenticatedUser, input: ReorderNotesInput) {
    const owned = await prisma.note.findMany({
      where: { organizationId: user.organizationId, userId: user.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((note) => note.id));
    if (!input.ids.every((id) => ownedIds.has(id))) {
      throw new ForbiddenException('Cannot reorder a note that does not belong to you.');
    }

    await prisma.$transaction(
      input.ids.map((id, index) => prisma.note.update({ where: { id }, data: { sortOrder: index } })),
    );
    return this.list(user);
  }

  private async findOwned(user: AuthenticatedUser, id: string) {
    const note = await prisma.note.findFirst({
      where: { id, organizationId: user.organizationId, userId: user.id },
    });
    if (!note) {
      throw new NotFoundException(`Note ${id} not found`);
    }
    return note;
  }
}
