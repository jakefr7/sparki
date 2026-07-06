-- Patient intake MVP: Patient gets optional weight/color fields, and Client's
-- single `name` column splits into firstName/lastName (see
-- docs/specs/modules/01-patient-workspace-mvp.md intake workflow).

-- AlterTable: Patient
ALTER TABLE "Patient" ADD COLUMN "weight" DOUBLE PRECISION;
ALTER TABLE "Patient" ADD COLUMN "color" TEXT;

-- AlterTable: Client — add nullable first so existing rows can be backfilled
-- from `name` before the NOT NULL constraint is enforced.
ALTER TABLE "Client" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Client" ADD COLUMN "lastName" TEXT;

-- Backfill: split on the first space; single-word names become firstName
-- with an empty lastName rather than dropping data.
UPDATE "Client"
SET
  "firstName" = split_part("name", ' ', 1),
  "lastName" = CASE
    WHEN position(' ' in "name") > 0 THEN substring("name" from position(' ' in "name") + 1)
    ELSE ''
  END;

ALTER TABLE "Client" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "lastName" SET NOT NULL;

-- DropIndex: old single-column trigram index on `name`.
DROP INDEX "Client_name_idx";

-- DropColumn
ALTER TABLE "Client" DROP COLUMN "name";

-- CreateIndex: expression-based trigram index over the two-column display
-- name, replacing the dropped column index. Prisma schema syntax can't
-- express a multi-column expression index, so it's hand-written here (see
-- the comment on Client's search index in schema.prisma).
CREATE INDEX "Client_displayName_idx" ON "Client" USING GIN ((("firstName" || ' ' || "lastName")) gin_trgm_ops);
