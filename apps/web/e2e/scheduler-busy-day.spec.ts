import { expect, test } from '@playwright/test';

test('a full day shows appointment types without covering adjacent bookings', async ({ page, context }, testInfo) => {
  await context.addCookies([{ name: 'sparki_session', value: 'scheduler-ui-fixture', domain: '127.0.0.1', path: '/' }]);
  const day = new Date();
  day.setHours(9, 0, 0, 0);
  let offset = 0;
  const appointments = Array.from({ length: 20 }, (_, index) => {
    const duration = index < 8 ? 15 : 30;
    const scheduledAt = new Date(day.getTime() + offset * 60000).toISOString();
    offset += duration;
    return { id: `busy-${index}`, appointmentTypeSettingId: 'exam-type', type: 'Wellness', reason: 'Detailed clinical notes stay in appointment details', state: 'Scheduled', scheduledAt, expectedDurationMinutes: duration, colorKey: null, patient: { id: `patient-${index}`, name: `Patient ${index + 1}`, species: 'Canine' }, client: { id: 'client', firstName: 'Test', lastName: 'Client' }, provider: null, room: null, schedulerSlotTemplateId: null };
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path.endsWith('/notifications') ? { planning: { upToDate: true }, automatedTexts: { anyEnabled: false, allowedForAppointmentType: true }, recipient: { canReceiveAutomatedTexts: false, reason: null }, notifications: [] }
      : path === '/api/appointments/schedule' ? appointments
      : path === '/api/scheduler-config' ? { settings: { slotIntervalMinutes: 30 }, appointmentTypes: [{ id: 'exam-type', appointmentType: 'Wellness', name: 'Annual exam', color: '#176f69', isActive: true, sortOrder: 0, defaultDurationMinutes: 30 }], slotTemplates: [], canManage: false }
      : path === '/api/auth/profile' ? { firstName: 'Test', lastName: 'Vet', displayName: 'Test Vet', avatarUrl: null }
      : path === '/api/staff' ? []
      : path === '/api/clinic/billing' ? { isRestricted: false, subscriptionStatus: 'ACTIVE' }
      : path === '/api/auth/me' ? { user: { id: 'user', name: 'Test Vet', role: 'VETERINARIAN', permissions: [] } }
      : {};
    return route.fulfill({ json });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/scheduler');
  const cards = page.locator('.scheduler-appointment-card');
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).toContainText('Annual exam');
  await expect(cards.first()).not.toContainText('Detailed clinical notes');
  for (const view of ['Week', 'Day']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(page.locator('.scheduler-time-column__quarter').first()).toBeVisible();
    await expect(page.locator('.scheduler-time-column__half').first()).toBeVisible();
    const firstLabelGap = await page.locator('.scheduler-time-column').evaluate((column) => {
      const labels = column.querySelectorAll('span');
      return labels[1]!.getBoundingClientRect().top - labels[0]!.getBoundingClientRect().bottom;
    });
    expect(firstLabelGap).toBeGreaterThanOrEqual(0);
    await expect(page.getByRole('button', { name: 'New appointment at 9:15 AM', exact: true }).last()).toBeAttached();
    for (let step = 0; step < 2; step++) {
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect(page.locator('.scheduler-time-column__quarter').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'New appointment at 9:15 AM', exact: true }).last()).toBeAttached();
    }
    for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    const boxes = await cards.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    }).sort((a, b) => a.top - b.top));
    for (let index = 1; index < boxes.length; index++) expect(boxes[index]!.top - boxes[index - 1]!.bottom).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`busy-${view}.png`), fullPage: true });
  }
  await cards.last().click();
  await expect(page.getByRole('dialog')).toContainText('Detailed clinical notes stay in appointment details');
});
