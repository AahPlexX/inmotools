import { expect, test } from '@playwright/test';

// Browser contract for CAD Studio's current workspace: primitives are added, the
// worker kernel tessellates them, parameters and suppression rebuild the model, and
// undo/redo restore earlier states. Sketch-to-export workflows are not in the UI yet.

const KERNEL_TIMEOUT = 60_000;

test.beforeEach(async ({ page }) => {
  await page.goto('./#/tools/cad-studio');
  await expect(page.getByTestId('cad-workspace')).toBeVisible();
});

test('starts empty, then tessellates an added box and cylinder in the worker kernel', async ({ page }) => {
  const canvas = page.getByTestId('cad-viewport-canvas-host');
  await expect(canvas).toHaveAttribute('aria-label', /no bodies/);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  await page.getByRole('button', { name: 'Add box' }).click();
  await expect(canvas).toHaveAttribute('aria-label', 'CAD viewport showing 1 tessellated body', { timeout: KERNEL_TIMEOUT });

  await page.getByLabel('Primitive').selectOption('cylinder');
  await page.getByRole('button', { name: 'Add cylinder' }).click();
  await expect(canvas).toHaveAttribute('aria-label', 'CAD viewport showing 2 tessellated bodies', { timeout: KERNEL_TIMEOUT });
  await expect(page.getByRole('tree', { name: 'Feature tree' }).getByRole('treeitem')).toHaveCount(4);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('suppressing a feature removes its body, and undo and redo restore each state', async ({ page }) => {
  const canvas = page.getByTestId('cad-viewport-canvas-host');
  await page.getByRole('button', { name: 'Add box' }).click();
  await page.getByRole('button', { name: 'Add box' }).click();
  await expect(canvas).toHaveAttribute('aria-label', 'CAD viewport showing 2 tessellated bodies', { timeout: KERNEL_TIMEOUT });

  await page.getByRole('tree', { name: 'Feature tree' }).getByRole('checkbox', { name: 'Suppressed' }).first().check();
  await expect(canvas).toHaveAttribute('aria-label', 'CAD viewport showing 1 tessellated body', { timeout: KERNEL_TIMEOUT });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(canvas).toHaveAttribute('aria-label', 'CAD viewport showing 2 tessellated bodies', { timeout: KERNEL_TIMEOUT });
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(canvas).toHaveAttribute('aria-label', 'CAD viewport showing 1 tessellated body', { timeout: KERNEL_TIMEOUT });
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
});
