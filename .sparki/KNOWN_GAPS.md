# Known Gaps

- The repository is classified **HIGH RISK**; see `BASELINE_SITREP.md` for verified evidence.
- Phase 1 orchestration is in progress. Verification command isolation is implemented; deterministic integration, end-to-end, and independent-review evidence remains incomplete.
- Phase 2 must address apparent missing SSR authentication-cookie forwarding and silent development `OWNER` fallback when WorkOS is incomplete.
- Phase 3 must decide and verify the visit-discharge safety block; the audit observed `200` where a test expected `409`.
- Phase 4 must harden inventory integrity beyond application-level validation and address the founder-confirmed blockers: 43 reproducible API lint errors and five inventory `@ts-nocheck` bypasses. Phase 1 must record, not remediate, this product-code debt.
- Phase 5 must replace misleading simulated SMS delivery, payment/balance placeholders, and absent financial-ledger behavior with honest workflows.
- GitHub PR preparation is not implemented in the local-first bootstrap and is not required to execute local stages.
- Claude CLI is installed locally but was not authenticated when this system was created.
