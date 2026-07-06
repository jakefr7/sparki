# Product Constitution

This is the highest authority in the Sparki repository.

Every blueprint, specification, Architecture Decision Record, AI instruction, hiring profile, and product review should inherit from this document. When another document conflicts with this one, this document wins until it is deliberately amended.

## Purpose

Sparki exists to make veterinary work feel lighter, faster, and more coherent.

The purpose of this Constitution is to define the product laws that protect that ambition as the company grows. These laws are not slogans. They are constraints. They are the standards every decision must answer to.

## How This Document Is Used

Use this document before starting work, while making tradeoffs, and when reviewing what has been built.

- Product uses it to decide what should exist.
- Design uses it to decide what deserves attention.
- Engineering uses it to decide what the system must preserve.
- AI uses it to decide when to assist and when to stay silent.
- Leadership uses it to decide what not to become.
- ADRs reference it when a decision has long-term consequence.

Changing this document should be rare. A change should mean Sparki has learned something fundamental, not that a feature became inconvenient.

## Product Commandments

## 1. Patients Are The Center Of Sparki

Veterinary work begins with the patient, not the module, menu, database table, or department.

### Reason

Clinics do not experience work as separate software categories. A single patient visit can involve history, communication, diagnostics, estimates, approvals, medications, billing, tasks, and follow-up. If the product fragments that reality, users must reassemble context in their heads.

### Implications

- Patient context must be easy to find, preserve, and return to.
- Clinical, operational, financial, and communication work should connect back to the patient.
- Navigation should reflect how work happens, not how data is stored.
- Features that cannot explain their relationship to patient care require scrutiny.

### Tradeoffs

Some clinic-level, client-level, and administrative workflows will not be patient-centered. They still matter. But they must not force the core product to become module-first.

### If Violated

Sparki becomes another system that makes users hunt for context, reconcile fragments, and mentally carry the product.

---

## 2. Workflow Before Features

A feature is only valuable when it improves a real workflow.

### Reason

Feature count is a poor proxy for product quality. Veterinary teams do not need more places to click. They need fewer broken paths through the work they already do.

### Implications

- Specs must identify the workflow being improved.
- Product reviews should evaluate time, clarity, handoffs, and completion, not only capability.
- A smaller feature that completes a workflow is better than a larger feature that adds surface area.
- Roadmap sequencing should follow workflow value, not category coverage.

### Tradeoffs

Some foundational capabilities may be built before the workflow is fully visible. Those decisions must state the workflow they are preparing to support.

### If Violated

Sparki accumulates functionality without leverage. The product becomes broad, busy, and ordinary.

---

## 3. Assist. Never Interrupt.

Sparki should help users keep moving.

### Reason

Veterinary teams work under time pressure and frequent handoffs. An interruption at the wrong moment is not neutral. It costs attention, momentum, and trust.

### Implications

- Assistance should appear in context.
- Alerts, modals, confirmations, and prompts must justify their timing.
- The product should prepare work before asking users to complete it.
- Silence is better than noisy help.
- Interruption is acceptable only for clear safety, integrity, or irreversible-action reasons.

### Tradeoffs

Some moments require stopping the user. Sparki should be explicit about why the interruption exists and make the next correct action obvious.

### If Violated

Sparki becomes another source of operational drag: a system users must manage while trying to do their real work.

---

## 4. Speed Is A Product Feature

Fast is not polish. Fast is part of the product.

### Reason

Small delays compound across appointments, handoffs, checkouts, phone calls, and end-of-day work. A slow system changes behavior. Users defer documentation, avoid useful paths, and build workarounds.

### Implications

- Speed must be considered in product design, not only engineering optimization.
- Common actions should feel immediate.
- Loading, waiting, and recovery states are part of the user experience.
- Workflow speed matters more than isolated screen performance.
- A slower solution must deliver meaningfully greater value to be justified.

### Tradeoffs

Accuracy, safety, and data integrity can justify waiting. Indifference cannot.

### If Violated

The product becomes technically capable but operationally exhausting.

---

## 5. Every Click Has A Cost

No interaction is free.

### Reason

Each click consumes attention, time, and confidence. In repeated workflows, unnecessary actions become institutional tax.

### Implications

- Default paths should match the most common correct action.
- Repeated work should be reduced, remembered, automated, or prepared.
- Required fields and confirmations must earn their existence.
- A click that protects safety or clarity is acceptable. A click that protects poor design is not.

### Tradeoffs

Reducing clicks must not hide important state or make destructive actions easier. The goal is not minimal interaction at all costs. The goal is fewer meaningless interactions.

### If Violated

Sparki quietly recreates the fatigue it was built to remove.

---

## 6. Respect User Momentum

The product should preserve the user's place, intent, and flow.

### Reason

Veterinary work is interrupt-driven. Users move between rooms, patients, teammates, calls, approvals, and records. Software that loses their place multiplies the cost of every interruption.

### Implications

- Users should be able to leave and return without reconstructing context.
- In-progress work should be protected.
- Navigation should make backtracking and resuming obvious.
- The product should avoid dead ends, forced detours, and surprise state changes.

### Tradeoffs

Some workflows require sequence and control. Even then, the product should explain where the user is and what remains.

### If Violated

Users will stop trusting the product with unfinished work.

---

## 7. Migration Is A Core Product

Switching to Sparki must be designed, not improvised.

### Reason

A clinic cannot adopt a new operating system if its history, records, relationships, and operational continuity feel at risk. Migration is not a side door into the product. It is the first real product experience many customers will have.

### Implications

- Migration requirements must influence product and data decisions early.
- Data quality, validation, exceptions, and customer confidence are product concerns.
- Legacy reality should be understood without letting it define Sparki's future shape.
- Launch readiness includes migration readiness.

### Tradeoffs

Supporting migration may add complexity. That complexity is justified when it reduces adoption risk and protects customer trust.

### If Violated

Sparki may become desirable but unreachable.

---

## 8. Communication Belongs With The Patient

Communication is part of care, not a separate inbox.

### Reason

Approvals, follow-ups, questions, instructions, updates, and reminders carry patient context. When communication is detached from the patient workflow, teams duplicate work and lose the thread of care.

### Implications

- Relevant communication should be visible from patient context.
- Communication should create or connect to tasks, notes, approvals, and follow-up when appropriate.
- Users should not have to search multiple systems to understand what was said.
- Client communication must respect identity, privacy, and clinical relevance.

### Tradeoffs

Some communication is administrative or account-level. Sparki should support that without separating clinically relevant communication from the patient.

### If Violated

The product forces teams to become the integration layer between conversation and care.

---

## 9. AI Assists. Humans Decide.

AI should remove work while preserving human authority.

### Reason

AI is useful when it reduces repetitive effort, prepares context, summarizes, drafts, classifies, or catches what humans would otherwise have to chase. It becomes harmful when it creates review burden, hides uncertainty, or acts beyond trust.

### Implications

- AI should operate inside existing workflows.
- AI outputs must be reviewable where judgment matters.
- AI should show enough context for users to trust, edit, or reject it.
- AI should not create new destinations, chores, or ambiguity.
- Automation should be earned through evidence.

### Tradeoffs

Some low-risk work can be automated. Higher-risk work requires human confirmation. The boundary must be explicit.

### If Violated

AI becomes theater: impressive in demos, expensive in practice, and distrusted in daily work.

---

## 10. One Source Of Truth

Sparki should make the correct state of the clinic knowable.

### Reason

Duplicated, conflicting, or hidden data creates operational risk. Users should not have to decide which screen, note, thread, invoice, reminder, or task is real.

### Implications

- Important state should have clear ownership.
- Derived views should point back to authoritative records.
- Duplicate entry should be treated as a product failure.
- Conflicts, uncertainty, and missing data should be visible rather than disguised.
- Auditability matters when state affects care, money, communication, or accountability.

### Tradeoffs

Some workflows require drafts, temporary states, or imported records that are not yet trusted. Sparki should label them clearly.

### If Violated

The product becomes another source of reconciliation work.

---

## 11. Every Screen Must Earn Its Complexity

Complexity is allowed only when it returns more value than it takes.

### Reason

Veterinary software often becomes dense because every stakeholder gets a field, tab, option, or setting. Density can be powerful, but unmanaged complexity makes the product slower to learn and harder to trust.

### Implications

- Each screen needs a primary job.
- Secondary actions should not compete with the user's main task.
- Rare workflows should not dominate common workflows.
- Configuration should not compensate for unclear product decisions.
- Empty states, edge states, and errors must be designed with the same discipline as happy paths.

### Tradeoffs

Some users need advanced capability. Sparki should provide power without making every user pay for it all the time.

### If Violated

The product becomes a collection of controls instead of an operating system for work.

---

## 12. Use Plain Language

Sparki should use the clearest word that preserves meaning.

### Reason

Veterinary software is used by founders, engineers, receptionists, technicians, veterinarians, managers, owners, clients, support teams, and AI collaborators. Language that sounds precise but feels corporate, academic, or abstract creates distance from the work.

### Implications

- Documentation, UI, prompts, specs, ADRs, and engineering discussions should favor everyday language.
- If two terms mean the same thing, choose the simpler one.
- Technical terms are allowed when they add real precision.
- New domain terms should earn their place.
- Product language should be understandable outside engineering.

### Tradeoffs

Some concepts require precise technical or clinical language. Sparki should use those terms when needed, then explain them plainly.

### If Violated

Sparki becomes harder to understand, harder to build, and harder for clinic teams to trust.

## Decision Filter

Every future feature, design, system decision, AI behavior, integration, and workflow change should answer:

- Does this reduce friction?
- Does this reduce cognitive load?
- Does this reduce context switching?
- Does this preserve patient context?
- Does this help the user keep momentum?
- Does this make the correct state easier to know?
- Does this remove work rather than move work?
- Does this use the clearest language available?
- Does this make an 8-hour shift feel like a 6-hour shift?

If the answer is unclear, the work is not ready.

## Anti-Patterns

Sparki should never become:

- Feature-first design
- Popup overload
- Modal stacking
- Workflow interruption as a default
- Settings explosion
- Module-first navigation
- AI for spectacle
- AI that creates review chores without removing work
- Duplicated data entry
- Conflicting sources of truth
- Navigation for the database instead of the human
- Dashboards that look useful but do not change action
- Configuration used to avoid product judgment
- Search as a substitute for coherent information architecture
- Notifications that train users to ignore them
- Reports that require users to manually reconstruct reality
- Corporate, academic, or technical language where plain language would work

## Product Invariants

These should almost never change over the lifetime of the company:

- Patients are central.
- Workflow matters more than feature count.
- Speed matters.
- Every click has a cost.
- User momentum is precious.
- Migration remains first-class.
- Communication is contextual.
- AI assists and humans decide.
- Important state has one source of truth.
- Complexity must earn its place.
- Plain language is preferred.

## How To Resolve Principle Conflicts

Principles will sometimes disagree. When they do, resolve the conflict by protecting the user, the patient, and the long-term integrity of the product.

Use this order:

1. Safety and correctness
2. Patient context
3. Workflow completion
4. User momentum
5. Speed
6. Simplicity
7. Configurability

Do not use this order mechanically. Use it to expose the tradeoff.

When a decision violates one principle to protect another, document the reason. If the tradeoff creates a lasting constraint, write an ADR. If the tradeoff becomes common, revisit the product design.

## Amendment Standard

This Constitution may change, but only when the company has learned something foundational.

An amendment should:

- Name the principle being changed.
- Explain what changed in Sparki's understanding.
- Describe the expected consequence across product, design, engineering, AI, and operations.
- Update affected blueprint documents and ADRs.

Convenience is not a reason to amend the Constitution.
