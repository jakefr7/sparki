# Known Gaps

- The repository is classified **HIGH RISK**; see `BASELINE_SITREP.md` for verified evidence.
- Phase 1 has not run. Root typecheck nondeterminism, 43 API lint errors, five inventory `@ts-nocheck` bypasses, shared integration data, relational teardown failures, two API behavioral failures, and the blocked Playwright run remain unresolved or unverified.
- Phase 2 must address apparent missing SSR authentication-cookie forwarding and silent development `OWNER` fallback when WorkOS is incomplete.
- Phase 3 must decide and verify the visit-discharge safety block; the audit observed `200` where a test expected `409`.
- Phase 4 must harden inventory integrity beyond application-level validation and determine appropriate treatment of the five typecheck bypasses after Phase 1 establishes reliable checks.
- Phase 5 must replace misleading simulated SMS delivery, payment/balance placeholders, and absent financial-ledger behavior with honest workflows.
- GitHub PR preparation is not implemented in the local-first bootstrap and is not required to execute local stages.
- Claude CLI is installed locally but was not authenticated when this system was created.
