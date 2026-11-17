# November 16 staging fixes

User authorized committing, pushing and deploying the Today tab polish, scheduler appointment-popup action polish, SPA-47 Review visit polish and stale clinical-draft fix.

Exam saves synchronize empty or still-generated open-draft sections transactionally; authored draft text and signed records remain unchanged. Finalization repairs missing generated sections on older open drafts after signer authorization and retains required-content/version checks. No schema change or direct staging-record repair.

Validation: seven focused record unit tests and 65 isolated visit integration tests passed, including late diagnosis/plan edits, actual finalization of an older stale draft, and signed-record preservation. Production build and focused API/web lint passed (existing build warnings). All seven focused Chromium checks passed for scheduler start actions, Today desktop/tablet layout, intake observations, and the complete review/finalization/checkout journey. Deployment outcome is recorded in the release chat and local current-work memory.

The separate demo scripts and demo clinic evidence are excluded from this release.
