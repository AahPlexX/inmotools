import { expect, test } from '@playwright/test';

test.describe('Fiber Craft Workstation', () => {
  test('opens the crochet shell, edits with undo/redo, and restores the local autosave', async ({ page }) => {
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
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(page.getByTestId('active-round-progress')).toHaveText('0 of 6 stitches worked');
    await expect(redo).toBeEnabled();

    await redo.click();
    await expect(page.getByTestId('active-round-progress')).toHaveText('1 of 6 stitches worked');
    await expect(page.getByRole('status')).toContainText('Saved locally', { timeout: 3_000 });

    await page.reload();
    const restore = page.getByRole('button', { name: 'Restore last session' });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(page.getByTestId('active-round-progress')).toHaveText('1 of 6 stitches worked');
  });
});
