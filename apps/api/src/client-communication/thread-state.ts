import { prisma, type Prisma } from '@sparki/db';
import { isDeliveryProblem } from './client-communication.constants';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Keeps ClientCommunicationThread.deliveryProblemSince true to its meaning:
 * set while the newest outbound message failed or has an unknown outcome,
 * clear otherwise. Recomputed from the messages after every delivery change
 * rather than toggled, because delivery updates arrive out of order.
 */
export async function refreshDeliveryProblem(
  db: Db,
  organizationId: string,
  threadId: string,
): Promise<void> {
  const newestOutbound = await db.clientCommunicationMessage.findFirst({
    where: { organizationId, threadId, direction: 'OUTBOUND' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { status: true },
  });
  const hasProblem = newestOutbound ? isDeliveryProblem(newestOutbound.status) : false;
  await db.clientCommunicationThread.updateMany({
    // Only write when the flag actually changes, so "since" keeps the time
    // the problem began.
    where: {
      id: threadId,
      organizationId,
      deliveryProblemSince: hasProblem ? null : { not: null },
    },
    data: { deliveryProblemSince: hasProblem ? new Date() : null },
  });
}
