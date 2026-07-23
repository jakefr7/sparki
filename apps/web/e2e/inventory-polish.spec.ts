import { expect, test } from '@playwright/test';

test.describe('inventory workspace polish', () => {
  test.beforeEach(async ({ page }) => {
    const port = process.env.WEB_PORT ?? '3001';
    await page.context().addCookies([
      {
        name: 'sparki_session',
        value: 'development-e2e',
        url: `http://127.0.0.1:${port}`,
      },
    ]);
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  });

  test('uses focused primary and purchasing navigation', async ({ page }) => {
    const primary = page.getByRole('navigation', { name: 'Inventory sections' });
    await expect(primary.getByRole('button')).toHaveText([
      'Overview',
      'Items',
      'Usage',
      'Purchasing',
      'Counts',
      'Controlled',
      'Activity',
    ]);

    await primary.getByRole('button', { name: 'Purchasing' }).click();
    const purchasing = page.getByRole('navigation', { name: 'Purchasing sections' });
    await expect(purchasing.getByRole('button')).toHaveText(['Orders', 'Vendors']);
    await expect(page.getByRole('button', { name: 'New purchase order' })).toBeVisible();

    await purchasing.getByRole('button', { name: 'Vendors' }).click();
    await expect(page.getByRole('button', { name: 'Add vendor' })).toBeVisible();
  });

  test('shows contextual item commands and human-readable values', async ({ page }) => {
    await page.getByRole('button', { name: 'Items', exact: true }).click();
    await expect(page.getByPlaceholder('Search name, SKU, or barcode')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();
    await expect(page.getByText('Medical supply').first()).toBeVisible();
  });

  test('keeps the add item form isolated and its actions visible', async ({ page }) => {
    await page.getByRole('button', { name: 'Items', exact: true }).click();
    await page.getByRole('button', { name: 'Add item' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add Item' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Add the essential item details first.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create item' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close Add Item' }).click();
    await expect(dialog).toBeHidden();
  });

  test('keeps navigation and commands usable at narrower desktop widths', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole('button', { name: 'Purchasing', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Purchasing sections' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New purchase order' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible();
  });
});
