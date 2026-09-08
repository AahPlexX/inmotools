import { expect, test } from '@playwright/test';

test('generates unit-correct fluid CSS with root assumptions, endpoint checks, preview text, and download', async ({ page }) => {
  await page.goto('./#/tools/fluid-type-matrix');
  await expect(page.getByTestId('base-clamp')).toHaveText('clamp(1rem, calc(0.7143rem + 1.4286vw), 2rem)');
  await expect(page.getByTestId('endpoint-checks')).toContainText('Pass');

  await page.getByLabel('Preview text').fill('Readable at every width');
  await expect(page.getByTestId('preview-320')).toHaveText('Readable at every width');
  await expect(page.getByTestId('preview-1440')).toHaveText('Readable at every width');

  await page.getByLabel('Root font size px').fill('20');
  await expect(page.getByTestId('base-clamp')).toHaveText('clamp(1rem, calc(0.7143rem + 1.7857vw), 2rem)');
  await expect(page.getByTestId('generated-css')).toContainText('assumes 1rem = 20px');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('fluid-type-scale.css');
});
