import type { OrganizationEventType, Prisma } from '@sparki/db';

type PrismaWriteClient = Prisma.TransactionClient | typeof import('@sparki/db').prisma;

export interface LogOrganizationEventInput {
  organizationId: string;
  /** Null for system/webhook-driven events — a Stripe subscription update
   *  has no Sparki actor. */
  actorUserId: string | null;
  type: OrganizationEventType;
  targetType?: string;
  targetId?: string;
  /** Small, structured, non-sensitive context only. Never a raw invite
   *  token, session token, password, or full payment/card detail — see
   *  docs/adr/ADR-007 "Observability / Auditability". */
  metadata?: Record<string, unknown>;
}

/**
 * Records a security-sensitive clinic/membership/billing event
 * (docs/blueprint/11-permission-and-ownership-v1.md "Audit Responsibility").
 * Takes a Prisma client/transaction so callers can log inside the same
 * transaction as the state change it describes.
 */
export async function logOrganizationEvent(
  client: PrismaWriteClient,
  input: LogOrganizationEventInput,
): Promise<void> {
  await client.organizationEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      type: input.type,
      ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    },
  });
}
