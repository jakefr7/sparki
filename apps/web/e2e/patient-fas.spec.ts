import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
test('FAS is asked with intake vitals, read and reassessed in the exam general assessment, and kept in patient history', async ({
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
    data: {
      patientId: patient.id,
      reason: 'Synthetic behavior assessment',
      primaryVeterinarianId: 'dev-user',
    },
  });
  expect(visitResponse.ok()).toBe(true);
  const visit = await visitResponse.json();
  await page.goto(`/visits/${visit.id}`);
  await page.getByRole('button', { name: 'Begin Intake', exact: true }).click();

  // Intake: asked beside the vitals, closed until staff choose to record, nothing preselected.
  const intakeFas = page
    .getByRole('region', { name: 'Vitals', exact: true })
    .getByRole('group', { name: 'Fear, anxiety and stress', exact: true });
  await expect(intakeFas.getByText('No FAS score recorded')).toBeVisible();
  await expect(intakeFas.getByLabel('Handling notes (optional)')).toHaveCount(0);
  await intakeFas.getByRole('button', { name: 'Add score', exact: true }).click();
  const intakeScores = intakeFas.getByRole('group', { name: 'FAS score (0–5)', exact: true });
  await expect(intakeScores.getByRole('button')).toHaveCount(6);
  await expect(intakeScores.getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(intakeFas.getByRole('button', { name: 'Save score', exact: true })).toBeDisabled();
  await intakeScores.getByRole('button', { name: '0', exact: true }).click();
  await intakeFas.getByLabel('Handling notes (optional)').fill('Quiet approach helped.');
  await page.screenshot({ path: test.info().outputPath('fas-intake-entry.png') });
  await intakeFas.getByRole('button', { name: 'Save score', exact: true }).click();
  await expect(intakeFas.getByText(/^0\/5 · Recorded by /)).toBeVisible();
  await expect(intakeFas.getByText('Quiet approach helped.', { exact: true })).toBeVisible();
  await expect(intakeFas.getByLabel('Handling notes (optional)')).toHaveCount(0);

  await page.locator('#weight').fill('22');
  await page.locator('#temperature').fill('101');
  await page.locator('#heartRate').fill('90');
  await page.locator('#respiratoryRate').fill('20');
  await page.locator('#crtSeconds').selectOption('OneToTwoSeconds');
  await page.locator('#gumColor').selectOption('Pink');
  await page.locator('#historyNotes').fill('Synthetic intake history.');
  await page.getByRole('button', { name: 'Ready for Veterinarian' }).click();
  await page.getByRole('button', { name: 'Start exam', exact: true }).click();

  // Exam: the exam step leads the page; FAS is one line of the general assessment.
  await expect(page.getByText('Step 1 of 5 · Exam')).toBeInViewport();
  await expect(page.getByRole('region', { name: 'Fear, anxiety and stress' })).toHaveCount(0);
  const examFas = page
    .getByRole('group', { name: 'General assessment', exact: true })
    .getByRole('group', { name: 'Fear, anxiety and stress', exact: true });
  await expect(examFas.getByText(/^0\/5 · Recorded by /)).toBeVisible();
  await expect(examFas.getByText('Quiet approach helped.', { exact: true })).toBeVisible();
  await expect(examFas.getByLabel('Handling notes (optional)')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('fas-exam-start.png') });

  await examFas.getByRole('button', { name: 'Reassess', exact: true }).click();
  const examScores = examFas.getByRole('group', { name: 'FAS score (0–5)', exact: true });
  await expect(examScores.getByRole('button', { pressed: true })).toHaveCount(0);
  await examScores.getByRole('button', { name: '3', exact: true }).click();
  await examFas.getByLabel('Handling notes (optional)').fill('Behavior changed during exam.');
  await examFas.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('fas-exam-reassess.png') });

  // Tablet: the score entry stays inside the general assessment box.
  await page.setViewportSize({ width: 820, height: 1180 });
  await examFas.scrollIntoViewIfNeeded();
  const assessmentBox = (await page.locator('.physical-exam-general').boundingBox())!;
  for (const control of [
    examScores.getByRole('button', { name: '5', exact: true }),
    examFas.getByLabel('Handling notes (optional)'),
    examFas.getByRole('button', { name: 'Save score', exact: true }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(assessmentBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(assessmentBox.x + assessmentBox.width);
  }
  await page.screenshot({ path: test.info().outputPath('fas-exam-reassess-tablet.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  let intercepted = false;
  await page.route(`**/api/visits/${visit.id}/fas`, async (route) => {
    if (intercepted) return route.continue();
    intercepted = true;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed'); // Server committed; client must retry the same request.
  });
  await examFas.getByRole('button', { name: 'Save score', exact: true }).click();
  await expect(examFas.getByRole('alert')).toBeVisible();
  await expect(examScores.getByRole('button', { name: '5', exact: true })).toBeDisabled();
  await expect(examFas.getByLabel('Handling notes (optional)')).toBeDisabled();
  await examFas.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(examFas.getByText(/^3\/5 · Recorded by /)).toBeVisible();
  await expect(examFas.getByLabel('Handling notes (optional)')).toHaveCount(0);

  await page.reload();
  await expect(examFas.getByText(/^3\/5 · Recorded by /)).toBeVisible();
  await examFas.locator('summary').click();
  await expect(examFas.getByText('Quiet approach helped.', { exact: true })).toBeVisible();
  const historyResponse = await request.get(`${API_URL}/patients/${patient.id}/fas`);
  expect((await historyResponse.json()).items).toHaveLength(2);

  await page.goto(`/patients/${patient.id}`);
  await page.getByRole('tab', { name: 'Alerts', exact: true }).click();
  const profile = page.getByRole('region', { name: 'Fear, anxiety and stress', exact: true });
  await expect(profile.getByText('Latest recorded FAS score: 3/5')).toBeVisible();
  await expect(profile.getByRole('button', { name: /Add score|Reassess/ })).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath('fas-history-tablet.png') });
});
