# Landing page — animal image direction

The public landing page (`apps/web/src/components/landing/`) uses a small,
intentional set of dog / cat portraits for warmth. **The current files are
temporary, license-clear Unsplash photographs** used so the page can be fully
designed, animated, and reviewed now. They are _not_ permanent brand assets.

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
| Rendered aspect ratio | `4 / 5` (portrait crop out of a `4 / 3` source) |
| Source pixel dimensions | `1600 × 1200` |
| Focal point (`object-position`) | `52% 40%` — the eyes |
| `alt` | `""` (decorative; the hero headline carries meaning) |
| Temporary asset | Unsplash photo `1543466835-00a7907e9de1` (beagle, outdoor, natural light) |

**Role in the page:** lower-left depth layer of the hero. Sits behind the
Sparki dashboard window on a nearer plane, ~30–40% visible, softly blurred at
the edges by a radial mask, parallax-offset from the UI on scroll and on
cursor movement.

**Final generated image should depict:** a single medium-or-large dog in a
calm three-quarter head-and-shoulders portrait, looking just off camera,
relaxed open mouth or soft closed mouth (not a hard "smile"), warm golden or
sable coat. Clean, out-of-focus mid-tone background (studio sweep or soft
natural greenery), strong but soft key light from front-left, shallow depth of
field. Editorial campaign feel. Generous negative space on the left third for
the portrait to bleed into the page.

**Replacement prompt:**

> Editorial studio portrait of a single friendly medium-sized dog, warm sable
> and cream coat, calm three-quarter view looking gently off-camera, soft
> relaxed expression. Shot on an 85mm lens at f/1.8, shallow depth of field,
> soft directional key light from front-left with a subtle warm fill, smooth
> out-of-focus warm-neutral background. Premium pet-brand campaign photography,
> natural realistic fur detail, catchlight in the eyes, generous empty space on
> the left side of the frame. Muted, sophisticated color palette. No people, no
> collar tags, no text, no props. 4:3 frame, high resolution.

---

## Slot: `flow` — patient-flow / continuity transition

| Field | Value |
| --- | --- |
| Filename | `apps/web/public/landing/flow-portrait.jpg` |
| Rendered aspect ratio | `1 / 1` (square crop out of a `3 / 2` source) |
| Source pixel dimensions | `1600 × 1101` |
| Focal point (`object-position`) | `50% 34%` — between the eyes |
| `alt` | `"A clinic patient"` |
| Temporary asset | Unsplash photo `1514888286974-6c03e2ca1dba` (tuxedo cat, green wall) |

**Role in the page:** during the patient-journey scroll scene this portrait
wipes in from behind the Sparki panel with a vertical `mask-image` reveal, then
collapses / cross-fades into the circular patient avatar inside the record —
the "this animal _is_ this Sparki patient" beat. Also used as the blurred
backdrop the Today patient-flow list floats over on mobile.

**Final generated image should depict:** a single cat (or could be a small
dog) in a head-on, symmetrical portrait, direct eye contact, alert but calm,
front paws / chest visible as if perched. Plain flat-color wall behind in a
muted green or teal that harmonizes with Sparki. Even, soft frontal light.
Strong central composition so the circular crop lands cleanly on the face.

**Replacement prompt:**

> Editorial head-on portrait of a single calm cat with striking eyes, looking
> directly at the camera, front paws visible resting on a ledge. Plain
> smooth muted sage-green wall background, soft even frontal lighting, gentle
> shadow. Symmetrical centered composition, face in the exact middle of the
> frame. Realistic detailed fur, sharp catchlights, shallow background. Modern
> premium pet-brand editorial photography, calm and trustworthy mood, refined
> muted color grade. No people, no text, no props, no collar. Square 1:1 frame,
> high resolution.

---

## Slot: `belief` — "built for how clinics actually work"

| Field | Value |
| --- | --- |
| Filename | `apps/web/public/landing/belief-portrait.jpg` |
| Rendered aspect ratio | `3 / 4` (portrait crop out of a `3 / 2` source) |
| Source pixel dimensions | `1600 × 1067` |
| Focal point (`object-position`) | `62% 42%` — the dog's face, right of centre |
| `alt` | `""` (decorative; paired with the section heading) |
| Temporary asset | Unsplash photo `1561037404-61cd46aa615b` (small dog, pink studio sweep) |

**Role in the page:** paired beside the belief statement. Enters with a
diagonal `mask-image` reveal as the product UI recedes and blurs into a
background layer. The empty side of the frame overlaps the text column.

**Final generated image should depict:** a single small-to-medium dog, clean
studio portrait on a seamless paper sweep in a soft warm neutral (blush, sand,
or warm grey), head and upper chest, direct or near-direct eye contact, ears
up and attentive, honest and grounded expression. Clearly art-directed
one-light studio look with a soft falloff. The animal sits to one side of the
frame leaving a clean empty region for the headline to sit against.

**Replacement prompt:**

> Minimal studio portrait of a single small attentive dog on a seamless warm
> blush-grey paper backdrop, head and chest, ears up, calm honest expression,
> near-direct eye contact. One large soft key light, gentle shadow falloff,
> subtle vignette. Subject positioned to the right third of the frame with
> clean empty backdrop on the left for text. Realistic fur and catchlights,
> refined muted campaign color grade, premium pet-brand aesthetic. No people,
> no text, no props, no visible collar. 3:2 frame, high resolution.

---

## Adding or removing a slot

Slots are defined once in `landing-images.ts`. Adding one means adding a
registry entry plus a `<LandingImage slot="…">` usage and (optionally) a
`.figure--<slot>` mask rule in `landing.module.css`. Keep the total at three
unless there is a strong reason: a few exceptional images beat many average
ones.
