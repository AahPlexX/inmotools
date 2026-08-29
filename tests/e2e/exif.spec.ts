import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('sanitizes an image locally and produces a download', async ({ page }) => {
  await page.goto('./#/tools/exif-scrubber');
  await page.getByLabel('Choose image').setInputFiles({ name: 'private.png', mimeType: 'image/png', buffer: onePixelPng });
  await expect(page.getByText(/No sensitive metadata found|Sensitive metadata/i)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sanitize and download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('private-sanitized.png');
});
