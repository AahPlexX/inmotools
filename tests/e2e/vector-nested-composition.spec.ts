import { expect, test } from '@playwright/test';

test('Vector Studio preserves nested difference compositions on the live canvas', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  const canvas = page.getByTestId('vector-canvas');

  await page.getByRole('button', { name: 'Rectangle tool' }).click();
  await canvas.click({ position: { x: 220, y: 180 } });
  await canvas.click({ position: { x: 300, y: 220 } });
  await canvas.click({ position: { x: 470, y: 300 } });
  await expect(page.getByTestId('vector-layer')).toHaveCount(3);

  await page.getByRole('button', { name: 'Select tool' }).click();
  const artwork = page.locator('[data-vector-element]');
  await artwork.nth(0).locator(':scope > rect:not(.vector-selection-outline)').click();
  await artwork.nth(1).locator(':scope > rect:not(.vector-selection-outline)').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Difference selection' }).click();
  await expect(page.getByTestId('vector-layer')).toHaveCount(2);
  await expect(canvas.locator('mask')).toHaveCount(1);

  // Make the existing composition the last document object so it becomes the
  // cutter when the second difference composition is created.
  await page.getByRole('button', { name: 'Bring to front' }).click();
  await page.getByRole('tab', { name: 'Layers' }).click();
  const remainingLayer = page.getByTestId('vector-layer').filter({ hasText: 'Rectangle' });
  const compositionLayer = page.getByTestId('vector-layer').filter({ hasText: 'Difference composition' });
  await remainingLayer.getByRole('button').first().click();
  await compositionLayer.getByRole('button').first().click({ modifiers: ['Shift'] });
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: 'Difference selection' }).click();

  await expect(page.getByTestId('vector-layer')).toHaveCount(1);
  await expect(canvas.locator('mask')).toHaveCount(2);
  await expect(canvas.locator('g[mask]')).toHaveCount(2);

  await page.getByRole('tab', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Preview SVG source' }).click();
  const source = await page.getByLabel('Vector SVG export source').textContent();
  expect((source?.match(/<mask\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
});
