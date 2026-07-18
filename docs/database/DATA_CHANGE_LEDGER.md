# Data Change Ledger

This ledger records production-like data changes whose effects are not fully
described by Prisma's `_prisma_migrations` table. Prisma remains the source of
truth for schema migration execution; Git remains the source of truth for code
authorship and review.

Use this ledger for backfills, cleanup jobs, corrective scripts, imports, and
deletions. Do not record credentials, client information, patient information,
or raw row contents.

## Required format

Record timestamps in UTC using ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`). Use the exact
Prisma migration directory, script path, ticket, or commit as the change ID.
Record `0` rather than leaving a row count blank. Use `unknown` only for a
historical operation whose count cannot be reconstructed safely.

| Executed at (UTC) | Operator | Environment | Change ID | Inserted | Updated | Deleted | Result | Verification / notes |
|---|---|---|---|---:|---:|---:|---|---|
| 2026-07-18T04:46:00Z | Codex, requested by Jake Franco | local development | `20260717213000_link_appointment_styles_to_schedule_blocks` through `20260717235500_audit_scheduler_configuration` | 0 | 20 | 0 | Completed | Conservatively linked 20 of 94 previously unassigned appointments to provable schedule blocks. Twenty-four future appointments remained unlinked and were surfaced as `Needs review`; no appointments were moved, reassigned, or deleted. |

## Entry template

Copy this row immediately after running and verifying a data-changing operation:

```text
| YYYY-MM-DDTHH:mm:ssZ | Name or service account | local / staging / production | migration, script, ticket, or commit | 0 | 0 | 0 | Completed / Rolled back / Failed | Verification query, rollback reference, and relevant aggregate counts |
```

## Rules

1. Capture before counts before execution and affected-row counts during execution.
2. Run a separate verification query after execution; do not treat the command's
   exit code as sufficient verification.
3. For deletion, record both the number selected before deletion and the number
   actually deleted in the notes when those values differ.
4. Prefer reversible changes. Reference the backup, archive table, or rollback
   script when one exists.
5. Never edit a completed entry silently. Append a corrective entry that links
   back to the original change.
6. Keep one row per environment because the same migration can affect different
   numbers of rows in local, staging, and production.

