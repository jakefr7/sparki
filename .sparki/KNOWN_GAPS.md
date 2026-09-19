# Known Gaps

- The Playwright harness works, but the full browser suite has historical product/test drift. Treat failures as real findings and fix them when working in the affected surface; do not preserve them as an active phase exception.
- Phone refills without an active visit need a defined standalone-invoice or encounter policy.
- Printable medical records, visit summaries, discharge instructions, medication labels, and prescriptions need the requested example output and Packleader references.
- RDVM intake needs a directory source and licensing decision.
- FAS needs a defined scale and capture workflow.
- Service markup needs a pricing rule before it can calculate a selling price.
- Client SMS is simulated because no delivery provider is connected.
- GitHub PR preparation, deployment, and automated merge are not part of the local workflow.
- Historical closeout and run artifacts may describe older product behavior. Use current code, current tests, [PROJECT_STATE.md](./PROJECT_STATE.md), and [CURRENT_WORK.md](./CURRENT_WORK.md) for present-tense decisions.
