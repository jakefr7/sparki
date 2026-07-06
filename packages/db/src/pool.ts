import { Pool } from 'pg';

/**
 * Raw Postgres connection pool. Sprint 0 has no Prisma models yet (an empty
 * schema.prisma can't `generate` a client — see prisma/schema.prisma), so
 * infra-level needs (health checks) and the raw-SQL paths the engineering
 * plan explicitly allows for (docs/engineering/00-engineering-plan.md, "ORM")
 * go through this pool instead of the Prisma client. Once domain models
 * exist, most application code should prefer the generated Prisma client;
 * this pool remains for the queries that need to bypass it.
 */
const globalForPool = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPool.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPool.pgPool = pool;
}
