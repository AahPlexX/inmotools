import { expect, test } from '@playwright/test';

test.describe('Fiber Craft Workstation', () => {
  test('edits crochet charts, moves a portable project, and restores the local session', async ({ page }) => {
    await page.goto('./#/fiber-craft-workstation');

    await expect(page.getByRole('heading', { name: 'Fiber Craft Workstation' })).toBeVisible();
    await expect(page.getByTestId('active-round-progress')).toHaveText('0 of 6 stitches worked');

    const undo = page.getByRole('button', { name: 'Undo' });
    const redo = page.getByRole('button', { name: 'Redo' });
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    await page.getByLabel('Stitch symbol', { exact: true }).selectOption('sc-dc');
    await page.getByRole('button', { name: 'Place next stitch' }).click();
    await expect(page.getByTestId('active-round-progress')).toHaveText('1 of 6 stitches worked');
    await expect(page.getByTestId('crochet-round-canvas')).toHaveAttribute('data-symbol-rendering', 'vector');
    await expect(page.getByTestId('crochet-round-canvas')).toHaveAttribute('data-rendered-symbols', '1');
    await expect(page.getByTestId('written-pattern')).toContainText('1 sc [Primary]');
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

    await page.getByLabel('Chart mode').selectOption('grid');
    const firstCell = page.getByRole('button', { name: 'Row 1, column 1, open' });
    await firstCell.click();
    await expect(page.getByTestId('c2c-summary')).toContainText('1 filled block');
    await expect(page.getByTestId('filet-summary')).toContainText('1 filled mesh');
    await page.getByText('C2C row-by-row counts', { exact: true }).click();
    await expect(page.getByTestId('c2c-row-counts')).toContainText('C2C row 1: 1 filled of 1 block.');
    await page.getByRole('button', { name: 'Center active row' }).click();
    await expect(page.getByLabel('Row 1', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Mark row complete' }).click();
    await expect(page.getByRole('button', { name: 'Mark row unfinished' })).toBeVisible();

    const [projectDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save .craftproj' }).click(),
    ]);
    expect(projectDownload.suggestedFilename()).toBe('untitled-pattern.craftproj');
    const projectPath = await projectDownload.path();
    expect(projectPath).not.toBeNull();

    await page.getByRole('button', { name: /Row 1, column 1, filled/ }).click();
    await page.getByRole('button', { name: 'Mark row unfinished' }).click();
    await expect(page.getByRole('button', { name: 'Row 1, column 1, open' })).toBeVisible();
    await page.getByLabel('Open project file').setInputFiles(projectPath!);
    await expect(page.locator('p.fiber-craft-status')).toContainText('Loaded untitled-pattern.craftproj');
    await expect(page.getByRole('button', { name: /Row 1, column 1, filled/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark row unfinished' })).toBeVisible();

    await expect(page.locator('p.fiber-craft-status')).toContainText('Saved locally', { timeout: 3_000 });
    await page.reload();
    const restore = page.getByRole('button', { name: 'Restore last session' });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(page.getByLabel('Chart mode')).toHaveValue('grid');
    await expect(page.getByRole('button', { name: /Row 1, column 1, filled/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark row unfinished' })).toBeVisible();
  });
});
