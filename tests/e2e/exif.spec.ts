import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('sanitizes an image locally, reinspects it, and produces a download', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles({ name: 'private.png', mimeType: 'image/png', buffer: onePixelPng });
  await expect(page.getByText('No sensitive metadata found', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sanitize and download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('private-sanitized.png');
  await expect(page.getByText('Reinspection found no sensitive metadata')).toBeVisible();
  await expect(page.getByAltText('Sanitized preview of private.png')).toBeVisible();
});

test('supports batch inspection and explicit output format selection', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'second.png', mimeType: 'image/png', buffer: onePixelPng },
  ]);
  await expect(page.getByText('first.png')).toBeVisible();
  await expect(page.getByText('second.png')).toBeVisible();
  await page.getByLabel('Output format').selectOption('image/jpeg');
  await page.getByRole('button', { name: 'Sanitize files' }).click();
  await expect(page.getByText(/2 sanitized copies created and reinspected/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download' })).toHaveCount(2);
});
