import { expect, test } from '@playwright/test';

test('shows the selected activity multiplier as an explicit planning assumption', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('activity-select').selectOption('moderately_active');
  await expect(page.getByTestId('activity-assumption')).toContainText('×1.55');
  await expect(page.getByTestId('activity-assumption')).toContainText(/planning assumption/i);
});

test('saves, restores, persists, and deletes a named local input preset', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('93.25');
  await page.getByLabel('Preset name').fill('Cut block');
  await page.getByRole('button', { name: 'Save preset' }).click();

  await page.getByTestId('weight-input').fill('70');
  await page.getByLabel('Saved preset').selectOption({ label: 'Cut block' });
  await page.getByRole('button', { name: 'Load preset' }).click();
  await expect(page.getByTestId('weight-input')).toHaveValue('93.25');

  await page.reload();
  await expect(page.getByLabel('Saved preset')).toContainText('Cut block');
  await page.getByTestId('weight-input').fill('72');
  await page.getByLabel('Saved preset').selectOption({ label: 'Cut block' });
  await page.getByRole('button', { name: 'Load preset' }).click();
  await expect(page.getByTestId('weight-input')).toHaveValue('93.25');

  await page.getByRole('button', { name: 'Delete preset' }).click();
  await expect(page.getByLabel('Saved preset')).not.toContainText('Cut block');
});

test('unit toggles do not round the canonical metric measurements', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('80.1234');
  await page.getByTestId('height-input').fill('180.4321');

  await page.getByRole('button', { name: 'Imperial' }).click();
  await expect(page.getByTestId('height-feet')).toBeVisible();
  await page.getByRole('button', { name: 'Metric' }).click();

  await expect(page.getByTestId('weight-input')).toHaveValue('80.1234');
  await expect(page.getByTestId('height-input')).toHaveValue('180.4321');
});

test('downloaded CSV retains low-intake advisory context', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('45');
  await page.getByTestId('height-input').fill('150');
  await page.getByTestId('age-input').fill('60');
  await page.getByTestId('sex-select').selectOption('female');
  await page.getByTestId('activity-select').selectOption('sedentary');
  await page.getByTestId('goal-select').selectOption('moderate_deficit');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const csvDownload = await download;
  const csvText = await (await import('node:fs/promises')).readFile(await csvDownload.path() ?? '', 'utf8');

  expect(csvText).toContain('advisory_1_code');
  expect(csvText).toContain('advisory_1_scope');
  expect(csvText).toContain('below_basal_rate');
  expect(csvText).toContain('energy_target');
});
