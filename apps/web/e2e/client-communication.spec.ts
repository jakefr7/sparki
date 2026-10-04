import { expect, test, type APIRequestContext } from '@playwright/test';
import { prismaUnscoped as prisma } from '@sparki/db';

const api = process.env.API_URL ?? 'http://127.0.0.1:4000';
let counter = 110;
async function fixture(request: APIRequestContext, firstName: string) {
  counter += 1;
  const response = await request.post(`${api}/clients`, {
    data: { firstName, lastName: 'Communication test', phone: `3125550${counter}` },
  });
  expect(response.ok()).toBe(true);
  const client = await response.json();
  const opened = await request.post(`${api}/client-communication/threads`, {
    data: { clientId: client.id },
  });
  expect(opened.ok()).toBe(true);
  const { thread } = await opened.json();
  const reply = await request.post(
    `${api}/client-communication/threads/${thread.id}/simulated-replies`,
    { data: { body: `Hello from ${firstName}` } },
  );
  expect(reply.ok()).toBe(true);
  return { client, thread };
}

test.beforeEach(async ({ request }) => {
  expect((await request.get(`${api}/client-communication/readiness`)).ok()).toBe(true);
  await prisma.clientMessagingChannel.upsert({
    where: { locationId: 'dev-location' },
    create: {
      organizationId: 'dev-organization',
      locationId: 'dev-location',
      provider: 'SIMULATED',
      status: 'ACTIVE',
    },
    update: { provider: 'SIMULATED', status: 'ACTIVE' },
  });
});

test('Communication navigation stays visible between pages and temporary readiness failures', async ({ page }) => {
  await page.clock.install();
  let status = 200;
  let visible = true;
  await page.route('**/api/client-communication/readiness', (route) =>
    route.fulfill({ status, json: { visible } }),
  );
  await page.goto('/patients');
  const communication = page.getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Client Communication', exact: true });
  await expect(communication).toBeVisible();
  status = 503;
  await page.getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Inventory', exact: true }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(communication).toBeVisible();
  // Exercise the next poll without waiting ten seconds in real time.
  const failedPoll = page.waitForResponse((response) =>
    response.url().endsWith('/api/client-communication/readiness') && response.status() === 503,
  );
  await page.clock.fastForward(10000);
  await failedPoll;
  await expect(communication).toBeVisible();
  status = 200;
  visible = false;
  const disabledPoll = page.waitForResponse((response) =>
    response.url().endsWith('/api/client-communication/readiness') && response.status() === 200,
  );
  await page.clock.fastForward(10000);
  await disabledPoll;
  await expect(communication).toHaveCount(0);
});

test('busy inbox keeps recipient drafts, updates incoming replies, and separates reply permission from automated consent', async ({
  page,
  request,
}) => {
  const jordan = await fixture(request, 'Jordan');
  await fixture(request, 'Casey');
  await page.goto(`/communication?thread=${jordan.thread.id}`);
  await expect(
    page.getByRole('heading', { name: 'Client communication', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Hello from Jordan', { exact: true }).last()).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'Message to client' });
  await composer.fill('Jordan-only draft');
  await page.getByRole('button', { name: /Casey Communication test/ }).click();
  await expect(composer).toHaveValue('');
  await composer.fill('Casey-only draft');
  await page.getByRole('button', { name: /Jordan Communication test/ }).click();
  await expect(composer).toHaveValue('Jordan-only draft');
  expect((await request.get(`${api}/client-communication/threads/${jordan.thread.id}`)).ok()).toBe(
    true,
  );
  expect(
    (await (await request.get(`${api}/client-communication/threads/${jordan.thread.id}`)).json())
      .unread,
  ).toBe(true);
  await page.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark unread', exact: true })).toBeVisible();
  await request.post(`${api}/client-communication/threads/${jordan.thread.id}/simulated-replies`, {
    data: { body: 'Can we come Friday?' },
  });
  await expect(page.getByText('Can we come Friday?', { exact: true }).last()).toBeVisible({
    timeout: 10000,
  });
  await expect(composer).toHaveValue('Jordan-only draft');
  await expect(
    page.getByText('Automated appointment texts need staff-recorded agreement.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Record client agreement' }).click();
  await expect(page.getByRole('button', { name: 'Save agreement' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /The client agreed/ }).check();
  await page.getByRole('button', { name: 'Save agreement' }).click();
  await expect(
    page.getByText('Recorded agreement allows automated appointment texts.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save simulated message', exact: true }).click();
  await expect(composer).toHaveValue('');
  await expect(page.getByText('Jordan-only draft', { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/Simulated · not sent externally/).last()).toBeVisible();
  await request.post(`${api}/client-communication/threads/${jordan.thread.id}/simulated-replies`, {
    data: { body: 'STOP' },
  });
  await expect(
    page.getByRole('button', { name: 'Save simulated message', exact: true }),
  ).toBeDisabled({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Record client agreement' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save agreement' })).toHaveCount(0);
  await request.post(`${api}/client-communication/threads/${jordan.thread.id}/simulated-replies`, {
    data: { body: 'START' },
  });
  await expect(
    page.getByText('Automated appointment texts need staff-recorded agreement.'),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Record client agreement' })).toBeVisible({
    timeout: 10000,
  });
  await composer.fill('Ready to reply');
  await expect(
    page.getByRole('button', { name: 'Save simulated message', exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: '/private/tmp/sparki-client-communication-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('button', { name: 'Client details', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Client details' })).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByRole('button', { name: '← Conversations' })).toBeVisible();
  const sendBounds = await page
    .getByRole('button', { name: 'Save simulated message', exact: true })
    .boundingBox();
  expect(sendBounds!.y + sendBounds!.height).toBeLessThanOrEqual(1180);
  await page.screenshot({
    path: '/private/tmp/sparki-client-communication-tablet.png',
    fullPage: true,
  });
});

test('a lost send response can be checked without sending twice', async ({ page, request }) => {
  const { thread } = await fixture(request, 'Morgan');
  await page.goto(`/communication?thread=${thread.id}`);
  const composer = page.getByRole('textbox', { name: 'Message to client' });
  await composer.fill('Unique safe-send reply');
  let dropped = false;
  await page.route(`**/api/client-communication/threads/${thread.id}/messages`, async (route) => {
    if (route.request().method() === 'POST' && !dropped) {
      dropped = true;
      await route.fetch(); // Backend saved it, but the browser never saw the response.
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save simulated message', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check send safely' })).toBeVisible();
  await expect(composer).toBeDisabled();
  await page.getByRole('button', { name: 'Check send safely' }).click();
  await expect(composer).toHaveValue('');
  const transcript = await (
    await request.get(`${api}/client-communication/threads/${thread.id}/messages`)
  ).json();
  expect(
    transcript.messages.filter(
      (message: { body: string }) => message.body === 'Unique safe-send reply',
    ),
  ).toHaveLength(1);
});

test('new conversation searches clients and does not silently grant consent', async ({
  page,
  request,
}) => {
  const response = await request.post(`${api}/clients`, {
    data: { firstName: 'Avery', lastName: 'New texting client', phone: '3125550987' },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/communication');
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Client name or phone' })
    .fill('Avery New texting client');
  await page.getByRole('button', { name: '3125550987', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Avery New texting client', exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Message to client' }).fill('Needs consent first');
  await expect(
    page.getByRole('button', { name: 'Save simulated message', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Automated appointment texts need staff-recorded agreement.'),
  ).toBeVisible();
});

test('manager settings preview, persist across tabs, and save clinic rules', async ({
  page,
  request,
}) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Appointment texts', exact: true }).click();
  const confirmation = page.getByRole('group', { name: 'Booking confirmation', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole('textbox', { name: 'Message wording' })
    .fill('See you on {appointment_date} at {appointment_time}, {patient_name}.');
  await confirmation.getByRole('checkbox', { name: /Off|On/ }).check();
  await confirmation.getByRole('button', { name: 'Preview client text' }).click();
  await expect(confirmation.getByText(/Example only/)).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Appointment texts', exact: true }).click();
  await expect(confirmation.getByRole('textbox', { name: 'Message wording' })).toHaveValue(
    'See you on {appointment_date} at {appointment_time}, {patient_name}.',
  );
  await page.getByRole('button', { name: 'Save text settings' }).click();
  await expect(page.getByText(/Appointment text settings saved/)).toBeVisible();
  const saved = await (
    await request.get(`${api}/client-communication/notification-settings`)
  ).json();
  expect(saved.rules.find((rule: { kind: string }) => rule.kind === 'CONFIRMATION').enabled).toBe(
    true,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Appointment texts', exact: true }).click();
  await expect(confirmation.getByRole('checkbox', { name: 'On', exact: true })).toBeChecked();
  await page.screenshot({
    path: '/private/tmp/sparki-appointment-text-settings.png',
    fullPage: true,
  });
});

test('concurrent handoffs reload the latest state instead of overwriting it', async ({
  page,
  request,
}) => {
  const { thread } = await fixture(request, 'Riley');
  await page.goto(`/communication?thread=${thread.id}`);
  const status = page.getByRole('combobox', { name: 'Status', exact: true });
  await expect(status).toHaveValue('OPEN');
  let conflict = false;
  await page.route(`**/api/client-communication/threads/${thread.id}`, async (route) => {
    if (route.request().method() === 'PATCH' && !conflict) {
      conflict = true;
      const current = await (
        await request.get(`${api}/client-communication/threads/${thread.id}`)
      ).json();
      expect(
        (
          await request.patch(`${api}/client-communication/threads/${thread.id}`, {
            data: { expectedVersion: current.version, status: 'CLOSED' },
          })
        ).ok(),
      ).toBe(true);
    }
    await route.continue();
  });
  await status.selectOption('WAITING');
  await expect(page.getByText(/Someone updated this conversation/)).toBeVisible();
  await expect(status).toHaveValue('CLOSED');
});

test('unavailable texting hides navigation and gives a direct-link explanation', async ({
  page,
}) => {
  await prisma.clientMessagingChannel.update({
    where: { locationId: 'dev-location' },
    data: { provider: 'TELNYX', status: 'PENDING', senderPhoneE164: '+13125550100' },
  });
  await page.goto('/communication');
  await expect(page.getByRole('heading', { name: 'Client texting unavailable' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Client Communication', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('textbox', { name: 'Message to client' })).toHaveCount(0);
});

test('appointment panel shows preparing without claiming a message was sent', async ({
  page,
  request,
}) => {
  const { client } = await fixture(request, 'Appointment');
  const patientResponse = await request.post(`${api}/patients`, {
    data: {
      name: 'Finley Text Status',
      species: 'Dog',
      sex: 'Male',
      clients: [{ clientId: client.id, isPrimary: true }],
    },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient = await patientResponse.json();
  const starts = new Date();
  starts.setHours(14, 0, 0, 0);
  const appointment = await prisma.appointment.create({
    data: {
      organizationId: 'dev-organization',
      locationId: 'dev-location',
      patientId: patient.id,
      clientId: client.id,
      type: 'WellnessPreventiveCare',
      reason: 'Text status fixture',
      source: 'Phone',
      state: 'Scheduled',
      scheduledAt: starts,
      expectedDurationMinutes: 30,
    },
  });
  await page.route(
    `**/api/client-communication/appointments/${appointment.id}/notifications`,
    async (route) => {
      const response = await route.fetch();
      const actual = await response.json();
      await route.fulfill({
        json: {
          ...actual,
          planning: { upToDate: false, pendingSince: new Date().toISOString() },
          notifications: [],
        },
      });
    },
  );
  await page.goto('/scheduler');
  await page
    .getByRole('button', { name: /Finley Text Status/ })
    .first()
    .click();
  const panel = page.getByRole('region', { name: 'Appointment texts' });
  await expect(panel.getByText('Preparing messages…')).toBeVisible();
  await expect(panel.getByText('Delivered', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: '/private/tmp/sparki-appointment-text-status.png',
    fullPage: true,
  });
});

test('a delayed conversation response cannot replace the newly selected recipient', async ({
  page,
  request,
}) => {
  const first = await fixture(request, 'Delayed');
  const second = await fixture(request, 'Current');
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route(`**/api/client-communication/threads/${first.thread.id}`, async (route) => {
    requested();
    await gate;
    await route
      .fulfill({
        json: {
          ...first.thread,
          patients: [],
          events: [],
          clientCandidates: [],
          contact: { phone: first.thread.contactPhoneDisplay, email: null },
          consent: { status: 'GRANTED', staffMayGrant: true, automatedTextsAllowed: false },
          sendEligibility: { canSend: true },
        },
      })
      .catch(() => undefined);
  });
  await page.goto('/communication');
  await page.getByRole('button', { name: /Delayed Communication test/ }).click();
  await waiting;
  await page.getByRole('button', { name: /Current Communication test/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Current Communication test', exact: true }),
  ).toBeVisible();
  release();
  await page.getByRole('textbox', { name: 'Message to client' }).fill('For the current recipient');
  await page.getByRole('button', { name: 'Save simulated message', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message to client' })).toHaveValue('');
  const firstMessages = await (
    await request.get(`${api}/client-communication/threads/${first.thread.id}/messages`)
  ).json();
  const secondMessages = await (
    await request.get(`${api}/client-communication/threads/${second.thread.id}/messages`)
  ).json();
  expect(
    firstMessages.messages.some(
      (message: { body: string }) => message.body === 'For the current recipient',
    ),
  ).toBe(false);
  expect(
    secondMessages.messages.some(
      (message: { body: string }) => message.body === 'For the current recipient',
    ),
  ).toBe(true);
});
