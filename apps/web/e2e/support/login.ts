import type { Page } from '@playwright/test';

/**
 * Signs in as one of the seeded dev staff accounts (scripts/seed-auth-users.mjs)
 * before navigating to a protected page. The middleware in
 * apps/web/src/middleware.ts redirects any request without a `sparki_session`
 * cookie to /login, so every e2e test that visits an app page needs this.
 */
export async function loginAs(
  page: Page,
  email: 'testrecept@gmail.com' | 'testtech@gmail.com' | 'testvet@gmail.com' = 'testrecept@gmail.com',
): Promise<void> {
  await page.goto('/login');
  // Wait past hydration — clicking "Sign in" before the client bundle
  // attaches the onSubmit handler falls back to a native form GET (visible
  // as ?email=...&password=... in the URL) instead of the fetch-based login.
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('SparkiTest123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
}
