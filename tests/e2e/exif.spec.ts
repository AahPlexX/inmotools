import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('sanitizes an image locally, reinspects it, and produces a download', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles({ name: 'private.png', mimeType: 'image/png', buffer: onePixelPng });
  await expect(page.getByText('Inspected metadata; no sensitive-field rule matches', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sanitize and download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('private-sanitized.png');
  await expect(page.getByText('Reinspected metadata; no sensitive-field rule matches')).toBeVisible();
  await expect(page.getByAltText('Sanitized preview of private.png')).toBeVisible();
});

test('supports batch ZIP, per-file removal, and explicit JPEG background selection', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'second.png', mimeType: 'image/png', buffer: onePixelPng },
  ]);
  await expect(page.getByRole('cell', { name: 'first.png', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'second.png', exact: true })).toBeVisible();

  await page.getByLabel('Output format').selectOption('image/jpeg');
  await expect(page.getByLabel('JPEG transparency background')).toBeVisible();
  await expect(page.getByLabel('JPEG transparency background')).toHaveValue('#ffffff');
  await page.getByRole('button', { name: 'Sanitize files' }).click();
  await expect(page.getByText(/2 sanitized copies created and reinspected/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(2);

  const zipDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download batch ZIP' }).click();
  const zipDownload = await zipDownloadPromise;
  expect(zipDownload.suggestedFilename()).toBe('exif-sanitized-batch.zip');

  await page.getByRole('button', { name: 'Remove' }).first().click();
  await expect(page.getByRole('cell', { name: 'first.png', exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'second.png', exact: true })).toBeVisible();
});
