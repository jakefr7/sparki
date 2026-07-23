import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('edits an existing item and opens duplication as an unpersisted copy', async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.context().addCookies([{ name: 'sparki_session', value: 'development-e2e', url: 'http://127.0.0.1:3001' }]);
  const listResponse = await request.get(`${API_URL}/inventory/items?search=Carprofen%2075`);
  expect(listResponse.ok()).toBe(true);
  const [original] = (await listResponse.json()) as Array<{ id: string; description: string | null }>;
  if (!original) throw new Error('Carprofen inventory fixture was not found');
  const changedDescription = 'Veterinary NSAID inventory closeout test';

  try {
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'Items', exact: true }).click();
    await page.getByRole('row', { name: /Carprofen 75 mg tablets/ }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Description').fill(changedDescription);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Item' })).toBeHidden({ timeout: 10_000 });
    await page.getByRole('row', { name: /Carprofen 75 mg tablets/ }).click();
    await expect(page.getByText(changedDescription)).toBeVisible();

    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Duplicate Item' })).toBeVisible();
    await expect(page.getByLabel('Item name')).toHaveValue('Carprofen 75 mg tablets — Copy');
    await expect(page.getByLabel('SKU')).toHaveValue('');
    const copySearch = await request.get(`${API_URL}/inventory/items?search=Carprofen%2075%20mg%20tablets%20%E2%80%94%20Copy`);
    expect((await copySearch.json()) as unknown[]).toHaveLength(0);
  } finally {
    await request.patch(`${API_URL}/inventory/items/${original.id}`, { data: { description: original.description } });
  }
});
