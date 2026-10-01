# Known Gaps

- The Playwright harness works, but the full browser suite has historical product/test drift. Treat failures as real findings and fix them when working in the affected surface; do not preserve them as an active phase exception.
- Phone refills are approved to use a medication-only encounter with linked invoice. Implementation remains pending; the existing medication-profile refill action does not deduct stock.
- Current-information discharge, signed-record/amendment, finalized-receipt and authorized-prescription PDF downloads are implemented locally. Medication label hardware/format, connected dispensing, and medication-only encounter billing remain unfinished; see questions for Anna.
- RDVM intake needs a directory source and licensing decision.
- FAS needs a defined scale and capture workflow.
- Service markup needs a pricing rule before it can calculate a selling price.
- Client SMS is simulated because no delivery provider is connected.
- GitHub PR preparation, deployment, and automated merge are not part of the local workflow.
- Historical closeout and run artifacts may describe older product behavior. Use current code, current tests, [PROJECT_STATE.md](./PROJECT_STATE.md), and [CURRENT_WORK.md](./CURRENT_WORK.md) for present-tense decisions.
