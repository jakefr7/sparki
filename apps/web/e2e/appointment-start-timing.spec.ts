import { expect, test } from '@playwright/test';

for (const [offset, role, action] of [[-3, 'VETERINARIAN', 'Begin Intake'], [3, 'TECHNICIAN', 'Begin Intake'], [-2, 'RECEPTIONIST', 'Check In']] as const) {
  test(`${role} can start an appointment booked ${offset} days away`, async ({ page, context }) => {
    await context.addCookies([{ name: 'sparki_session', value: 'scheduler-ui-fixture', domain: '127.0.0.1', path: '/' }]);
    const day = new Date();
    day.setDate(day.getDate() + offset);
    day.setHours(10, 0, 0, 0);
    const scheduledAt = day.toISOString();
    const calls: string[] = [];
    const appointment = { id: 'timing-appointment', type: 'Wellness', reason: 'Timing test', state: 'Scheduled', scheduledAt, expectedDurationMinutes: 30, patient: { id: 'timing-patient', name: 'Timing Patient', species: 'Canine' }, client: { id: 'client', firstName: 'Test', lastName: 'Client' }, provider: null, room: null };
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST') calls.push(path);
      const json = path === '/api/appointments/timing-appointment/arrive' ? { ...appointment, state: 'Arrived' }
        : path === '/api/visits' ? { id: 'timing-visit' }
        : path === '/api/visits/timing-visit/start' ? { id: 'timing-visit', state: 'IntakeInProgress' }
        : path.endsWith('/notifications') ? { planning: { upToDate: true }, automatedTexts: { anyEnabled: false, allowedForAppointmentType: true }, recipient: { canReceiveAutomatedTexts: false }, notifications: [] }
        : path === '/api/appointments/schedule' ? [appointment]
        : path === '/api/scheduler-config' ? { settings: { slotIntervalMinutes: 30 }, appointmentTypes: [], slotTemplates: [], canManage: false }
        : path === '/api/auth/me' ? { user: { id: 'user', name: 'Test Staff', role, permissions: [] } }
        : path === '/api/auth/profile' ? { firstName: 'Test', lastName: 'Staff', displayName: 'Test Staff', avatarUrl: null }
        : path === '/api/clinic/billing' ? { isRestricted: false, subscriptionStatus: 'ACTIVE' }
        : path === '/api/staff' ? [] : {};
      return route.fulfill({ json });
    });
    await page.goto('/scheduler');
    await page.getByLabel('Go to date').fill(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`);
    await page.locator('.scheduler-appointment-card').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Timing Patient');
    if (offset === 3) {
      const footer = dialog.locator('.appointment-viewer__actions');
      for (const width of [1440, 1024]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect.poll(() => footer.evaluate(element => {
          const actions = [...element.querySelectorAll('button, a')].map(action => action.getBoundingClientRect());
          return actions.length === 4 && actions.every(box => Math.abs(box.height - actions[0]!.height) < 1 && Math.abs(box.width - actions[0]!.width) < 1) && Math.abs(actions[0]!.top - actions[1]!.top) < 1 && Math.abs(actions[2]!.top - actions[3]!.top) < 1 && element.scrollWidth <= element.clientWidth;
        })).toBe(true);
        await footer.screenshot({ path: `/tmp/sparki-popup-actions-${width}.png` });
      }
    }
    await dialog.getByRole('button', { name: action, exact: true }).click();
    await expect(page).toHaveURL(/\/visits\/timing-visit$/);
    expect(calls).toEqual(['/api/appointments/timing-appointment/arrive', '/api/visits', ...(role === 'RECEPTIONIST' ? [] : ['/api/visits/timing-visit/start'])]);
  });
}
