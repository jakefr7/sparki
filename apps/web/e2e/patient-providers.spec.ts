import { expect, test } from '@playwright/test';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

test('patient providers create a records task with an editable persistent email draft', async ({
  page,
  request,
}) => {
  const client = await request.post(`${API_URL}/clients`, {
    data: { firstName: 'Dana', lastName: 'Records QA' },
  });
  expect(client.ok()).toBe(true);
  const patient = await request.post(`${API_URL}/patients`, {
    data: {
      name: 'Juniper Records QA',
      species: 'Cat',
      clients: [{ clientId: (await client.json()).id, isPrimary: true }],
    },
  });
  expect(patient.ok()).toBe(true);
  const patientId = (await patient.json()).id as string;
  await page.goto(`/patients/${patientId}`);
  const panel = page.getByRole('region', { name: 'Providers and records' });
  await panel.getByRole('button', { name: 'Edit providers' }).click();
  await panel.getByLabel('Referring vet', { exact: true }).fill('Willow Records QA');
  await panel.getByRole('button', { name: 'Add new hospital', exact: true }).click();
  await panel.getByLabel('Hospital name', { exact: true }).fill('Willow Records QA');
  await panel.getByLabel('Veterinarian', { exact: true }).fill('Dr QA');
  await panel.getByLabel('Hospital email', { exact: true }).fill('records@example.test');
  let releaseHospital!: () => void;
  const hospitalGate = new Promise<void>((resolve) => {
    releaseHospital = resolve;
  });
  await page.route('**/api/referral-contacts', async (route) => {
    if (route.request().method() === 'POST') await hospitalGate;
    await route.continue();
  });
  await panel.getByRole('button', { name: 'Save hospital and select' }).click();
  await expect(panel.getByRole('button', { name: 'Save providers', exact: true })).toBeDisabled();
  releaseHospital();
  await panel.getByRole('button', { name: 'Save providers', exact: true }).click();
  await expect(panel.getByText('Willow Records QA · Dr QA', { exact: false })).toBeVisible();
  await page.reload();
  await panel.getByRole('button', { name: 'Request records', exact: true }).click();
  const staff = (await (await request.get(`${API_URL}/staff`)).json()) as Array<{
    id: string;
    role: string;
  }>;
  const receptionist = staff.find((member) => member.role === 'RECEPTIONIST')!;
  expect(receptionist).toBeTruthy();
  await panel
    .getByRole('combobox', { name: 'Assign to', exact: true })
    .selectOption(receptionist.id);
  const created = page.waitForResponse(
    (response) =>
      response.url().includes('/records-requests') && response.request().method() === 'POST',
  );
  await panel.getByRole('button', { name: 'Create records-request task' }).click();
  const taskResponse = await created;
  expect(taskResponse.ok()).toBe(true);
  const task = (await taskResponse.json()) as { id: string };
  await panel.getByText('Records-request email draft', { exact: true }).click();
  await expect(panel.getByLabel('Email body')).toHaveValue(/Juniper Records QA/);
  await panel
    .getByLabel('Email body')
    .fill('Please send the full history and imaging for Juniper Records QA.');
  await expect(panel.getByRole('link', { name: 'Open in email app' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Save email draft' }).click();
  await expect(panel.getByRole('link', { name: 'Open in email app' })).toHaveAttribute(
    'href',
    /full%20history%20and%20imaging/,
  );
  await page.reload();
  await panel.getByText('Records-request email draft', { exact: true }).click();
  await expect(panel.getByLabel('Email body')).toHaveValue(
    'Please send the full history and imaging for Juniper Records QA.',
  );
  await page.screenshot({ path: '/private/tmp/sparki-spa40-patient.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: '/private/tmp/sparki-spa40-patient-tablet.png', fullPage: true });
  await page
    .context()
    .addCookies([
      {
        name: 'sparki_session',
        value: `dev:${receptionist.id}`,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  await page.goto('/');
  const queue = page
    .locator('.task-line-item')
    .filter({ hasText: 'Request records: Juniper Records QA' });
  await expect(queue.getByRole('link', { name: 'Open patient' })).toHaveAttribute(
    'href',
    `/patients/${patientId}#providers`,
  );
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tasks/${task.id}`) &&
        response.request().method() === 'PATCH' &&
        response.ok(),
    ),
    queue.getByRole('checkbox', { name: 'Mark task complete' }).click(),
  ]);
  await expect(queue).toHaveCount(0);
  const savedTask = (
    (await (await request.get(`${API_URL}/tasks`)).json()) as Array<{ id: string; status: string }>
  ).find((item) => item.id === task.id);
  expect(savedTask?.status).toBe('Completed');
});

test('Admin breed additions, renames and hiding reach patient forms', async ({ page }) => {
  await page.goto('/settings?tab=admin');
  await page.getByRole('button', { name: /Patient details/ }).click();
  const settings = page.getByRole('region', { name: 'Breed choices', exact: true });
  await settings.getByLabel('Species', { exact: true }).fill('Dog');
  await settings.getByLabel('New breed name').fill('SPA40 Custom Mix');
  await settings.getByRole('button', { name: 'Add breed', exact: true }).click();
  await expect(settings.getByText('Breed choices saved.')).toBeVisible();
  await settings.getByLabel('Search breeds').fill('SPA40 Custom Mix');
  const row = settings.locator('.breed-settings__row');
  await row.getByRole('textbox').fill('SPA40 Renamed Mix');
  await row.getByRole('button', { name: 'Save name' }).click();
  await settings.getByLabel('Search breeds').fill('SPA40 Renamed Mix');
  await expect(row.getByRole('textbox')).toHaveValue('SPA40 Renamed Mix');
  await page.goto('/patients');
  await page.getByRole('button', { name: 'New Patient', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Patient', exact: true });
  const breed = dialog.getByLabel('Breed', { exact: true });
  await expect(breed).toHaveAttribute('list', /.+/);
  await expect(dialog.locator('datalist option[value="SPA40 Renamed Mix"]')).toHaveCount(1);
  await page.goto('/settings?tab=admin');
  await page.getByRole('button', { name: /Patient details/ }).click();
  await settings.getByLabel('Search breeds').fill('SPA40 Renamed Mix');
  await row.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(row.getByText('Hidden', { exact: true })).toBeVisible();
  await page.goto('/patients');
  await page.getByRole('button', { name: 'New Patient', exact: true }).click();
  await expect(dialog.locator('datalist option[value="SPA40 Renamed Mix"]')).toHaveCount(0);
});
