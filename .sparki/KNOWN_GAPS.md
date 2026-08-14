# Known Gaps

- The repository is classified **HIGH RISK**; see `BASELINE_SITREP.md` for verified evidence.
- Phase 1 is `READY_FOR_FOUNDER_REVIEW`. Manual verification completed outside the latest review run and is recorded in [PHASE_1_CLOSEOUT.md](./PHASE_1_CLOSEOUT.md). The latest review's `NOT_RUN` objection is run-local orchestration bookkeeping because external evidence was not inherited; historical run artifacts are unchanged.
- `KNOWN_CROSS_PHASE_PLAYWRIGHT_PRODUCT_TEST_DEBT`: the Playwright infrastructure is operational, but the current product end-to-end suite is not green. The Phase 3 authoritative verification reproduced the approved baseline of 24 failed, 5 passed, and 1 did not run with no new, missing, or materially changed failure identities. The existing failures remain deferred to their appropriate later product phases.
- Phase 2 closed the apparent missing SSR authentication-cookie forwarding and silent development `OWNER` fallback findings. Claude Review 1's low-severity development-fixture hygiene finding remains preserved in the Phase 2 review artifact and did not block its `PASS` result or founder approval.
- Phase 3 is `COMPLETE / FOUNDER_APPROVED`; see [PHASE_3_CLOSEOUT.md](./PHASE_3_CLOSEOUT.md). Its optional direct Today-view lifecycle coverage note remains a non-blocking hardening opportunity. The preserved placeholder prior-review artifact is an orchestration observation only and is not a product defect.
- Active Phase 4 has implemented all five staged inventory service tranches and removed all five `@ts-nocheck` bypasses. Final Phase 4 verification remains pending, so tranche completion is not yet phase acceptance.
- Phase 5 must replace misleading simulated SMS delivery, payment/balance placeholders, and absent financial-ledger behavior with honest workflows.
- GitHub PR preparation is not implemented in the local-first bootstrap and is not required to execute local stages.
- Claude CLI is installed locally but was not authenticated when this system was created.
