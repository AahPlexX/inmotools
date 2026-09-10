import { expect, test } from '@playwright/test';

const vtt = `WEBVTT - captions

STYLE
::cue { color: lime; }

intro
00:00:01.000 --> 00:00:02.000 line:10% position:25% align:start
Cap <00:00:01.500>tion
`;

const srt = (text: string) => `1\n00:00:01,000 --> 00:00:02,000\n${text}\n`;

test('previews and applies drift correction without mutating the original WebVTT source', async ({ page }) => {
  await page.goto('./#/tools/subtitle-drift');
  const source = page.getByLabel('Original subtitle contents');
  await source.fill(vtt);
  await expect(page.getByTestId('subtitle-output-policy')).toContainText(/overlaps are preserved/i);
  await page.getByLabel('Source time').first().fill('00:00:01.000');
  await page.getByLabel('Correct time').first().fill('00:00:02.000');
  await page.getByLabel('Source time').nth(1).fill('00:00:02.000');
  await page.getByLabel('Correct time').nth(1).fill('00:00:03.000');

  await page.getByRole('button', { name: 'Preview correction' }).click();
  const output = page.getByLabel('Correction preview');
  await expect(output).toHaveValue(/STYLE/);
  await expect(output).toHaveValue(/00:00:02\.000 --> 00:00:03\.000 line:10% position:25% align:start/);
  await expect(output).toHaveValue(/Cap <00:00:02\.500>tion/);
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

test('reports malformed SRT blocks instead of silently dropping them', async ({ page }) => {
  await page.goto('./#/tools/subtitle-drift');
  await page.getByLabel('Original subtitle contents').fill(`1\n00:00:01,000 --> 00:00:02,000\nGood\n\nBROKEN BLOCK\n`);
  await expect(page.getByText(/Check subtitle syntax: SRT block 2.*timing line.*nothing was discarded/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview correction' })).toBeDisabled();
});

test('keeps the newest file or editor change when an older file read completes later', async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    File.prototype.text = function patchedText() {
      const file = this;
      const delay = file.name.startsWith('slow-') ? 150 : 0;
      return new Promise<string>((resolve, reject) => {
        window.setTimeout(() => originalText.call(file).then(resolve, reject), delay);
      });
    };
  });
  await page.goto('./#/tools/subtitle-drift');
  const input = page.getByLabel('Choose subtitle file (optional)');
  const source = page.getByLabel('Original subtitle contents');

  await input.setInputFiles({ name: 'slow-old.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(srt('OLD')) });
  await input.setInputFiles({ name: 'new.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(srt('NEW')) });
  await expect(source).toHaveValue(srt('NEW'));
  await page.waitForTimeout(220);
  await expect(source).toHaveValue(srt('NEW'));

  await input.setInputFiles({ name: 'slow-editor.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(srt('STALE')) });
  await source.fill(srt('MANUAL'));
  await page.waitForTimeout(220);
  await expect(source).toHaveValue(srt('MANUAL'));
});
