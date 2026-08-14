# Phase 5 — Honest External and Financial Workflows

This bounded specification inherits the [Product Constitution](../blueprint/00-product-constitution.md), especially One Source of Truth, communication in patient context, and plain language.

## Known behavior

- Checkout records operational departure and a staff-reported balance disposition. It is not a payment transaction.
- `NoBalanceReported` means only that staff manually reported no balance at that moment. The legacy database value `Paid` stores this disposition until a future, separately authorized schema change; it is not evidence that Sparki processed or verified money movement.
- `OutstandingBalanceRecorded` stores the staff-reported amount, keeps the work visible, and follows the clinic location's existing outstanding-balance checkout policy.
- Client SMS is a clearly labeled simulation. Saving a message creates no provider identifier, sent timestamp, delivery timestamp, or delivery claim.
- Staff-message files are private objects. The application derives opaque organization/location-scoped keys, validates size and allowlisted content type, stores metadata in the existing attachment model, and authorizes every download through conversation membership and tenant/location context.

## Financial invariants and exclusions

- Checkout state is distinct from payment state.
- Balance observations remain in visit/patient/client context, are source-labeled in lifecycle audit metadata, and outstanding observations remain visible work.
- Sparki does not create invoices, process or verify payments, maintain a financial ledger, allocate funds, issue refunds, calculate taxes, settle balances, or reconcile accounts in this phase.
- Invoice development must not begin until its ledger, correction, refund, tax, allocation, reconciliation, and audit invariants receive separate approval.

## Attachment retention and deletion

- Production uses private S3-compatible object storage; public URLs and instance-local web assets are prohibited. Development and tests may use a private temporary fake.
- Objects are retained while their attachment record exists. If message creation fails, newly uploaded objects are deleted. Removing or expiring attached objects requires a future approved retention policy; this phase does not infer legal or clinical retention periods.
- The scope is staff messaging only. Patient records, avatars, photos, and migration attachments are excluded.

## Future decisions

Provider-backed SMS, communication compliance, delivery webhooks, invoice/ledger architecture, payment processors, refunds, taxes, legal retention periods, and deletion workflows require separate founder approval.
