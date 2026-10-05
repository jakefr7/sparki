import { expect, test, type Page } from '@playwright/test';

// SPA-37: the pricing page shows the landing page's header row. Measuring both
// pages the same way and comparing them keeps the two from drifting apart again.
async function describeHeader(page: Page) {
  const header = page.getByRole('banner');
  // The navigation is hidden behind the menu button on narrow screens.
  await expect(header.locator('nav')).toBeAttached();
  return header.evaluate((element) => {
    const row = element.querySelector('nav')!.parentElement!;
    const rowBox = row.getBoundingClientRect();
    const frame = getComputedStyle(row);
    const viewportWidth = document.documentElement.clientWidth;
    return {
      row: {
        top: Math.round(rowBox.top),
        width: Math.round(rowBox.width),
        height: Math.round(rowBox.height),
        gutters: [Math.round(rowBox.left), Math.round(viewportWidth - rowBox.right)],
        radius: frame.borderTopLeftRadius,
        borderWidth: frame.borderTopWidth,
        borderColor: frame.borderTopColor,
        background: frame.backgroundColor,
      },
      logos: element.querySelectorAll('a[aria-label="Sparki home"] img').length,
      items: [...element.querySelectorAll<HTMLElement>('a, button')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => {
          const box = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            label: node.getAttribute('aria-label') ?? node.textContent?.trim(),
            left: Math.round(box.left - rowBox.left),
            top: Math.round(box.top - rowBox.top),
            width: Math.round(box.width),
            height: Math.round(box.height),
            color: style.color,
            background: style.backgroundColor,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          };
        }),
    };
  });
}

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 900, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
] as const) {
  test(`pricing shares the landing header row on ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const landing = await describeHeader(page);
    await page.goto('/pricing');
    const pricing = await describeHeader(page);

    expect(landing.logos).toBe(2);
    expect(landing.items.map((item) => item.label)).toEqual(
      viewport.width > 700
        ? ['Sparki home', 'How it works', 'Solutions', 'Pricing', 'Sign In', 'Get Started ↗']
        : ['Sparki home', 'Open navigation'],
    );
    expect(pricing).toEqual(landing);
  });
}

test('pricing header links lead back to the landing sections and into signup', async ({ page }) => {
  await page.goto('/pricing');
  const header = page.getByRole('banner');
  const nav = header.getByRole('navigation', { name: 'Main navigation' });
  await expect(header.getByRole('link', { name: 'Sparki home' })).toHaveAttribute('href', '/');
  await expect(nav.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#product');
  await expect(nav.getByRole('link', { name: 'Solutions' })).toHaveAttribute('href', '/#solutions');
  await expect(nav.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
  await expect(header.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login');

  // Retried because the first click can land before the page is interactive.
  await expect(async () => {
    await header.getByRole('link', { name: 'Get Started' }).click();
    await expect(page.getByRole('heading', { name: /Make room for your practice/ })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(page).toHaveURL('/pricing');
  await expect(header.getByRole('link', { name: 'Get Started' })).toBeVisible();

  await nav.getByRole('link', { name: 'How it works' }).click();
  await expect(page).toHaveURL('/#product');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your clinic.Finally in sync.');
});

test('pricing mobile menu offers the landing navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pricing');
  const header = page.getByRole('banner');
  const nav = header.getByRole('navigation', { name: 'Main navigation' });
  await expect(async () => {
    await header.getByRole('button', { name: 'Open navigation' }).click();
    await expect(nav.getByRole('link', { name: 'How it works' })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(nav.getByRole('link')).toHaveText(['How it works', 'Solutions', 'Pricing']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.keyboard.press('Escape');
  await expect(header.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await expect(nav.getByRole('link', { name: 'How it works' })).toBeHidden();
});

test('signup progress bar gives the floating header a solid backing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/pricing');
  await expect(async () => {
    await page.getByRole('button', { name: 'Start free' }).click();
    await expect(page.getByRole('heading', { name: /Make room for your practice/ })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.evaluate(() => window.scrollTo({ top: 260, behavior: 'instant' }));

  const header = page.getByRole('banner');
  const bar = page.locator('span', { hasText: /^Make room for your practice\.$/ }).locator('..');
  await expect(bar).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  const rowBox = (await header.locator('nav').locator('..').boundingBox())!;
  // The form must not show through above, beside, or just below the header row.
  expect(barBox.x).toBe(0);
  expect(barBox.y).toBe(0);
  expect(barBox.width).toBe(1440);
  expect(barBox.y + barBox.height).toBeGreaterThan(rowBox.y + rowBox.height);
  await header.getByRole('link', { name: 'Get Started' }).click({ trial: true });
  await bar.getByRole('button', { name: '← Back to pricing' }).click();
  await expect(page.getByRole('heading', { name: /A calmer clinic day.*One simple plan/ })).toBeVisible();
});
