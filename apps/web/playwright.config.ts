import { defineConfig, devices } from '@playwright/test';

// Matches docker-compose.yml so `docker compose up -d && pnpm test:e2e`
// works out of the box, same convention as apps/api/vitest.config.ts.
// NODE_ENV isn't set here (unlike vitest.config.ts): Next.js's ambient types
// declare it read-only, and DevelopmentAuthGuard treats every non-production
// value the same way, so the zod schema's 'development' default is fine.
const isolatedDatabase = process.env.SPARKI_ISOLATED_TEST_DATABASE;
const configuredDatabase = process.env.DATABASE_URL
  ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1))
  : undefined;

if (
  !isolatedDatabase ||
  configuredDatabase !== isolatedDatabase ||
  !/^sparki_test_playwright_[a-f0-9]{32}$/.test(isolatedDatabase)
) {
  throw new Error('Playwright requires an isolated DATABASE_URL. Run pnpm test:e2e.');
}
process.env.API_PORT ??= '4000';
process.env.API_URL ??= 'http://127.0.0.1:4000';
process.env.WEB_PORT ??= '3001';

const WEB_URL = `http://127.0.0.1:${process.env.WEB_PORT}`;
const shouldStartWebServers = process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    // Most product-flow specs exercise application behavior rather than the
    // login form. Give each fresh browser context the explicit fixed OWNER
    // fixture used by non-role-specific setup requests. Next middleware checks
    // cookie presence while the API guard resolves this value to that fixture.
    // Role-specific auth specs deliberately clear it and log in explicitly.
    storageState: {
      cookies: [
        {
          name: 'sparki_session',
          value: 'dev:dev-user',
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Boots the real API (dev-auth guard, real Postgres) and the real web app
  // for the duration of the run, exactly like a developer running
  // `pnpm dev` — this is a black-box UI test, not a mocked one.
  ...(shouldStartWebServers
    ? {
        webServer: [
          {
            command: 'pnpm --filter @sparki/api run dev',
            url: `${process.env.API_URL}/health/ready`,
            reuseExistingServer: false,
            cwd: '../..',
            timeout: 60_000,
          },
          {
            command: 'pnpm --filter @sparki/web run dev',
            url: WEB_URL,
            reuseExistingServer: false,
            cwd: '../..',
            timeout: 60_000,
          },
        ],
      }
    : {}),
});
