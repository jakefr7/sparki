-- Rename UserRole enum value FRONT_DESK -> RECEPTIONIST.
-- Uses ALTER TYPE ... RENAME VALUE (Postgres 10+) instead of Prisma's
-- default drop/recreate diff, so existing rows with role='FRONT_DESK' are
-- relabeled in place rather than requiring a separate data migration.
ALTER TYPE "UserRole" RENAME VALUE 'FRONT_DESK' TO 'RECEPTIONIST';
