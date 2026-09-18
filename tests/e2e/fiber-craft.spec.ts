import { readFile } from 'node:fs/promises';
import { expect, test, type Download } from '@playwright/test';

const inspectPngDownload = async (download: Download) => {
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const inspectPdfDownload = async (download: Download) => {
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  expect(bytes.byteLength).toBeGreaterThan(1_000);
};

test.describe('Fiber Craft Workstation', () => {
  test('edits crochet charts, exports patterns, moves a portable project, and restores the local session', async ({ page }) => {
    await page.goto('./#/fiber-craft-workstation');

    await expect(page.getByRole('heading', { name: 'Fiber Craft Workstation' })).toBeVisible();
    await expect(page.getByTestId('active-round-progress')).toHaveText('0 of 6 stitches worked');

    const undo = page.getByRole('button', { name: 'Undo' });
    const redo = page.getByRole('button', { name: 'Redo' });
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    await page.locator('#fiber-stitch-symbol').selectOption('sc-dc');
    await page.getByRole('button', { name: 'Place next stitch' }).click();
    await expect(page.getByTestId('active-round-progress')).toHaveText('1 of 6 stitches worked');
    await expect(page.getByTestId('crochet-round-canvas')).toHaveAttribute('data-symbol-rendering', 'vector');
    await expect(page.getByTestId('crochet-round-canvas')).toHaveAttribute('data-rendered-symbols', '1');
    await expect(page.getByTestId('written-pattern')).toContainText('1 sc [Primary]');
    await expect(page.getByTestId('chart-description')).toContainText('1 position worked');
    await expect(page.getByTestId('chart-description')).toContainText('Round 1: 6 positions, 1 worked, 5 unworked.');

    await page.locator('#fiber-display-theme').selectOption('dark-room');
    await expect(page.locator('.fiber-craft-workspace')).toHaveAttribute('data-fiber-theme', 'dark-room');
    await expect(page.getByTestId('crochet-round-canvas')).toHaveAttribute('data-canvas-theme', 'dark-room');
    await page.locator('#fiber-display-theme').selectOption('high-contrast');
    await expect(page.locator('.fiber-craft-workspace')).toHaveAttribute('data-fiber-theme', 'high-contrast');
    await expect(page.getByTestId('crochet-round-canvas')).toHaveAttribute('data-canvas-theme', 'high-contrast');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('crochet-round-canvas')).toHaveCSS('filter', 'grayscale(1) contrast(1.8)');
    await page.emulateMedia({ media: 'screen' });
    await page.locator('#fiber-display-theme').selectOption('light');

    await page.getByRole('button', { name: 'Hide chart description' }).click();
    await expect(page.getByTestId('chart-description')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show chart description' }).click();
    await expect(page.getByTestId('chart-description')).toBeVisible();
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(page.getByTestId('active-round-progress')).toHaveText('0 of 6 stitches worked');
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(page.getByTestId('active-round-progress')).toHaveText('1 of 6 stitches worked');

    await page.getByRole('button', { name: 'Mark round complete' }).click();
    await expect(page.getByRole('button', { name: 'Mark round unfinished' })).toBeVisible();

    await page.getByLabel('Yarn weight').selectOption('4');
    await page.getByRole('button', { name: 'Use these project defaults' }).click();
    await expect(page.getByLabel('Project yarn / material')).toHaveValue('4 Medium');

    await page.locator('#fiber-gauge-stitches').fill('20');
    await page.locator('#fiber-gauge-rows').fill('28');
    await page.locator('#fiber-gauge-span').fill('4');
    await page.locator('#fiber-gauge-unit').selectOption('in');
    await page.getByRole('button', { name: 'Save measured gauge' }).click();
    await expect(page.getByTestId('gauge-scaling')).toContainText('6 stitches ≈ 1.20 in circumference');
    await page.locator('#fiber-finished-diameter').fill('4');
    await expect(page.getByTestId('gauge-recommendation')).toContainText('63 stitches');

    await page.locator('#fiber-project-level').selectOption('Intermediate');
    await page.locator('#fiber-technique-tags').fill('amigurumi, shaping, amigurumi');
    await page.getByRole('button', { name: 'Save pattern details' }).click();
    await expect(page.getByTestId('pattern-details-summary')).toContainText('Intermediate');
    await expect(page.getByTestId('pattern-details-summary')).toContainText('amigurumi · shaping');

    await page.locator('#fiber-png-scale').selectOption('4');
    const [roundPng] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export PNG' }).click(),
    ]);
    expect(roundPng.suggestedFilename()).toBe('crochet-round-chart-4x.png');
    await expect(inspectPngDownload(roundPng)).resolves.toEqual({ width: 3840, height: 2880 });

    const [patternPdf] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export pattern PDF' }).click(),
    ]);
    expect(patternPdf.suggestedFilename()).toBe('crochet-round-chart-pattern-book.pdf');
    await inspectPdfDownload(patternPdf);

    const [socialPreview] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export social preview' }).click(),
    ]);
    expect(socialPreview.suggestedFilename()).toBe('crochet-round-chart-social-preview.png');
    await expect(inspectPngDownload(socialPreview)).resolves.toEqual({ width: 1200, height: 630 });

    await page.getByLabel('Chart mode').selectOption('grid');
    const firstCell = page.getByRole('button', { name: 'Row 1, column 1, open' });
    await firstCell.click();
    await expect(page.getByTestId('c2c-summary')).toContainText('1 filled block');
    await expect(page.getByTestId('filet-summary')).toContainText('1 filled mesh');
    await expect(page.getByTestId('chart-description')).toContainText('12 rows and 12 columns');
    await expect(page.getByTestId('chart-description')).toContainText('Row 1: 1 filled, 11 open.');
    await page.getByText('C2C row-by-row counts', { exact: true }).click();
    await expect(page.getByTestId('c2c-row-counts')).toContainText('C2C row 1: 1 filled of 1 block.');
    await page.getByRole('button', { name: 'Center active row' }).click();
    await expect(page.getByLabel('Row 1', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Mark row complete' }).click();
    await expect(page.getByRole('button', { name: 'Mark row unfinished' })).toBeVisible();

    await page.locator('#fiber-png-scale').selectOption('2');
    const [gridPng] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export PNG' }).click(),
    ]);
    expect(gridPng.suggestedFilename()).toBe('crochet-round-chart-2x.png');
    await expect(inspectPngDownload(gridPng)).resolves.toEqual({ width: 1920, height: 1440 });

    const [projectDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save .craftproj' }).click()]);
    expect(projectDownload.suggestedFilename()).toBe('crochet-round-chart.craftproj');
    const projectPath = await projectDownload.path();
    expect(projectPath).not.toBeNull();

    await page.getByRole('button', { name: /Row 1, column 1, filled/ }).click();
    await page.getByRole('button', { name: 'Mark row unfinished' }).click();
    await expect(page.getByRole('button', { name: 'Row 1, column 1, open' })).toBeVisible();
    await page.getByLabel('Open project file').setInputFiles(projectPath!);
    await expect(page.getByRole('button', { name: /Row 1, column 1, filled/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark row unfinished' })).toBeVisible();
    await expect(page.locator('#fiber-gauge-stitches')).toHaveValue('20');
    await expect(page.locator('#fiber-project-level')).toHaveValue('Intermediate');
    await expect(page.getByTestId('pattern-details-summary')).toContainText('amigurumi · shaping');

    await expect(page.locator('p.fiber-craft-status')).toContainText('Saved locally', { timeout: 3_000 });
    await page.reload();
    const restore = page.getByRole('button', { name: 'Restore last session' });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(page.getByLabel('Chart mode')).toHaveValue('grid');
    await expect(page.getByRole('button', { name: /Row 1, column 1, filled/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark row unfinished' })).toBeVisible();
    await expect(page.locator('#fiber-project-level')).toHaveValue('Intermediate');
  });

  test('edits, keys, saves, and restores a counted-thread chart', async ({ page }) => {
    await page.goto('./#/fiber-craft-workstation');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Counted-Thread Pattern Workbench');
    await page.getByLabel('Chart mode').selectOption('counted');
    await expect(page.getByTestId('counted-thread-grid')).toBeVisible();
    await page.locator('#fiber-counted-brand').fill('Project floss');
    await page.locator('#fiber-counted-code').fill('P-01');
    await page.getByRole('button', { name: 'Save floss identity' }).click();

    const first = page.getByRole('button', { name: 'Row 1, column 1, empty' });
    await first.click();
    await expect(page.getByRole('button', { name: /Row 1, column 1, Full cross, Primary/ })).toBeVisible();
    await expect(page.getByTestId('counted-thread-legend')).toContainText('Primary');
    await expect(page.getByTestId('counted-thread-legend')).toContainText('Project floss · P-01');
    await expect(page.getByTestId('counted-thread-legend')).toContainText('1 mark');

    await page.locator('#fiber-counted-color').selectOption('accent');
    await page.locator('#fiber-counted-tool').selectOption('quarter-ne');
    await page.getByRole('button', { name: 'Row 1, column 2, empty' }).click();
    await expect(page.getByTestId('counted-thread-legend')).toContainText('Accent');

    await page.locator('#fiber-counted-tool').selectOption('french-knot');
    await page.getByRole('button', { name: 'Row 2, column 2, empty' }).click();
    await expect(page.getByTestId('counted-thread-specialty-summary')).toContainText('1 French knot');

    await page.locator('#fiber-counted-tool').selectOption('backstitch');
    await page.getByRole('button', { name: 'Row 2, column 3, empty' }).click();
    await page.getByRole('button', { name: 'Row 3, column 4, empty' }).click();
    await expect(page.getByTestId('counted-thread-specialty-summary')).toContainText('1 backstitch line');
    const overlay = page.getByTestId('counted-thread-overlay');
    await expect(overlay.locator('circle')).toHaveCount(1);
    await expect(overlay.locator('line')).toHaveCount(1);
    await expect(page.getByTestId('chart-description')).toContainText('Counted-thread chart with 12 rows and 12 columns');

    const workedFirst = page.getByRole('button', { name: /Row 1, column 1, Full cross, Primary/ });
    await workedFirst.focus();
    await workedFirst.press('ArrowRight');
    await expect(page.getByRole('button', { name: /Row 1, column 2, Quarter stitch, northeast, Accent/ })).toBeFocused();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save .craftproj' }).click()]);
    const path = await download.path();
    expect(path).not.toBeNull();
    await page.getByLabel('Chart mode').selectOption('round');
    await expect(page.getByTestId('crochet-round-canvas')).toBeVisible();
    await page.getByLabel('Open project file').setInputFiles(path!);
    await expect(page.getByLabel('Chart mode')).toHaveValue('counted');
    await expect(page.getByRole('button', { name: /Row 1, column 1, Full cross, Primary/ })).toBeVisible();
    await expect(page.getByTestId('counted-thread-specialty-summary')).toContainText('1 French knot');
    await expect(page.getByTestId('counted-thread-specialty-summary')).toContainText('1 backstitch line');
    await page.getByText('Import image to counted chart', { exact: true }).click();
    const pngBytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
      const context = canvas.getContext('2d')!; context.fillStyle = '#d22f27'; context.fillRect(0, 0, 1, 2); context.fillStyle = '#2459c4'; context.fillRect(1, 0, 1, 2);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG fixture encoding failed.')), 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const png = Buffer.from(pngBytes);
    await page.getByLabel('Import image').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
    await page.getByLabel('Chart rows').fill('3');
    await page.getByLabel('Chart columns').fill('4');
    await page.getByLabel('Color limit').fill('1');
    await page.getByLabel('Dither colors').check();
    await page.getByRole('button', { name: 'Generate counted chart' }).click();
    await expect(page.getByRole('grid', { name: 'Counted-thread grid, 3 rows by 4 columns' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Full cross, Image color 1/ })).toHaveCount(12);
    await expect(page.getByTestId('counted-thread-legend')).toContainText('Image color 1');
  });

  test('reopens the Fiber workspace while offline after the PWA is installed', async ({ page, context }) => {
    await page.goto('./#/fiber-craft-workstation');
    await expect(page.getByRole('heading', { name: 'Fiber Craft Workstation' })).toBeVisible();
    await expect(page.evaluate(() => 'serviceWorker' in navigator)).resolves.toBe(true);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) throw new Error('Service worker did not activate.');
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Fiber Craft Workstation' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save .craftproj' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export PNG' })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
