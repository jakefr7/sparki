# Landing page — animal image direction

The public landing page (`apps/web/src/components/landing/`) uses **two**
portraits for warmth — one Siberian Husky (the patient, in the hero) and one
cat (during the patient journey). Two deliberate compositions, not pet cards
scattered down the page. **The current files are temporary, license-clear
Unsplash photographs** used so the page can be fully designed, animated, and
reviewed now. They are _not_ permanent brand assets.

> A third `belief` slot (a small dog portrait beside the closing statement) was
> removed: at that size it read as a rectangular card pasted over the receding
> product UI. The belief section is now a plain typographic close with the
> product blurring back — no photograph. Do not re-add it without a composition
> that earns its place.

All landing imagery flows through one layer so the temporary photos can be
swapped one-for-one later with **zero re-wiring**:

- Files live in `apps/web/public/landing/`.
- The registry `apps/web/src/components/landing/landing-images.ts` is the single
  source of truth for `src`, aspect ratio, focal point, `alt`, and art
  direction per slot.
- The `<LandingImage slot="…" />` component
  (`apps/web/src/components/landing/landing-image.tsx`) renders the registry
  entry with the cropping, focal point, grade, and grain used everywhere.

To replace an image: generate the asset per the prompt below, export it to the
**exact same path and pixel dimensions**, and (if the new focal point differs)
adjust only the `focal` value in the registry. Nothing else changes.

Do **not** introduce obvious veterinary stock photography, clinic team photos,
or people holding pets. Dog and cat portraits only. Keep the set sparse.

---

## Shared treatment (applied in `LandingImage`, not baked into the file)

- Delivered flat/ungraded. The component applies: slight desaturation, a warm
  lift in shadows, a cool teal cast in highlights to match Sparki's
  `#1fa9a0` system, a soft vignette, and a fine film grain.
- Each placement also has section-specific gradient masks / `mask-image`
  wipes defined in `landing.module.css` (`.figure*` rules). Those are keyed to
  the slot name, not the file, so they survive a swap.
- Deliver sRGB, no embedded color profile beyond sRGB, progressive JPEG,
  quality ~80. Target < 320 KB each.

---

## Slot: `hero` — hero composition, behind / beside the product UI

| Field | Value |
| --- | --- |
| Filename | `apps/web/public/landing/hero-portrait.jpg` |
| Rendered aspect ratio | `4 / 5` |
| Source pixel dimensions | `1200 × 1500` |
| Focal point (`object-position`) | `43% 46%` — the eyes |
| `alt` | `""` (decorative; the hero headline carries meaning) |
| Temporary asset | Unsplash photo `1491604612772-6853927639ef` (black-and-white Siberian Husky, calm, plain indoor background) |

**Role in the page:** lower-left depth layer of the hero. Sits a plane behind
the Sparki window, feathered on every edge by a radial mask so it dissolves
into the ground rather than reading as a framed photo, with a restrained
parallax offset on scroll and cursor movement. It clears out completely before
any copy scrolls past it. The Husky is the **patient**; the product window is
the system caring for that patient — so the dog must read as a clinic patient,
never as an outdoor / lifestyle / pet-adventure image.

**Final generated image should depict:** a normal black-and-white Siberian
Husky — realistic, calm, healthy-looking — in a veterinary clinic or exam-room
context, being examined, handled, or gently held by a veterinarian or clinical
staff member. Clean, modern, premium, believable medical environment. The human
must not dominate the frame (torso / hands only is ideal); the dog stays the
emotional focal point. No wilderness, no snow, no adventure-brand energy, no
cheesy stock-photo staging.

**Replacement prompt:**

> Editorial photograph of a calm, healthy black-and-white Siberian Husky on a
> stainless steel veterinary exam table, being gently held and examined by a
> veterinarian in clean scrubs — only the vet's hands and torso in frame, the
> dog is the clear focal point. Modern, bright, minimal clinic interior, soft
> even light, shallow depth of field. Premium healthcare-brand photography,
> muted cool color palette that sits with a teal system colour, realistic fur
> detail, gentle trusting expression. No faces, no text, no clutter. Vertical
> 4:5 frame, high resolution.

---

## Slot: `flow` — patient-flow / continuity transition

| Field | Value |
| --- | --- |
| Filename | `apps/web/public/landing/flow-portrait.jpg` |
| Rendered aspect ratio | `1 / 1` |
| Source pixel dimensions | `1100 × 1100` |
| Focal point (`object-position`) | `52% 44%` — the cat's face |
| `alt` | `"A cat being examined in a veterinary clinic"` |
| Temporary asset | Unsplash photo `1733783506192-653df6185a7d` (white cat on a stainless exam table, gloved hands) |

**Role in the page:** during the patient-journey scroll scene this portrait
wipes up from behind the Sparki panel with a `mask-image` reveal, feathered on
every edge so it reads as part of the scene, not a card. Also the blurred
backdrop the Today patient-flow list floats over on mobile.

**Final generated image should depict:** the same idea as the hero, for a cat —
a calm cat on a veterinary exam table being gently handled or examined by
clinical staff (gloved hands, scrubs), the cat as the clear focal point, the
human not dominating. Clean modern clinic, cool neutral palette. Not a home
scene, not decorative pet photography.

**Replacement prompt:**

> Editorial photograph of a calm cat on a stainless steel veterinary exam
> table, gently held and examined by a veterinarian in clean scrubs and exam
> gloves — only hands and torso in frame, the cat is the clear focal point.
> Bright minimal clinic interior, soft even light, shallow depth of field.
> Premium healthcare-brand photography, muted cool color palette, realistic fur
> detail, calm trusting mood. No faces, no text, no clutter. Square 1:1 frame,
> high resolution.

---

## Adding or removing a slot

Slots are defined once in `landing-images.ts`. Adding one means adding a
registry entry plus a `<LandingImage slot="…">` usage and (optionally) a
`.fig<slot>` mask rule in `landing.module.css`. Keep the total at two unless
there is a strong reason: a few exceptional images beat many average ones, and
a small photograph dropped into a busy composition reads as a sticker.
