import { expect, test } from '@playwright/test';

const vtt = `WEBVTT - captions

STYLE
::cue { color: lime; }

intro
00:00:01.000 --> 00:00:02.000 line:10% position:25% align:start
Caption
`;

test('previews and applies drift correction without mutating the original WebVTT source', async ({ page }) => {
  await page.goto('./#/tools/subtitle-drift');
  const source = page.getByLabel('Original subtitle contents');
  await source.fill(vtt);
  await page.getByLabel('Source time').first().fill('00:00:01.000');
  await page.getByLabel('Correct time').first().fill('00:00:02.000');
  await page.getByLabel('Source time').nth(1).fill('00:00:02.000');
  await page.getByLabel('Correct time').nth(1).fill('00:00:03.000');

  await page.getByRole('button', { name: 'Preview correction' }).click();
  const output = page.getByLabel('Correction preview');
  await expect(output).toHaveValue(/STYLE/);
  await expect(output).toHaveValue(/00:00:02\.000 --> 00:00:03\.000 line:10% position:25% align:start/);
  await expect(source).toHaveValue(vtt);

  await page.getByRole('button', { name: 'Apply preview' }).click();
  await expect(page.getByLabel('Applied output copy')).toHaveValue(/STYLE/);
  await expect(source).toHaveValue(vtt);
  await expect(page.getByRole('button', { name: 'Undo apply' })).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download corrected copy' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('subtitle-corrected.vtt');
});
