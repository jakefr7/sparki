# Public Sparki experience

The founder’s landing-page request authorizes this bounded public UI work independently of clinical phase closeout. It changes no clinical, inventory, tenant, or financial policy.

- `/` renders the landing page without a session cookie. Requests with a session cookie retain the existing Operations Command Center; the API remains responsible for actual authorization.
- `/demo` is public. All demo CTAs use this first-party destination.
- The root layout avoids clinic bootstrap requests when no session exists.
- The palette follows `globals.css`’s dashboard: `#172633`, `#667586`, `#dde7e9`, teal `#1fa9a0`, and the teal/cyan brand gradient. CSS Modules keep public styling isolated from authenticated screens.
- Product scenes are expressly illustrative, contain no real patient data, and are not interactive clinical workflows. The journey preserves distinct departure and record-finalization steps.
- Motion uses CSS and a requestAnimationFrame-throttled scroll listener. Mobile, short viewports, and reduced-motion preferences use direct journey selection. Role and platform controls are keyboard-operable native buttons.
- Typography uses the existing system stack. No runtime dependencies, external assets, tracking, booking services, or remote fonts were added.

## Demo integration

There is no existing demo lead model. `src/lib/demo-request.ts` owns the submission boundary and `DEMO_REQUEST_AVAILABLE` remains false. The form explains that nothing is sent or saved, and its submit control is disabled. The adapter also fails honestly if invoked. Future work must implement actual first-party persistence, validation, abuse protection, and delivery/error semantics before enabling requests. Entered values are not stored in localStorage or logged.

## Verification

Run `pnpm --filter @sparki/web exec playwright test --config playwright.public.config.ts` for the database-free public suite. It starts a local web server on port 3001 if needed. The existing isolated product Playwright harness remains unchanged.

The suite covers public routes, protected-route redirects, the session-bearing dashboard branch, demo destinations, keyboard controls, reduced motion, non-delivery of demo details, mobile navigation, and layouts from 320px through 1920px. Responsive screenshots are written to `/tmp` for visual review.

Repository verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Existing lint warnings and global CSS Autoprefixer warnings remain outside this change. The historical clinical Playwright debt is not remediated by this work.
