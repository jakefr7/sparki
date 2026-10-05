import { expect, test } from '@playwright/test';

// Staging renders pages on a UTC server for Central-time browsers. A browser
// zone whose wall clock can never equal this machine's reproduces that
// difference wherever the suite runs.
const serverZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
test.use({ timezoneId: serverZone === 'Asia/Kolkata' ? 'America/Chicago' : 'Asia/Kolkata' });

for (const path of ['/patients', '/inventory']) {
  test(`${path} hydrates cleanly when the server and browser time zones differ`, async ({ page }) => {
    const hydrationErrors: string[] = [];
    const record = (message: string) => { if (/hydrat|#418/i.test(message)) hydrationErrors.push(message); };
    page.on('pageerror', (error) => record(error.message));
    page.on('console', (message) => { if (message.type() === 'error') record(message.text()); });

    await page.goto(path);
    // The header clock ticks every 30 seconds, so allow one tick for a minute rollover.
    await expect.poll(() => page.evaluate(() => document.querySelector('.dashboard-header__meta span')?.textContent === new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })), { timeout: 35_000 }).toBe(true);

    expect(hydrationErrors).toEqual([]);
  });
}
