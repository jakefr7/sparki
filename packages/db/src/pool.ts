import { Pool } from 'pg';

/**
 * Raw Postgres connection pool, kept alongside the Prisma client as a narrow
 * escape hatch for infra-level needs (health checks) and the raw-SQL paths
 * the engineering plan explicitly allows for (docs/engineering/
 * 00-engineering-plan.md, "ORM"). Application code should prefer the
 * generated Prisma client (`prisma` from `./client`); this pool is only for
 * queries that need to bypass it.
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
