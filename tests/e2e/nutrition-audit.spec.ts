import { expect, test } from '@playwright/test';

test('shows the selected activity multiplier as a dynamic planning assumption', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  const assumption = page.getByTestId('activity-assumption');

  await page.getByTestId('activity-select').selectOption('sedentary');
  await expect(assumption).toContainText('×1.2');
  await expect(assumption).toContainText(/planning assumption/i);

  await page.getByTestId('activity-select').selectOption('very_active');
  await expect(assumption).toContainText('×1.725');
  await expect(assumption).not.toContainText('×1.2 multiplies');
});

test('saves, restores, persists, and permanently deletes a complete named input preset', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('93.25');
  await page.getByTestId('height-input').fill('176.5');
  await page.getByTestId('age-input').fill('42');
  await page.getByTestId('sex-select').selectOption('female');
  await page.getByTestId('activity-select').selectOption('very_active');
  await page.getByTestId('body-fat-toggle').check();
  await page.getByTestId('body-fat-input').fill('28.5');
  await page.getByTestId('equation-select').selectOption('katch_mcardle');
  await page.getByTestId('goal-select').selectOption('mild_deficit');
  await page.getByTestId('split-select').selectOption('custom');
  await page.getByTestId('custom-protein').fill('30');
  await page.getByTestId('custom-fat').fill('35');
  await page.getByTestId('custom-carbohydrate').fill('35');
  await page.getByTestId('meals-input').fill('4');
  await page.getByLabel('Preset name').fill('Cut block');
  await page.getByRole('button', { name: 'Save preset', exact: true }).click();

  await page.getByTestId('weight-input').fill('70');
  await page.getByTestId('height-input').fill('160');
  await page.getByTestId('age-input').fill('30');
  await page.getByTestId('sex-select').selectOption('male');
  await page.getByTestId('activity-select').selectOption('sedentary');
  await page.getByTestId('body-fat-toggle').uncheck();
  await page.getByTestId('equation-select').selectOption('mifflin_st_jeor');
  await page.getByTestId('goal-select').selectOption('maintenance');
  await page.getByTestId('split-select').selectOption('balanced');
  await page.getByTestId('meals-input').fill('2');

  await page.getByLabel('Saved preset').selectOption({ label: 'Cut block' });
  await page.getByRole('button', { name: 'Load preset', exact: true }).click();
  await expect(page.getByTestId('weight-input')).toHaveValue('93.25');
  await expect(page.getByTestId('height-input')).toHaveValue('176.5');
  await expect(page.getByTestId('age-input')).toHaveValue('42');
  await expect(page.getByTestId('sex-select')).toHaveValue('female');
  await expect(page.getByTestId('activity-select')).toHaveValue('very_active');
  await expect(page.getByTestId('body-fat-toggle')).toBeChecked();
  await expect(page.getByTestId('body-fat-input')).toHaveValue('28.5');
  await expect(page.getByTestId('equation-select')).toHaveValue('katch_mcardle');
  await expect(page.getByTestId('goal-select')).toHaveValue('mild_deficit');
  await expect(page.getByTestId('split-select')).toHaveValue('custom');
  await expect(page.getByTestId('custom-protein')).toHaveValue('30');
  await expect(page.getByTestId('custom-fat')).toHaveValue('35');
  await expect(page.getByTestId('custom-carbohydrate')).toHaveValue('35');
  await expect(page.getByTestId('meals-input')).toHaveValue('4');

  await page.reload();
  await expect(page.getByLabel('Saved preset')).toContainText('Cut block');
  await page.getByLabel('Saved preset').selectOption({ label: 'Cut block' });
  await page.getByRole('button', { name: 'Load preset', exact: true }).click();
  await expect(page.getByTestId('weight-input')).toHaveValue('93.25');
  await expect(page.getByTestId('activity-select')).toHaveValue('very_active');
  await expect(page.getByTestId('equation-select')).toHaveValue('katch_mcardle');

  await page.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(page.getByLabel('Saved preset')).not.toContainText('Cut block');
  await page.reload();
  await expect(page.getByLabel('Saved preset')).not.toContainText('Cut block');
});

test('unit toggles do not round the canonical metric measurements', async ({ page }) => {
  await page.goto('./#/energy-macro-planner');
  await page.getByTestId('weight-input').fill('80.1234');
  await page.getByTestId('height-input').fill('180.4321');

  await page.getByRole('button', { name: 'Imperial', exact: true }).click();
  await expect(page.getByTestId('height-feet')).toBeVisible();
  await page.getByRole('button', { name: 'Metric', exact: true }).click();

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
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const csvDownload = await download;
  const csvText = await (await import('node:fs/promises')).readFile(await csvDownload.path() ?? '', 'utf8');

  expect(csvText).toContain('advisory_1_code');
  expect(csvText).toContain('advisory_1_scope');
  expect(csvText).toContain('below_basal_rate');
  expect(csvText).toContain('energy_target');
});
