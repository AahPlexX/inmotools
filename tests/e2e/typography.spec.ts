import { expect, test } from '@playwright/test';

test('keeps emitted fluid CSS accurate across precision, resizing, unit, ratio, and preview controls', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('./#/tools/fluid-type-matrix');
  await expect(page.getByTestId('base-clamp')).toHaveText('clamp(1rem, calc(0.7143rem + 1.4286vw), 2rem)');
  await expect(page.getByTestId('endpoint-checks')).toContainText('Pass');

  const beforeResize = await page.getByTestId('live-css-size').textContent();
  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(async () => page.getByTestId('live-css-size').textContent()).not.toBe(beforeResize);

  await page.getByLabel('Preview text').fill('Readable at every width');
  await page.getByLabel('Preview widths px').fill('360, 900');
  await expect(page.getByTestId('preview-360')).toHaveText('Readable at every width');
  await expect(page.getByTestId('preview-900')).toHaveText('Readable at every width');
  await expect(page.getByTestId('viewport-previews').locator('.metric')).toHaveCount(2);

  await page.getByLabel('Root font size px').fill('20');
  await expect(page.getByTestId('base-clamp')).toHaveText('clamp(1rem, calc(0.7143rem + 1.7857vw), 2rem)');
  await page.getByLabel('Type size unit').selectOption('px');
  await expect(page.getByLabel('Minimum size (px)')).toHaveValue('20');
  await expect(page.getByLabel('Maximum size (px)')).toHaveValue('40');
  await expect(page.getByTestId('base-clamp')).toHaveText('clamp(20px, calc(14.2857px + 1.7857vw), 40px)');
  await page.getByLabel('Type size unit').selectOption('rem');

  await page.getByLabel('Lowest step').fill('1.8');
  await expect(page.getByLabel('Lowest step')).toHaveValue('1');
  await page.getByLabel('Scale ratio').fill('0');
  await expect(page.getByTestId('scale-matrix-error')).toContainText(/ratio must be a positive finite number/i);
  await page.getByLabel('Scale ratio').fill('1.25');

  await page.getByLabel('Minimum size (rem)').fill('0.00001');
  await page.getByLabel('Maximum size (rem)').fill('0.00002');
  await expect(page.getByTestId('base-clamp')).not.toContainText('clamp(0rem');
  await expect(page.getByTestId('base-clamp')).not.toContainText('calc(0rem + 0vw)');
  await expect(page.getByTestId('endpoint-checks')).toContainText('Pass');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('fluid-type-scale.css');
});
