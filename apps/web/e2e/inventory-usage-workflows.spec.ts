import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('creates a clinical usage mapping and exposes review queue destinations', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await page.context().addCookies([
    {
      name: 'sparki_session',
      value: 'development-e2e',
      url: 'http://127.0.0.1:3001',
    },
  ]);
  const sourceReference = `Browser DAPP ${Date.now()}`;
  let createdId: string | undefined;
  try {
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'Usage', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Clinical & Retail Usage' })).toBeVisible();
    await expect(page.getByText('Pending Usage Review', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create Usage Mapping' }).click();
    await page.getByLabel('Source action').fill(sourceReference);
    await page.getByLabel('Source type').selectOption('VACCINE');
    await page.getByLabel('Physical component').selectOption({ label: 'Carprofen 75 mg tablets' });
    await page.getByLabel('Quantity').fill('1');
    await page.getByLabel('Deduction event').selectOption('VACCINE_ADMINISTERED');
    await page.getByRole('button', { name: 'Review & Activate' }).click();
    await expect(page.getByRole('heading', { name: 'Create usage mapping' })).toBeHidden();
    await page.getByRole('button', { name: 'Mappings', exact: true }).click();
    await expect(page.getByText(new RegExp(sourceReference))).toBeVisible();

    const response = await request.get(`${API_URL}/inventory/usage/mappings`);
    expect(response.ok()).toBe(true);
    const mappings = (await response.json()) as Array<{ id: string; sourceReference: string }>;
    createdId = mappings.find((mapping) => mapping.sourceReference === sourceReference)?.id;
    expect(createdId).toBeTruthy();

    await page.getByRole('button', { name: 'Review Queue', exact: true }).click();
    await expect(page.getByText(/NO USAGE MAPPING|No active usage mapping exists/i)).toBeVisible();
  } finally {
    if (createdId) await request.post(`${API_URL}/inventory/usage/mappings/${createdId}/archive`);
  }
});
