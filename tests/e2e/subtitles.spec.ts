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

async function readDownload(download: import('@playwright/test').Download) {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function srtWithCues(count: number) {
  const stamp = (ms: number) => {
    const pad = (value: number, width = 2) => String(value).padStart(width, '0');
    return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return Array.from({ length: count }, (_, index) => `${index + 1}\n${stamp(index * 2000 + 1000)} --> ${stamp(index * 2000 + 2000)}\nCue text ${index + 1}\n`).join('\n');
}

test('SUB-R11 a source or anchor change clears the old preview and asks for a new one', async ({ page }) => {
  await page.goto('./#/tools/subtitle-drift');
  const status = page.locator('.workspace-body .status-line[role="status"]');
  const preview = page.getByRole('button', { name: 'Preview correction' });
  const apply = page.getByRole('button', { name: 'Apply preview' });
  const download = page.getByRole('button', { name: 'Download corrected copy' });

  for (const anchor of ['#src-start', '#dst-start', '#src-end', '#dst-end']) {
    await preview.click();
    await expect(page.getByLabel('Correction preview')).toBeVisible();
    await page.locator(anchor).fill('500');
    await expect(page.getByLabel('Correction preview')).toHaveCount(0);
    await expect(apply).toBeDisabled();
    await expect(download).toBeDisabled();
    await expect(status).toHaveText('Anchor changed. Preview the correction again before applying or downloading.');
    await page.locator(anchor).fill(anchor.endsWith('end') ? '100000' : '0');
  }

  await preview.click();
  await apply.click();
  await expect(page.getByLabel('Applied output copy')).toBeVisible();
  await page.getByLabel('Original subtitle contents').fill(srt('Edited'));
  await expect(page.getByLabel('Applied output copy')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo apply' })).toBeDisabled();
  await expect(download).toBeDisabled();
  await expect(status).toHaveText('Source changed. Preview the correction again before applying or downloading.');
});

test('SUB-R13 the before/after table lists original and corrected times with text, 100 rows per page', async ({ page }) => {
  await page.goto('./#/tools/subtitle-drift');
  await page.getByLabel('Original subtitle contents').fill(srtWithCues(150));
  await expect(page.getByText(/150 cues detected/)).toBeVisible();
  await page.locator('#src-start').fill('0');
  await page.locator('#dst-start').fill('1000');
  await page.locator('#src-end').fill('100000');
  await page.locator('#dst-end').fill('101000');
  await page.getByRole('button', { name: 'Preview correction' }).click();

  const table = page.getByRole('region', { name: 'Before and after subtitle cue comparison' });
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(100);
  await expect(rows.first().locator('td')).toHaveText(['1', '00:00:01.000 → 00:00:02.000', '00:00:02.000 → 00:00:03.000', 'Cue text 1']);
  await expect(page.getByText('Rows 1–100 of 150 · page 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(rows).toHaveCount(50);
  await expect(rows.first().locator('td')).toHaveText(['101', '00:03:21.000 → 00:03:22.000', '00:03:22.000 → 00:03:23.000', 'Cue text 101']);
  await expect(rows.last().locator('td')).toHaveText(['150', '00:04:59.000 → 00:05:00.000', '00:05:00.000 → 00:05:01.000', 'Cue text 150']);
});

test('SUB-R14 downloads an SRT input as <name>-corrected.srt in SRT format', async ({ page }) => {
  await page.goto('./#/tools/subtitle-drift');
  const source = srt('Movie line');
  await page.getByLabel('Choose subtitle file (optional)').setInputFiles({ name: 'movie.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(source) });
  await expect(page.getByLabel('Original subtitle contents')).toHaveValue(source);
  await page.locator('#dst-start').fill('500');
  await page.locator('#dst-end').fill('100500');
  await page.getByRole('button', { name: 'Preview correction' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download corrected copy' }).click();
  const saved = await pending;
  expect(saved.suggestedFilename()).toBe('movie-corrected.srt');
  expect(await readDownload(saved)).toBe('1\n00:00:01,500 --> 00:00:02,500\nMovie line\n');

  await page.getByLabel('Original subtitle contents').fill(srt('Typed line'));
  await page.getByRole('button', { name: 'Preview correction' }).click();
  const typed = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download corrected copy' }).click();
  expect((await typed).suggestedFilename()).toBe('movie-corrected.srt');
});

for (const width of [320, 375, 768, 1024, 1440, 1920, 2560]) {
  test(`SUB-R17 lays out without horizontal overflow at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'viewport matrix runs on the desktop project');
    await page.setViewportSize({ width, height: width < 800 ? 800 : 1000 });
    await page.goto('./#/tools/subtitle-drift');
    await page.getByLabel('Original subtitle contents').fill(vtt);
    await page.getByRole('button', { name: 'Preview correction' }).click();
    await page.getByRole('button', { name: 'Apply preview' }).click();
    await expect(page.getByLabel('Applied output copy')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const name of ['Preview correction', 'Apply preview', 'Undo apply', 'Download corrected copy']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${name} inside viewport at ${width}px`).toBe(true);
    }
    for (const id of ['#subtitle-file', '#subtitle-text', '#src-start', '#dst-start', '#src-end', '#dst-end', '#subtitle-output']) {
      const box = await page.locator(id).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${id} inside viewport at ${width}px`).toBe(true);
    }
  });
}
