# Shared staging testing memory

Saved 2026-10-01 for Codex and Claude. Use this existing fictional clinic for future user-authorized staging testing rather than creating another clinic.

- URL: https://staging.sparki.vet/
- Login: https://staging.sparki.vet/login
- Clinic: Willow Creek Veterinary Clinic — Staging
- Organization ID: `cmuppdwwa0001vvxgpqrdra9y`
- Location: Main Clinic (`cmuppdwy70003vvxg0u8e720t`)
- Time zone: America/Chicago
- Exactly five active staff; all five password logins verified on 2026-10-01. Owner browser login and Settings → Team roster also verified.

| Staff | Role | Email |
|---|---|---|
| Anna Carter | OWNER | willow.owner.4dd196@staging.sparki.vet |
| Miles Bennett | VETERINARIAN | willow.veterinarian.4dd196@staging.sparki.vet |
| Olivia Reed | TECHNICIAN | willow.technician.4dd196@staging.sparki.vet |
| Marcus Lee | ASSISTANT | willow.assistant.4dd196@staging.sparki.vet |
| Hannah Brooks | RECEPTIONIST | willow.receptionist.4dd196@staging.sparki.vet |

The shared test password is in `.sparki/.env.staging-testing.local`, a Git-ignored local credential file. Read it only for authorized testing; do not print it in logs or commit it. On another checkout/machine, obtain the credential from the user if that file is absent.

The clinic was created empty, with setup complete and owner admin-settings access. Current test data may change; inspect it before making assumptions. These are test identities, not working email inboxes; use password login. WorkOS enforced SSO for the original `example.com` addresses; the final accounts use `staging.sparki.vet`.

This note does not authorize deployment, destructive cleanup, other-tenant changes, real client messages, purchases, or clinical policy changes. Follow the current user request and repository safety boundaries.

## Latest test state: 2026-10-01

Murph (`cmupq84gf00047jlny9qovw0q`) was created through Patients / Clients, then permanently deleted at the user's request after confirming no linked appointments, visits, records, prescriptions, alerts, medications, communications, attachments, or invoices. Its patient-client link and uploaded Spaces object were removed. The fictional client Casey Morgan remains; no other clinic data was deleted.

Photo storage retest after Claude's staging update passed: upload HTTP 201; stored URL points to staging `/api/patients/{id}/photo/content`; authenticated GET HTTP 200, JPEG byte-for-byte equal to the source; browser image rendered at natural width 3884. Earlier localhost-URL and upload-404 findings are resolved for this tested path. Native picker automation was not reverified.

Source used for the deleted Murph and QA fixtures: Christian Madden's [Golden Retriever English cream portrait](https://commons.wikimedia.org/wiki/File:Golden_Retriever_English_cream_portrait.jpg), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/), unmodified.

Patient-profile pressure testing on 2026-10-01 created fictional **Profile QA** (`cmupte8me00041woayjun62uy`), linked to Casey Profile QA. It has the same licensed dog photo, two explicitly labeled QA alerts, a cancelled fictional prescription, and an Arrived test visit (`cmuptixof000j1woaydwhjslv`) with an empty invoice. Keep these records identifiable as test fixtures; no real treatment, dispensing, payment, or client communication occurred. Owner-session staging checks covered all five tabs, profile saving/validation, photo upload, alert creation, prescription draft/cancellation, empty/populated visit history and invoice loading, and mobile layout. Local fixes are unpushed and undeployed. Other staff roles and signed/attachment-heavy clinical history were not exercised in this staging pass.

Subsequently, the user requested replacement of Profile QA. The QA patient, its two alerts, cancelled prescription/events, test visit, empty draft invoice, and exact stored photo object were deleted after scoped guards confirmed disposable records. This supersedes the fixture state above.

Replacement **Finley** (`cmupz9dco000v1woamfsij3ut`) was created through Patients / Clients with fictional owner Jordan Ellis. Dog, Border Collie, male, black and white; age and medical history left unknown. Uploaded photo persisted across reload. Source: Medalofdead's [Border Collie Smiling](https://commons.wikimedia.org/wiki/File:Border_Collie_Smiling.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), unmodified. The source describes a two-year-old male in August 2018; this is not a current age. Finley and the owner name are staging identities, not the photographed dog's documented identity.

Earlier appointment workflow attempt had no appointment types or schedule blocks. This state is superseded by the GP setup below. No appointment or intake was created in that earlier attempt.

After the user's staging update, Finley's profile was completed with fictional staging owner contact details: cell 312-555-0146, alternate 312-555-0182, jordan.ellis@example.com, 123 Example Lane / Apt 2B / Chicago IL 60614 US. These are synthetic contact details; do not send communications. Estimated age is ~10 years, explicitly derived from the source photograph's age/date, not a known DOB. Saved details and photo persisted across reload; removal of the Active badge and walk-in form is visible on updated staging. Medical history, medications and alerts remain unknown/unrecorded rather than fabricated.

User-authorized GP scheduling setup on 2026-10-01 saved 13 active appointment types and six generic weekly blocks: Mon–Fri 8 AM–6 PM, Sat 9 AM–1 PM, America/Chicago; no Sunday block. Exam types use Anna; Technician Visit uses Olivia. Miles currently appears disabled; no access changes made. Durations, the 50-location hours research and verification are in `docs/research/staging-gp-scheduling-2026-10-01.md`. No billable services or prices added. All settings persisted after reload, but booking availability fails with “We couldn’t load the Scheduler” for Wellness and Technician Visit. Reproduced from both patient-profile and Scheduler entry points, including October 2 and explicit Anna selection. No appointment/visit/payment created; fresh visit/PDF audit remains blocked. No fixes/deployments performed.
