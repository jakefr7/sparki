import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

test('profile tabs keep drafts, support keyboard and links, and show clear empty states', async ({
  page,
  request,
}) => {
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: {
      firstName: 'Casey',
      lastName: 'Profile fixture',
      phone: '3125550148',
      email: 'casey@example.com',
    },
  });
  expect(clientResponse.ok()).toBe(true);
  const client = (await clientResponse.json()) as { id: string };
  const patientResponse = await request.post(`${API_URL}/patients`, {
    data: {
      name: 'Profile fixture',
      species: 'Dog',
      breed: 'Golden Retriever',
      color: 'Cream',
      sex: 'Male',
      clients: [{ clientId: client.id, isPrimary: true }],
    },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient = (await patientResponse.json()) as { id: string };
  await page.goto(`/patients/${patient.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Profile fixture' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Walk-In' })).toHaveCount(0);
  await expect(page.getByLabel('Walk-in reason')).toHaveCount(0);
  await expect(page.getByText('(312) 555-0148', { exact: true })).toBeVisible();
  await expect(page.getByText('No visits yet', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/private/tmp/sparki-profile-overview.png', fullPage: true });

  const overview = page.getByRole('tab', { name: 'Overview', exact: true });
  await overview.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Medical History' })).toBeFocused();
  await expect(page.getByText('No clinical history yet')).toBeVisible();
  await page.screenshot({ path: '/private/tmp/sparki-profile-history.png', fullPage: true });
  await page.getByRole('tab', { name: 'Medications', exact: true }).click();
  await expect(page.getByText('No prescriptions yet')).toBeVisible();
  await page.screenshot({ path: '/private/tmp/sparki-profile-medications.png', fullPage: true });
  await page.getByRole('button', { name: 'Prepare prescription' }).click();
  await page.getByLabel('Medication', { exact: true }).fill('Unsaved test draft');
  await page.getByRole('tab', { name: 'Alerts', exact: true }).click();
  await expect(page.getByText('No active alerts', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/private/tmp/sparki-profile-alerts.png', fullPage: true });
  await page.getByRole('button', { name: 'Add Alert', exact: true }).click();
  await page.getByLabel('Alert text').fill('Unsaved handling note');
  await page.getByRole('tab', { name: 'Invoices', exact: true }).click();
  await expect(page.getByText('No invoices yet')).toBeVisible();
  await page.screenshot({ path: '/private/tmp/sparki-profile-invoices.png', fullPage: true });
  await page.getByRole('tab', { name: 'Alerts', exact: true }).click();
  await expect(page.getByLabel('Alert text')).toHaveValue('Unsaved handling note');
  await page.getByRole('tab', { name: 'Medications', exact: true }).click();
  await expect(page.getByLabel('Medication', { exact: true })).toHaveValue('Unsaved test draft');
  await page.goto(`/patients/${patient.id}#patient-profile-tab-alerts`);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Alerts', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('No active alerts', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Contact Summary' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '/private/tmp/sparki-profile-mobile.png', fullPage: true });
});
