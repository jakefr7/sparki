# Known Gaps

- The repository is classified **HIGH RISK**; see `BASELINE_SITREP.md` for verified evidence.
- Phase 1 is `READY_FOR_FOUNDER_REVIEW`. Manual verification completed outside the latest review run and is recorded in [PHASE_1_CLOSEOUT.md](./PHASE_1_CLOSEOUT.md). The latest review's `NOT_RUN` objection is run-local orchestration bookkeeping because external evidence was not inherited; historical run artifacts are unchanged.
- The Playwright infrastructure is operational, but the current product end-to-end suite is not green: the authoritative run discovered 30 tests, with 5 passed, 24 failed, and 1 not run. Those meaningful product/test-drift findings remain future work rather than Phase 1 runner/bootstrap failures.
- Phase 2 must address apparent missing SSR authentication-cookie forwarding and silent development `OWNER` fallback when WorkOS is incomplete.
- `KNOWN_PHASE_3_PRODUCT_DEBT`: Phase 3 — Clinical Workflow Integrity must resolve and verify the visit-discharge policy conflict. The deterministic isolated integration test shows that `assertVisitReadyForDischarge` currently permits discharge preparation with open care work while the existing integration-test assertion expects a blocking `409`. Phase 1 must preserve both the behavior and assertion, and classify only this exact documented reproduction as a deferred product failure rather than a verification-infrastructure failure; any materially different integration failure must fail verification.
- Phase 4 must harden inventory integrity beyond application-level validation and address the founder-confirmed blockers: 43 reproducible API lint errors and five inventory `@ts-nocheck` bypasses. Phase 1 must record, not remediate, this product-code debt.
- Phase 5 must replace misleading simulated SMS delivery, payment/balance placeholders, and absent financial-ledger behavior with honest workflows.
- GitHub PR preparation is not implemented in the local-first bootstrap and is not required to execute local stages.
- Claude CLI is installed locally but was not authenticated when this system was created.
