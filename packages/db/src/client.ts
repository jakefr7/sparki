import { PrismaClient } from '../generated/client';
import { tenantScopingExtension } from './tenant-scoping';

// Explicit `: PrismaClient` return annotation (not inferred) is load-bearing:
// it's what lets every other use of this function's result — including
// `ReturnType<typeof withTenantScoping>` below — resolve to plain
// PrismaClient without TypeScript trying to fully expand $extends's actual
// return type, which is where it hits a longstanding open Prisma/TypeScript
// incompatibility under this project's exactOptionalPropertyTypes setting
// (prisma/prisma#19888, #10894, #26853). The cast is type-level only; the
// object underneath is still the extended client, so the extension still
// runs — verified against tenant-scoping.spec.ts and manually against the
// dev DB.
function withTenantScoping(client: PrismaClient): PrismaClient {
  return client.$extends(tenantScopingExtension) as unknown as PrismaClient;
}

/**
 * Single PrismaClient instance per process. Next.js dev/hot-reload and
 * NestJS's module system can otherwise each construct their own client and
 * exhaust Postgres connections in development.
 */
const globalForPrisma = globalThis as unknown as {
  prismaBase?: PrismaClient;
  prisma?: ReturnType<typeof withTenantScoping>;
};

const base =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

/**
 * The client every service should import. Transparently enforces/injects
 * organizationId for tenant-scoped models when a request's TenantContext is
 * set — see tenant-scoping.ts for exactly what it does and does not cover.
 */
export const prisma = globalForPrisma.prisma ?? withTenantScoping(base);

/**
 * The same connection, without tenant scoping. Reserved for the small set of
 * genuinely cross-tenant system paths (clinic signup before an org exists,
 * resolving a billing webhook by Stripe customer id, admin/support tooling,
 * seed and migration scripts) — never reach for this to route around a
 * scoping error without understanding why the scoped client rejected the
 * query first.
 */
export const prismaUnscoped = base;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaBase = base;
  globalForPrisma.prisma = prisma;
}
