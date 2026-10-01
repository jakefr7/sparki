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

## First patient: 2026-10-01

Exactly one patient was created through Patients / Clients → New Patient: **Murph**, ID `cmupq84gf00047jlny9qovw0q`, Dog, Golden Retriever, Male, Cream / pale golden. Owner Casey Morgan is fictional; contact values are test data. DOB, age, and medical history were left unknown rather than invented. No appointment or visit was created.

The real photo is Christian Madden's [Golden Retriever English cream portrait](https://commons.wikimedia.org/wiki/File:Golden_Retriever_English_cream_portrait.jpg), licensed [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). The source identifies the dog as Murph and male. Source image unmodified; UI crops it for display. The profile currently references the Wikimedia image because staging upload generated a localhost URL and the uploaded file returned authenticated HTTP 404 even after host correction. See [creation-path review](../docs/research/patient-creation-staging-review-2026-10-01.md).
