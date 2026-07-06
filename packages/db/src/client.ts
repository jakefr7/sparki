import { PrismaClient } from '../generated/client';

/**
 * Single PrismaClient instance per process. Next.js dev/hot-reload and
 * NestJS's module system can otherwise each construct their own client and
 * exhaust Postgres connections in development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
