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
});
