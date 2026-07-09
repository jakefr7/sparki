-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canManageAdminSettings" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: admin settings access used to be implied by Role (OWNER /
-- PRACTICE_MANAGER). Now that it's a standalone per-user grant, carry
-- existing role-implied access forward one time so this migration doesn't
-- silently revoke access from anyone who already had it.
UPDATE "User" SET "canManageAdminSettings" = true WHERE "role" IN ('OWNER', 'PRACTICE_MANAGER');
