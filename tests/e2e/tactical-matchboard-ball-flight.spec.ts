import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { stableTacticalTargetBox } from './tactical-target';

test('authors ball flight presets with metre-based elevation, undo, manual editing and responsive controls', async ({ page }) => {
  page.on('dialog', dialog => { void dialog.accept(); });
  await page.goto('./#/tools/tactical-matchboard-studio');
  const setup = page.locator('.tactical-setup').first();
  await setup.getByLabel('Pitch length (m)').fill('60');
  await setup.getByLabel('Pitch width (m)').fill('40');
  await page.getByRole('button', { name: 'Build board' }).click();
  await expect(page.locator('.status-line').last()).toContainText(/^Built /);
  const stage = page.locator('.tactical-stage-panel');
  const summary = stage.locator('summary');
  await summary.focus();
  await stableTacticalTargetBox(summary);
  await summary.click();
  await expect(stage).toHaveJSProperty('open', true);
  const preset = stage.getByLabel('Ball flight preset');
  await expect(preset.locator('option')).toHaveText(['Ground', 'Driven', 'Lofted', 'Chipped']);
  await preset.selectOption('chipped');
  await expect(stage.getByLabel('Launch angle (degrees)')).toHaveValue('55');
  await preset.selectOption('lofted');
  await stage.getByLabel('Launch angle (degrees)').fill('45');
  for (const [label, value] of [
    ['Flight start X %', '10'], ['Flight start Y %', '20'],
    ['Flight end X %', '50'], ['Flight end Y %', '60'],
    ['Flight start (ms)', '1000'], ['Flight end (ms)', '3000'],
  ]) await stage.getByLabel(label!).fill(value!);
  await stage.getByRole('button', { name: 'Author ball flight', exact: true }).click();
  await expect(page.locator('.status-line').last()).toContainText('Lofted ball flight authored.');
  await expect(page.locator('[data-tactical-kind="elevation-trajectory"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-tactical-kind="elevation-trajectory"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('[data-tactical-kind="elevation-trajectory"]')).toHaveCount(1);

  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Playhead (ms)').fill('2000');
  await page.getByRole('button', { name: 'Set playhead' }).click();
  await expect(page.locator('#tactical-ball title')).toHaveText('Ball, elevation 7.21 m');
  await stage.getByLabel('Elevation time (ms)').fill('2000');
  await stage.getByLabel('Elevation (m)').fill('2');
  await stage.getByRole('button', { name: 'Author elevation', exact: true }).click();
  await expect(page.locator('#tactical-ball title')).toHaveText('Ball, elevation 2.00 m');

  await preset.selectOption('ground');
  await expect(stage.getByLabel('Launch angle (degrees)')).toBeDisabled();
  await stage.getByRole('button', { name: 'Author ball flight', exact: true }).click();
  await expect(page.locator('#tactical-ball title')).toHaveText('Ball');
  await preset.selectOption('driven');
  await expect(stage.getByLabel('Launch angle (degrees)')).toHaveValue('10');
  await stage.getByRole('button', { name: 'Author ball flight', exact: true }).click();
  await expect(page.locator('#tactical-ball title')).toHaveText('Ball, elevation 1.27 m');

  await stage.getByLabel('Flight end (ms)').fill('1000');
  await stage.getByRole('button', { name: 'Author ball flight', exact: true }).click();
  await expect(page.locator('.status-line').last()).toContainText('Flight end must be after its start.');
  await expect(page.locator('#tactical-ball title')).toHaveText('Ball, elevation 1.27 m');
  await expect(stage.getByText(/Local authoring aids/)).toBeVisible();
  const form = stage.locator('form[aria-describedby="ball-flight-note"]');
  for (const control of await form.locator('input:not(:disabled), select, button').all()) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).include('form[aria-describedby="ball-flight-note"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});
