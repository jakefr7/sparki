import { defineConfig, devices } from '@playwright/test';

// Public marketing coverage requires neither a database nor an API server.
// Keep the existing isolated product harness and its auth fixtures unchanged.
export default defineConfig({
  testDir: './public-e2e',
  outputDir: '/tmp/sparki-public-test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3001', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'node_modules/.bin/next dev --hostname 127.0.0.1 --port 3001',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
