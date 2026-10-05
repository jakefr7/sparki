import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
test('FAS capture, changed behavior, lost-response recovery and patient history', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const clientResponse = await request.post(`${API_URL}/clients`, {
    data: { firstName: 'FAS', lastName: 'Synthetic Client' },
  });
  expect(clientResponse.ok()).toBe(true);
  const client = await clientResponse.json();
  const patientResponse = await request.post(`${API_URL}/patients`, {
    data: {
      name: 'FAS Synthetic Patient',
      species: 'Canine',
      clients: [{ clientId: client.id, isPrimary: true }],
    },
  });
  expect(patientResponse.ok()).toBe(true);
  const patient = await patientResponse.json();
  const visitResponse = await request.post(`${API_URL}/visits`, {
    data: { patientId: patient.id, reason: 'Synthetic behavior assessment' },
  });
  expect(visitResponse.ok()).toBe(true);
  const visit = await visitResponse.json();
  await page.goto(`/visits/${visit.id}`);
  const panel = page.getByRole('region', { name: 'Fear, anxiety and stress', exact: true });
  await expect(panel.getByText('No FAS score recorded')).toBeVisible();
  await expect(panel.getByLabel('FAS score (0–5)')).toHaveValue('');
  await panel.getByLabel('FAS score (0–5)').selectOption('0');
  await panel.getByLabel('Handling notes (optional)').fill('Quiet approach helped.');
  await panel.getByRole('button', { name: 'Record assessment', exact: true }).click();
  await expect(panel.getByText('Latest recorded FAS score: 0/5')).toBeVisible();
  await panel.getByLabel('FAS score (0–5)').selectOption('3');
  await panel.getByLabel('Handling notes (optional)').fill('Behavior changed during exam.');
  let intercepted = false;
  await page.route(`**/api/visits/${visit.id}/fas`, async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed'); // Server committed; client must retry the same request.
  });
  await panel.getByRole('button', { name: 'Record assessment', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.getByLabel('FAS score (0–5)')).toBeDisabled();
  await panel.getByRole('button', { name: 'Retry assessment save', exact: true }).click();
  await expect(panel.getByText('Latest recorded FAS score: 3/5')).toBeVisible();
  await page.reload();
  await expect(panel.getByText('Latest recorded FAS score: 3/5')).toBeVisible();
  await panel.locator('summary').click();
  await expect(panel.getByText('Quiet approach helped.', { exact: true })).toBeVisible();
  const historyResponse = await request.get(`${API_URL}/patients/${patient.id}/fas`);
  expect((await historyResponse.json()).items).toHaveLength(2);
  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('tab', { name: 'Alerts', exact: true }).click();
  const profile = page.getByRole('region', { name: 'Fear, anxiety and stress', exact: true });
  await expect(profile.getByText('Latest recorded FAS score: 3/5')).toBeVisible();
  await expect(profile.getByLabel('FAS score (0–5)')).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath('fas-history-tablet.png') });
});
