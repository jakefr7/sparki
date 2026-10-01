# Admin settings audit — 2026-10-01

Scope: owner-session staging inspection of every Admin section and creation form, plus source review of loading/saving behavior. No staging settings were saved, no permissions changed, no deployment. Populated edit/delete persistence, other-role access and failure injection remain untested; this is not release certification.

## Booking readiness

Statuses describe visit workflow, not appointment availability. Existing booking messages cover no eligible providers and no active assigned schedule blocks after selecting a type. Missing appointment types and config fetch failure previously collapsed into an empty dropdown. Local changes now distinguish loading, failed setup with retry, and no active types with the exact Settings → Admin → Scheduler setup path. Booking stays disabled until a valid time is selected.

## Reviewed surfaces

- Services: add form, price, markup, taxable toggle, source load/save paths. Local copy separates invoice services from scheduling types and makes markup reference-only. Follow-ups: load retry; archive/inactive visibility; price validation feedback and persistent save-vs-refresh success handling.
- Statuses: create form, protected phase, position, enabled/in-clinic flags, transition picker; update/delete paths reviewed in code. Local copy distinguishes these from scheduling and removes obsolete client-approval phase wording. Follow-ups: explicit empty/loading/error recovery; network-safe saves/deletes; block dismissal during save; keyboard/focus behavior and reduced-motion close handling.
- Checkout policy: outstanding balance toggle. Load does not check HTTP status or catch rejection; save has no network catch or in-flight guard. An optimistic toggle can incorrectly appear saved after network failure. Needs focused mutation/error tests.
- Backup signers and licensed medication clerks: actual roster loads correctly on staging, but loading briefly showed “No reception or assistant staff”. Code does not check response status before treating JSON as staff lists. Permission writes lack network catch and per-staff pending guards. Eligibility and visit-specific signer assignment distinction is correctly explained. Never alter these permissions as audit fixtures.
- Schedule grid: interval controls reviewed; save lacks network catch/finally. Loading derives from null config, so failed setup can leave controls loading indefinitely. Interval is calendar spacing, not appointment duration.
- Appointment types: category, name, description, duration, color, active state and eligible providers reviewed. Editor includes owner and technician as candidates, so “eligible doctors” is misleading; investigate role-aware naming for technician appointments. An active type alone is insufficient without valid blocks. Needs visible readiness summary.
- Schedule blocks: day/time/provider/room/type assignment and visible toggle reviewed. These are recurring weekly availability, not one-day events or reserved/unavailable time. Local copy now says so and uses “appointment types” consistently. One-day exceptions/date-specific availability are absent from this editor; prior proposed “today-only block” cannot be made with this form. Visibility versus booking-active semantics needs explicit review before changing behavior.

## Recommended contextual organization

Group Admin into Scheduling (grid, types, weekly availability), Visit Workflow (statuses), Services & Billing (services, checkout policy), Clinical Permissions (backup signers, medication clerks). Include a small scheduling readiness summary: active type, eligible staff, matching availability. Keep clinical permission authority unchanged. Add links that open the exact settings section while preserving the appointment draft.

## Founder decisions

1. Should custom statuses allow clinics to configure transitions, or only rename/color a fixed safe workflow? Current form permits transition configuration within protected phases; do not silently narrow or broaden clinical behavior.
2. Does the product need date-specific provider availability/closures now? Current blocks recur weekly. This is a capability change, not copy polish.
3. Keep markup reference-only pending the existing pricing policy decision; do not invent a calculation.

## Local verification

Web TypeScript check and git diff whitespace check passed. ESLint could not complete because the configured react-hooks plugin is unavailable in the workspace dependency resolution. Browser staging observations verify the existing findings; local changes have not been browser-verified or deployed. Appointment booking remains blocked by empty staging configuration and pending user authorization to configure it.

## Approved follow-up implementation

Founder chose fixed Sparki workflows and date exceptions. Local implementation removes custom workflow creation/deletion, phase/transition/order/enabled/in-clinic editing. API accepts only scoped appearance changes. Fixed phases and adjacent moves govern the API and dashboard even when legacy rows contain custom transition/phase metadata. Old rows remain stored; clinic labels/colors are preserved. Missing standard rows initialize when configuration is read.

Date exceptions are audited, tenant/location scoped, and soft-removed. They close booking for one provider or the clinic on a specific clinic-local date, all day or timed. Availability search and booking revalidation use the same exceptions. Existing bookings are not cancelled, and weekly blocks are unchanged. Extra opening hours on a date are not implemented. Migration has been replayed only on disposable local test databases.

Verification: focused unit/schema/config checks (25 tests) passed; date closure API and appearance tests passed; desktop/mobile Admin browser test passed. Typechecks passed and focused lint has no errors (two existing operations warnings). Cross-organization fixture setup in affected suites now uses the unscoped fixture client so tenant enforcement does not rewrite intended foreign records into the local clinic; assertions remain unchanged. Final affected integration run: 133/133 passed across appointments, visits and operations; includes stale booking rejection, closure removal restoring availability, appearance-only writes, fixed legacy workflow behavior and real cross-tenant fixtures.
