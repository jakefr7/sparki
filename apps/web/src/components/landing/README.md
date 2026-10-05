# Public Sparki experience

The founder’s landing-page request authorizes this bounded public UI work independently of clinical phase closeout. It changes no clinical, inventory, tenant, or financial policy.

- `/` renders the landing page without a session cookie. Requests with a session cookie retain the existing Operations Command Center; the API remains responsible for actual authorization.
- Demo CTAs have blank hrefs and prevent navigation. The demo page has been removed at the founder’s request.
- The root layout avoids clinic bootstrap requests when no session exists.
- The palette follows `globals.css`’s dashboard: `#172633`, `#667586`, `#dde7e9`, teal `#1fa9a0`, and the teal/cyan brand gradient. CSS Modules keep public styling isolated from authenticated screens.
- Product scenes are expressly illustrative, contain no real patient data, and are not interactive clinical workflows. The journey preserves distinct departure and record-finalization steps.
- The compact patient journey uses native buttons on every viewport, including keyboard and reduced-motion use. It spans appointment through record review without a pinned scroll section. Fixed-width illustrative product scenes scale inside responsive preview frames.
- Typography uses the existing system stack. No runtime dependencies, external assets, tracking, booking services, or remote fonts were added.
- `public-header.tsx` is the one header row for every public page (`/` and `/pricing`), with its own stylesheet. Pages must not carry their own copy; `public-e2e/public-header.spec.ts` fails if the two pages' headers differ.

## Demo integration

Demo links are placeholders only; there is no demo form or submission.

## Verification

Run `pnpm --filter @sparki/web exec playwright test --config playwright.public.config.ts` for the database-free public suite. It starts a local web server on port 3001 if needed. The existing isolated product Playwright harness remains unchanged.

The suite covers public routes, protected-route redirects, the session-bearing dashboard branch, inert demo links, keyboard controls, reduced motion, mobile navigation, and layouts from 320px through 1920px. Responsive screenshots are written to `/tmp` for visual review.

Repository verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Existing lint warnings and global CSS Autoprefixer warnings remain outside this change. The historical clinical Playwright debt is not remediated by this work.

## Landing-page completion pass

Preserves the existing hero, patient journey, feature grid, and closing CTA. Tightens section spacing, shows the complete product-preview composition, adds workflow details to the feature cards, and keeps record finalization distinct from checkout. Demo CTAs remain inert placeholders.

`landing-journey.spec.ts` covers all eight keyboard-selectable stages and bounds the mobile section height. Two historical tests in `landing.spec.ts` still target the earlier role/platform controls and scroll-driven story; those tests are preserved and are not evidence for this version.
