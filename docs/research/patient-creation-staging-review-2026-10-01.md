# Patient creation: staging review

Date: 2026-10-01. Scope: Patients / Clients → New Patient → saved profile → directory name lookup. Logged in as Willow Creek's owner Anna Carter. Created exactly one patient and its fictional client; no appointment, visit, clinical history, or additional patient. No product-code change or deployment performed.

## Result and photo provenance

[Murph's profile](https://staging.sparki.vet/patients/cmupq84gf00047jlny9qovw0q): Dog, Golden Retriever, Male, Cream / pale golden. Source verifies name, breed, and male sex; coat matches the photograph. DOB, estimated age, weight, and medical history were not established and were left absent. Casey Morgan and contact details are fictional staging fixtures, not the photographed dog's real owner.

Photo: Christian Madden, [Golden Retriever English cream portrait](https://commons.wikimedia.org/wiki/File:Golden_Retriever_English_cream_portrait.jpg), [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). Original image unmodified; display is cropped by existing UI. Saved profile uses the original Wikimedia URL as a workaround for the staging upload failures below.

## Confirmed defects

1. **Uploaded photo URL points at localhost.** Authenticated POST `/api/patients/{id}/photo` returned HTTP 200 but stored `https://localhost:3000/uploads/patients/...jpg`. Profile image failed to load (`naturalWidth: 0`). The upload route builds the URL using `request.nextUrl.origin`. Correct public-origin handling needs investigation; no deployment/config changes made.
2. **Uploaded file unavailable on staging.** After correcting only this test record's image host to staging, the exact uploaded path still returned authenticated HTTP 404. Image remained broken. Investigate runtime upload storage and serving; root cause not established. Correcting the host alone is insufficient. The test record now uses the licensed source image and renders successfully (`naturalWidth: 3884`).
3. **Escape silently discards populated draft.** Filled patient name, breed, sex, coat, owner name, phone, and email. Pressed Escape while the page was focused; form closed without a warning. Reopened New Patient: all entered values were empty. Preserve a draft across accidental dismissal or protect discarding a changed form. Restored values before the single successful submit.

## Usability observations

- At the observed 1280×720 viewport, the modal's large photo/title area plus patient section leaves required owner details below the scroll area. Reduce header height and make the remaining required section clearer; keep the patient-first ordering.
- Age controls offer “Known DOB” and “Estimated age,” defaulting to Known DOB even with no date. Unknown is allowed by saving a blank field, but not expressed as an option. Make unknown age explicit so users do not invent a date or estimate. Saved profile correctly says “Age not captured.”
- Phone `3125550148` remains an unformatted digit string in directory and profile. Format display consistently while retaining the entered number.
- Optional address entry occupies seven fields plus helper text. Consider collapsing optional address details until needed to shorten the primary registration flow.

These are recommendations, not additional confirmed failures. Patient creation, owner linkage, opening the profile, and lookup by patient name succeeded. Photo chooser automation timed out and native app access was unavailable; that limitation is not classified as a product upload-picker defect. The image was attached through the existing authenticated upload endpoint after UI creation.

## Founder-directed language change: Pet → Patient

Use Patient throughout user-facing text. In this path: “Pet first name,” “Create an owner and pet profile,” directory search placeholder “Search by pet name…,” validation “Pet first name is required,” and duplicate hint “Possible existing pet for this owner.”

Other source occurrences: Scheduler search and missing-patient hint/records helper (`new-appointment-modal.tsx`); profile edit label, legend, and validation (`patient-profile-edit-panel.tsx`); front-desk label (`front-desk-intake-form.tsx`); generic patient search placeholder (`patient-search.tsx`); Client Communication subtitle (`app/communication/page.tsx`); older profile modal labels/validation (`patient-profile-modal.tsx`). Internal component names and CSS identifiers containing `pet` are not user-facing copy.

This review records the requested change; copy has not yet been changed or deployed.
