import { expect, test } from '@playwright/test';

test('scheduler changes date, zooms to 15-minute slots, and picks up an external appointment', async ({ page }) => {
  await page.route('**/api/staff?canReceiveAppointments=true', (route) => route.fulfill({ json: [{ id: 'navigation-provider', displayName: 'Navigation Test Vet', role: 'VETERINARIAN', isActive: true }] }));
  await page.goto('/scheduler');
  await expect(page.getByRole('status').filter({ hasText: 'Auto-updating' })).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect.poll(() => page.locator('.scheduler-toolbar').evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(64);
  await expect(page.locator('.scheduler-time-column__quarter').first()).toBeHidden();
  await page.screenshot({ path: '/tmp/sparki-toolbar-compact.png' });
  const nowLabel = page.locator('.scheduler-now-indicator__label');
  await expect(nowLabel).toBeVisible();
  await expect.poll(async () => {
    const label = await nowLabel.boundingBox();
    const gutter = await page.locator('.scheduler-time-column').boundingBox();
    return Boolean(label && gutter && label.x >= gutter.x + gutter.width);
  }).toBe(true);
  await nowLabel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/sparki-now-indicator.png' });
  const loaded = page.waitForResponse((response) => response.url().includes('/api/appointments/schedule?') && response.ok());
  await page.getByLabel('Go to date').fill('2026-11-18');
  await loaded;
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() => page.locator('.scheduler-toolbar').evaluate((node) => node.getBoundingClientRect().height)).toBeLessThan(104);
  await expect(page.getByRole('status').filter({ hasText: 'appointments in this day' })).toBeVisible();
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByLabel('Calendar zoom level')).toHaveText('150%');
  await expect(page.locator('.scheduler-time-column__quarter').first()).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const quarterHourSlot = page.getByRole('button', { name: /New appointment at 10:15 AM/ });
  await expect(quarterHourSlot).toBeVisible();
  await quarterHourSlot.hover();
  await expect(quarterHourSlot.getByText('+ 10:15 AM')).toBeVisible();
  await expect(page.getByLabel('Calendar zoom level')).toHaveText('175%');
  await expect(page.locator('.scheduler-time-column').getByText('7:00 AM', { exact: true })).toBeVisible();
  await expect(page.locator('.scheduler-time-column').getByText('12:00 PM', { exact: true })).toBeVisible();
  await expect(page.locator('.scheduler-time-column span')).toHaveCount(48);
  await expect(page.locator('.scheduler-time-column__quarter').first()).toBeVisible();
  await expect(page.locator('.scheduler-time-column__half').first()).toBeVisible();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('.scheduler-time-column__quarter').first()).toBeVisible();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  const calendar = page.getByRole('region', { name: 'Day appointment calendar' });
  await expect.poll(() => calendar.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await calendar.evaluate((node) => { node.scrollTop = 0; });
  const ruler = await page.locator('.scheduler-time-column').boundingBox();
  expect(ruler).not.toBeNull();
  await page.mouse.move(ruler!.x + ruler!.width / 2, ruler!.y + 70);
  await page.mouse.wheel(0, 480);
  await expect.poll(() => calendar.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByLabel('Calendar zoom level')).toHaveText('175%');
  await page.locator('.scheduler-zoom').dispatchEvent('wheel', { deltaY: -100, clientY: 450 });
  await expect(page.getByLabel('Calendar zoom level')).toHaveText('205%');
  await page.locator('.scheduler-calendar-zoom').dispatchEvent('wheel', { deltaY: 20, ctrlKey: true, clientY: 450 });
  await expect(page.getByLabel('Calendar zoom level')).toHaveText('185%');
  await page.locator('.scheduler-day-column').dispatchEvent('wheel', { deltaY: 100 });
  await expect(page.getByLabel('Calendar zoom level')).toHaveText('185%');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.getByLabel('Calendar zoom level')).toHaveText('160%');
  await expect(page.locator('.scheduler-time-column__quarter').first()).toBeVisible();

  const provider = page.getByRole('combobox', { name: 'Provider', exact: true });
  await provider.selectOption('navigation-provider');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(provider).toHaveValue('all');

  const scheduledAt = new Date(2026, 10, 18, 10, 15).toISOString();
  await page.route('**/api/appointments/schedule?*', (route) => route.fulfill({ json: [{
    id: 'externally-added-test-appointment', appointmentTypeSettingId: null, type: 'SickVisit',
    reason: 'External scheduler update', state: 'Scheduled', scheduledAt,
    expectedDurationMinutes: 30, colorKey: null, patient: { id: 'test-patient', name: 'Newly Booked Patient', species: 'Canine' },
    client: { id: 'test-client', firstName: 'Test', lastName: 'Client' }, provider: null,
    primaryCareVetName: null, previousClinicName: null, previousRecordsSource: null,
    lastSeenAt: null, recordsPrepStatus: 'NotStarted', confirmationStatus: 'NotSent',
    room: null, schedulerSlotTemplateId: null, schedulingIssue: null,
  }] }));
  await expect(page.getByRole('button', { name: /Newly Booked Patient/ })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('status').filter({ hasText: '1 of 1 appointments in this day' })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByLabel('Go to date')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Week', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/tmp/sparki-scheduler-navigation.png' });
});

test('inventory search does not reload operational data and preserves the item view across tabs', async ({ page }) => {
  let inventoryRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/inventory/')) inventoryRequests++;
  });
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await expect(page.getByRole('row', { name: /Carprofen 75 mg tablets/ })).toBeVisible();
  const initialRequests = inventoryRequests;
  await page.getByRole('button', { name: 'Medications', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search items' }).fill('no-matching-item-navigation-test');
  await expect(page.getByText('No items in this view')).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Items', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Medications', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Search items' })).toHaveValue('no-matching-item-navigation-test');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search items' })).toBeEmpty();
  await expect(page.getByRole('button', { name: 'All Items', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('No items in this view')).toBeHidden();
  expect(inventoryRequests).toBe(initialRequests);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole('textbox', { name: 'Search items' })).toBeInViewport();
  await page.screenshot({ path: '/tmp/sparki-inventory-navigation.png' });
  await page.getByRole('row', { name: /Carprofen 75 mg tablets/ }).click();
  const drawer = page.locator('.item-drawer');
  await expect(drawer.getByText('Available stock excludes reserved, quarantined, and expired quantities.')).toBeVisible();
  await drawer.getByRole('button', { name: 'Adjust stock', exact: true }).click();
  const modal = page.locator('.inventory-modal');
  await expect(modal.getByRole('combobox', { name: 'Item', exact: true }).locator('option:checked')).toHaveText('Carprofen 75 mg tablets');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(drawer.getByRole('heading', { name: 'Carprofen 75 mg tablets' })).toBeVisible();

});
