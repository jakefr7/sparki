import { defineConfig, devices } from '@playwright/test';

// Matches docker-compose.yml so `docker compose up -d && pnpm test:e2e`
// works out of the box, same convention as apps/api/vitest.config.ts.
// NODE_ENV isn't set here (unlike vitest.config.ts): Next.js's ambient types
// declare it read-only, and DevelopmentAuthGuard treats every non-production
// value the same way, so the zod schema's 'development' default is fine.
process.env.DATABASE_URL ??= 'postgresql://sparki:sparki@localhost:55432/sparki?schema=public';
process.env.API_PORT ??= '4000';
process.env.API_URL ??= 'http://localhost:4000';
process.env.WEB_PORT ??= '3000';

const WEB_URL = `http://localhost:${process.env.WEB_PORT}`;
const shouldStartWebServers = process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
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
            reuseExistingServer: !process.env.CI,
            cwd: '../..',
            timeout: 60_000,
          },
          {
            command: 'pnpm --filter @sparki/web run dev',
            url: WEB_URL,
            reuseExistingServer: !process.env.CI,
            cwd: '../..',
            timeout: 60_000,
          },
        ],
      }
    : {}),
});
