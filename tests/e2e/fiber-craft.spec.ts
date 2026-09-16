import { expect, test } from '@playwright/test';

test.describe('Fiber Craft Workstation', () => {
  test('edits round and grid crochet patterns and restores the local project', async ({ page }) => {
    await page.goto('./#/fiber-craft-workstation');

    await expect(page.getByRole('heading', { name: 'Fiber Craft Workstation' })).toBeVisible();
    await expect(page.getByTestId('active-round-progress')).toHaveText('0 of 6 stitches worked');

    const undo = page.getByRole('button', { name: 'Undo' });
    const redo = page.getByRole('button', { name: 'Redo' });
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();

    await page.getByLabel('Stitch symbol').selectOption('sc-dc');
    await page.getByRole('button', { name: 'Place next stitch' }).click();
    await expect(page.getByTestId('active-round-progress')).toHaveText('1 of 6 stitches worked');
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
    await expect(page.getByLabel('Row 1')).toBeFocused();
    await page.getByRole('button', { name: 'Mark row complete' }).click();
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
