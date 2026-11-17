import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma, VisitState } from '@sparki/db';
import { TERMINAL_VISIT_STATES } from './visit-states';

export async function assertClinicalRecordEditable(tx: Prisma.TransactionClient, visitId: string, organizationId: string, locationId: string) {
  // Share the visit lock with finalization so an in-flight editor cannot write
  // clinical source data after the signed record has been committed.
  const rows = await tx.$queryRaw<Array<{ state: VisitState }>>`SELECT state FROM "Visit" WHERE id = ${visitId} AND "organizationId" = ${organizationId} AND "locationId" = ${locationId} FOR UPDATE`;
  if (!rows[0]) throw new NotFoundException(`Visit ${visitId} not found`);
  const signed = await tx.soapNote.findFirst({ where: { visitId, status: { in: ['Locked', 'Amended'] } }, select: { id: true } });
  if (signed) throw new ConflictException('This medical record is finalized. Use an amendment to correct clinical documentation.');
  if (TERMINAL_VISIT_STATES.includes(rows[0].state)) throw new ConflictException('Clinical documentation cannot be changed on a closed visit.');
}
