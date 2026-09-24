import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { readPhotoTiff } from '../../src/tools/photo/photo-tiff-writer';
import { texturedScenePng } from '../fixtures/photo-png';

test.use({ serviceWorkers: 'block' });

const SCENE = texturedScenePng(320, 240, { seed: 5 });

async function openPhoto(page: Page, name = 'scene.png', buffer = SCENE) {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expect(page.getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();
  await page.setInputFiles('[data-testid="photo-file-input"]', { name, mimeType: 'image/png', buffer });
  await expect(page.getByTestId('photo-preview')).toBeVisible();
}

async function openExport(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export photo' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function bytesOf(download: Download): Promise<Buffer> {
  return readFile((await download.path())!);
}

async function imageSize(page: Page, bytes: Buffer): Promise<number[]> {
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(data)], { type: 'image/png' }));
    const size = [bitmap.width, bitmap.height];
    bitmap.close();
    return size;
  }, [...bytes]);
}

test('TIFF export with Lanczos resampling writes a real baseline TIFF at the requested size', async ({ page }) => {
  await openPhoto(page);
  const dialog = await openExport(page);
  await dialog.getByLabel('File format').selectOption('image/tiff');
  await expect(dialog.getByTestId('photo-format-facts')).toContainText('Lossless');
  await expect(dialog.getByLabel('Quality')).toBeDisabled();
  await dialog.getByLabel('Resize', { exact: true }).selectOption('long-edge');
  await dialog.getByLabel('Resize value', { exact: true }).fill('100');
  await dialog.getByLabel('Resampling').selectOption('lanczos3');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('scene-edited.tif');
  const tiff = readPhotoTiff(new Uint8Array(await bytesOf(download)));
  expect([tiff.width, tiff.height]).toEqual([100, 75]);
});

test('AVIF export encodes in the background, decodes back at the planned size, and keeps metadata in the sidecar', async ({ page }) => {
  test.setTimeout(90_000);
  await openPhoto(page);
  const dialog = await openExport(page);
  await dialog.getByLabel('File format').selectOption('image/avif');
  await expect(dialog.getByTestId('photo-format-facts')).toContainText('XMP sidecar');
  await dialog.getByLabel('Resize', { exact: true }).selectOption('width');
  await dialog.getByLabel('Resize value', { exact: true }).fill('160');
  await dialog.getByLabel('Metadata policy').selectOption('rights');
  await dialog.getByLabel('Creator').fill('Studio Test');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('scene-edited.avif');
  const bytes = await bytesOf(download);
  expect(bytes.subarray(4, 12).toString('latin1')).toBe('ftypavif');
  const size = await page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(data)], { type: 'image/avif' }));
    const result = [bitmap.width, bitmap.height];
    bitmap.close();
    return result;
  }, [...bytes]);
  expect(size).toEqual([160, 120]);
  await expect(page.locator('.photo-status-message')).toContainText('XMP embedding failed');
  await dialog.getByLabel('Lossless AVIF (exact pixels, larger file)').check();
  await expect(dialog.getByLabel('Quality')).toBeDisabled();
});

test('export presets persist across reloads and apply every saved setting', async ({ page }) => {
  await openPhoto(page);
  let dialog = await openExport(page);
  await dialog.getByLabel('File format').selectOption('image/png');
  await dialog.getByLabel('Delivery size').selectOption('thumbnail');
  await dialog.getByLabel('Don’t enlarge photos that are already smaller than this size').check();
  await expect(dialog.getByText('Planned output · 320 × 240')).toBeVisible();
  await dialog.getByLabel('Export preset name').fill('Small web');
  await dialog.getByRole('button', { name: 'Save as new preset' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('Export preset “Small web” saved');

  await page.reload();
  await openPhoto(page);
  dialog = await openExport(page);
  await expect(dialog.getByLabel('File format')).toHaveValue('image/jpeg');
  await dialog.getByLabel('Export preset', { exact: true }).selectOption({ label: 'Small web' });
  await expect(dialog.getByLabel('File format')).toHaveValue('image/png');
  await expect(dialog.getByLabel('Resize', { exact: true })).toHaveValue('long-edge');
  await expect(dialog.getByLabel('Resize value', { exact: true })).toHaveValue('400');
  // The saved "don't enlarge" choice keeps this 320 × 240 photo at its own size.
  await expect(dialog.getByText('Planned output · 320 × 240')).toBeVisible();
  await dialog.getByLabel('Don’t enlarge photos that are already smaller than this size').uncheck();
  await expect(dialog.getByText('Planned output · 400 × 300')).toBeVisible();
});

test('one photo exports to several presets in sequence', async ({ page }) => {
  await openPhoto(page);
  const dialog = await openExport(page);
  await dialog.getByLabel('File format').selectOption('image/jpeg');
  await dialog.getByLabel('Export preset name').fill('Web JPEG');
  await dialog.getByRole('button', { name: 'Save as new preset' }).click();
  await dialog.getByLabel('File format').selectOption('image/tiff');
  await dialog.getByLabel('Export preset name').fill('Archive TIFF');
  await dialog.getByRole('button', { name: 'Save as new preset' }).click();
  await dialog.getByText('Export several versions at once').click();
  const multi = dialog.getByTestId('photo-multi-output');
  await multi.getByLabel(/Web JPEG/).check();
  await multi.getByLabel(/Archive TIFF/).check();
  const names: string[] = [];
  page.on('download', (download) => names.push(download.suggestedFilename()));
  await multi.getByRole('button', { name: 'Export 2 versions' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('2 versions exported');
  await expect.poll(() => names.sort()).toEqual(['scene.jpg', 'scene.tif']);
  await expect(dialog.getByTestId('photo-export-manifest')).toBeVisible();
});

test('batch naming rules, failure isolation, retry, and a CSV summary', async ({ page }) => {
  await openPhoto(page);
  const dialog = await openExport(page);
  await dialog.getByLabel('File format').selectOption('image/png');
  await dialog.getByText('Batch export current recipe', { exact: true }).click();
  await dialog.getByLabel('Batch naming rule').fill('{name}_{n:2}');
  await dialog.getByLabel('Choose batch photos').setInputFiles([
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a png') },
    { name: 'good.png', mimeType: 'image/png', buffer: SCENE },
  ]);
  await expect(dialog.getByTestId('photo-filename-preview')).toHaveText('broken_01.png');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export 2 photos' }).click();
  expect((await downloading).suggestedFilename()).toBe('good_02.png');
  await expect(page.locator('.photo-status-message')).toContainText('1 completed · 1 failed');
  await expect(dialog.locator('.photo-batch-status li[data-status="failed"]')).toHaveCount(1);

  const csvDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download summary (CSV)' }).click();
  const csv = (await bytesOf(await csvDownload)).toString('utf8');
  expect(csv).toContain('good.png,good_02.png,done,320,240');
  expect(csv).toContain('broken.png,,failed');

  await dialog.getByRole('button', { name: 'Retry failed' }).click();
  await expect(dialog.locator('.photo-batch-status li[data-status="queued"]')).toHaveCount(1);
  await expect(dialog.getByText('1 queued')).toBeVisible();
});

test('batch sync can apply the look without the crop', async ({ page }) => {
  await openPhoto(page);
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  await page.getByRole('button', { name: '1:1' }).click();
  const dialog = await openExport(page);
  await dialog.getByLabel('File format').selectOption('image/png');
  await dialog.getByText('Batch export current recipe', { exact: true }).click();
  await dialog.getByLabel('Only selected groups (sync look, skip crop and spot fixes)').check();
  await dialog.getByLabel('Choose batch photos').setInputFiles([{ name: 'other.png', mimeType: 'image/png', buffer: SCENE }]);
  let downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
  expect(await imageSize(page, await bytesOf(await downloading))).toEqual([320, 240]); // Crop was not synced.

  await dialog.getByLabel('All current edits').check();
  await dialog.getByLabel('Choose batch photos').setInputFiles([{ name: 'cropped.png', mimeType: 'image/png', buffer: SCENE }]);
  downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export 1 photo' }).click();
  expect(await imageSize(page, await bytesOf(await downloading))).toEqual([240, 240]); // Every edit, including the 1:1 crop.
});

test('metadata templates fill exports and keep location out unless opted in', async ({ page }) => {
  await openPhoto(page);
  const dialog = await openExport(page);
  await dialog.getByLabel('File format').selectOption('image/png');
  await dialog.getByLabel('Metadata policy').selectOption('rights');
  await dialog.getByLabel('Creator').fill('Studio Test');
  await dialog.getByLabel('Metadata template name').fill('Rights');
  await dialog.getByRole('button', { name: 'Save fields as template' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('saved without location fields');
  await dialog.getByLabel('Creator').fill('');
  await dialog.getByLabel('Metadata template', { exact: true }).selectOption({ label: 'Rights' });
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo' }).click();
  const bytes = await bytesOf(await downloading);
  expect(bytes.includes(Buffer.from('Studio Test'))).toBe(true);
});

test('watermark presets stamp exports without changing the project', async ({ page }) => {
  await openPhoto(page);
  const dialog = await openExport(page);
  await dialog.getByLabel('File format').selectOption('image/png');
  let downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo' }).click();
  const plain = await bytesOf(await downloading);

  await dialog.getByText('Watermark presets').click();
  await dialog.getByLabel('Watermark preset name').fill('Proof mark');
  await dialog.getByLabel('Watermark text').fill('PROOF');
  await dialog.getByLabel('Watermark size percent').fill('20');
  await dialog.getByLabel('Watermark opacity percent').fill('100');
  await dialog.getByRole('button', { name: 'Save watermark preset' }).click();
  await dialog.getByLabel('Watermark', { exact: true }).selectOption({ label: 'Proof mark' });
  downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo' }).click();
  const stamped = await bytesOf(await downloading);
  expect(stamped.equals(plain)).toBe(false);

  await dialog.getByRole('button', { name: 'Close export dialog' }).click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.getByTestId('photo-layer')).toHaveCount(0);
  await page.getByLabel('Saved watermark preset').selectOption({ label: 'Proof mark' });
  await page.getByRole('button', { name: 'Add as layer' }).click();
  await expect(page.getByTestId('photo-layer')).toHaveCount(1);
});

test('print planner reports density and sizes the export for a paper', async ({ page }) => {
  await openPhoto(page);
  const dialog = await openExport(page);
  await dialog.getByText('Print size planner').click();
  await dialog.getByLabel('Print paper').selectOption('4x6');
  // 320 × 240 turned sideways onto 4 × 6 in is limited by the 4 in side: 240 px / 4 in = 60 ppi,
  // printing 4 × 5.33 in. At 300 ppi that print needs 1200 × 1600 px, so a 1600 px long edge.
  await expect(dialog.getByTestId('photo-print-result')).toContainText('4.00 in × 5.33 in at 60 ppi (turned sideways)');
  await expect(dialog.getByTestId('photo-print-result')).toContainText('Print smaller or use a larger original');
  await dialog.getByRole('button', { name: 'Size export for this print at 300 ppi' }).click();
  await expect(dialog.getByLabel('Resize', { exact: true })).toHaveValue('long-edge');
  await expect(dialog.getByLabel('Resize value', { exact: true })).toHaveValue('1600');
});

test('contact sheets are produced as a PDF from the queued photos', async ({ page }) => {
  await openPhoto(page);
  const dialog = await openExport(page);
  await dialog.getByText('Batch export current recipe', { exact: true }).click();
  await dialog.getByLabel('Choose batch photos').setInputFiles([
    { name: 'one.png', mimeType: 'image/png', buffer: SCENE },
    { name: 'two.png', mimeType: 'image/png', buffer: texturedScenePng(200, 300, { seed: 9 }) },
  ]);
  await dialog.getByText('Contact sheet', { exact: true }).click();
  await dialog.getByLabel('Contact sheet heading').fill('Picks');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Create contact sheet (2 photos)' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('picks.pdf');
  expect((await bytesOf(download)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  await expect(page.locator('.photo-status-message')).toContainText('Contact sheet ready · 2 photos on 1 page');
});

test('selected setting groups copy between photos without the crop', async ({ page }) => {
  await openPhoto(page);
  await page.getByLabel('Exposure value').fill('1');
  await page.getByLabel('Exposure value').press('Enter');
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  await page.getByRole('button', { name: '1:1' }).click();
  await page.getByRole('button', { name: 'Inspect & workflow' }).click();
  const copy = page.getByTestId('photo-copy-settings');
  await copy.locator('summary').click();
  await copy.getByRole('button', { name: 'Look only' }).click();
  await copy.getByRole('button', { name: 'Copy selected settings' }).click();

  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'second.png', mimeType: 'image/png', buffer: SCENE });
  await expect(page.locator('.photo-status-message')).toContainText('second.png');
  await page.getByRole('button', { name: 'Paste edits' }).click();
  await expect(page.getByText('Edited frame 320 × 240')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Exposure value')).toHaveValue('1');
});

test('snapshots can be renamed, duplicated, compared, and deleted', async ({ page }) => {
  await openPhoto(page);
  await page.getByRole('button', { name: 'Inspect & workflow' }).click();
  await page.getByRole('textbox', { name: 'Snapshot name' }).fill('Neutral');
  await page.getByRole('button', { name: 'Save snapshot' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Exposure value').fill('0.7');
  await page.getByLabel('Exposure value').press('Enter');
  await page.getByRole('button', { name: 'Inspect & workflow' }).click();

  await page.getByLabel('Rename snapshot 1').fill('Baseline');
  await page.getByLabel('Rename snapshot 1').press('Enter');
  await expect(page.getByRole('button', { name: /^Baseline/ })).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate snapshot 1' }).click();
  await expect(page.getByTestId('photo-snapshot')).toHaveCount(2);

  const compare = page.getByTestId('photo-compare-recipes');
  await compare.locator('summary').click();
  await compare.getByLabel('Compare with').selectOption({ label: 'Snapshot · Baseline' });
  await expect(compare.getByTestId('photo-recipe-diff')).toContainText('Exposure');
  await expect(compare.getByTestId('photo-recipe-diff')).toContainText('0.70');

  await page.getByRole('button', { name: 'Delete snapshot 2' }).click();
  await expect(page.getByTestId('photo-snapshot')).toHaveCount(1);
});

test('a deleted local project can be restored with undo', async ({ page }) => {
  await openPhoto(page, 'keeper.png');
  await page.getByRole('button', { name: 'Inspect & workflow' }).click();
  const projects = page.getByTestId('photo-project-panel');
  await projects.getByRole('textbox', { name: 'Project name' }).fill('Keeper');
  await projects.getByRole('button', { name: 'Save project now' }).click();
  const card = projects.getByTestId('photo-project-card').filter({ hasText: 'Keeper' });
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Delete local project' }).click();
  await expect(card).toHaveCount(0);
  await projects.getByRole('button', { name: 'Undo delete' }).click();
  await expect(page.locator('.photo-status-message')).toContainText('Keeper restored');
  await expect(card).toHaveCount(1);
});

test('export dialog and inspect panel reflow at 320 CSS px with the new sections open', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openPhoto(page);
  const dialog = await openExport(page);
  for (const section of ['Print size planner', 'Batch export current recipe', 'Export several versions at once', 'Watermark presets', 'Contact sheet']) {
    await dialog.getByText(section, { exact: true }).click();
  }
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Inspect & workflow' }).click();
  await page.getByTestId('photo-copy-settings').locator('summary').click();
  await page.getByTestId('photo-compare-recipes').locator('summary').click();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
