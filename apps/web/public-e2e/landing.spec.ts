import { expect, test } from '@playwright/test';

test('public home, demo CTAs, and protected routes retain their boundaries', async ({
  page,
  request,
  context,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your clinic.Finally in sync.');
  for (const link of await page.getByRole('link', { name: 'Book a Demo' }).all()) {
    await expect(link).toHaveAttribute('href', '');
    if (await link.isVisible()) {
      await link.click();
      await expect(page).toHaveURL('/');
      await expect(page.locator('#top')).toBeVisible();
    }
  }
  for (const path of [
    '/patients',
    '/scheduler',
    '/visits/example',
    '/inventory',
    '/demo/private',
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain('/login?from=');
  }
  await context.addCookies([
    {
      name: 'sparki_session',
      value: 'public-test-invalid-session',
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  const signedHome = await request.get('/', {
    headers: { cookie: 'sparki_session=public-test-invalid-session' },
  });
  const signedHtml = await signedHome.text();
  expect(signedHtml).toContain('Loading your clinic');
  expect(signedHtml).not.toContain('aria-label="Sparki dashboard"');
  expect(signedHtml).not.toContain('THE VETERINARY PRACTICE OPERATING SYSTEM');
});

test('role, platform, and patient journey controls work with keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  // Wait for the client tree to hydrate before exercising keyboard controls.
  await expect(page.locator('#top[data-ready="true"]')).toBeAttached();
  const vet = page.getByRole('button', { name: 'Veterinarian', exact: true });
  await vet.focus();
  await vet.press('Enter');
  await expect(vet).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'Keep your attention on the patient.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Practice Manager', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your practice overview' })).toBeVisible();
  await page.getByRole('button', { name: '07 Record' }).click();
  await expect(page.getByRole('heading', { name: 'Record review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /05 Inventory/ }).click();
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  const activeAnimations = await page.evaluate(
    () => document.getAnimations().filter((a) => a.playState === 'running').length,
  );
  expect(activeAnimations).toBe(0);
});

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`public layouts fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/']) {
      await page.goto(path);
      const overflow = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            'main h1, main h2, main h3, main input, main select, main textarea, main button',
          ),
        ]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
          })
          .map((el) => el.textContent),
      );
      expect(overflow).toEqual([]);
      await page.screenshot({
        path: `/tmp/sparki-public-${path === '/' ? 'home' : 'demo'}-${width}.png`,
        fullPage: true,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    if (width < 640) {
      await page.goto('/');
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('navigation').getByRole('link', { name: 'Solutions' }).click();
      await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    }
  });
}

test('desktop scroll advances the patient story with motion enabled', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#top[data-ready="true"]')).toBeAttached();
  const story = page.getByRole('region', { name: 'A clear next step. At every step.' });
  const bounds = await story.boundingBox();
  expect(bounds).not.toBeNull();
  await page.evaluate(
    ({ y, height }) =>
      window.scrollTo({ top: y + (height - innerHeight) * 0.54, behavior: 'instant' }),
    bounds!,
  );
  await expect(page.getByRole('button', { name: /04 Exam/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'Exam in progress', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
