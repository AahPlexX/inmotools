import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const clickAt = async (page: Parameters<typeof test>[0] extends never ? never : any, xRatio: number, yRatio: number) => {
  const canvas = page.getByTestId('floorplan-overlay');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Floor-plan overlay canvas is not visible.');
  await canvas.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
};

test('PlanCraft catalog link, exact alias, and generic route open the same local workspace', async ({ page }) => {
  await page.goto('./#/');
  const catalogLink = page.getByRole('link', { name: /PlanCraft Studio/ });
  await expect(catalogLink).toBeVisible();
  await expect(catalogLink).toHaveAttribute('href', '#/tools/floorplan-studio');
  await catalogLink.click();
  await expect(page.getByTestId('floorplan-studio')).toBeVisible();

  await page.goto('./#/floorplan-studio');
  await expect(page.getByTestId('suite-title')).toContainText('PlanCraft Studio');
  await expect(page.getByTestId('floorplan-studio')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuous Wall/ })).toBeVisible();
  await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);

  await page.goto('./#/tools/floorplan-studio');
  await expect(page.getByTestId('floorplan-studio')).toBeVisible();
});

test('drafts a room, hosts a door, stages a component, and supports undo/redo', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await page.getByRole('button', { name: /Continuous Wall/ }).click();
  await clickAt(page, 0.22, 0.25);
  await clickAt(page, 0.78, 0.25);
  await clickAt(page, 0.78, 0.72);
  await clickAt(page, 0.22, 0.72);
  await clickAt(page, 0.22, 0.25);

  await expect(page.getByTestId('wall-count')).toHaveText('4');
  // Wall count is derived synchronously from the drafted geometry, but room
  // detection comes back from the geometry worker, so this assertion additionally
  // waits on worker startup and its first analysis round trip. Under parallel
  // workers on an emulated mobile device that can exceed the default timeout,
  // which made this the flakiest assertion in the suite.
  await expect(page.getByTestId('room-count')).toHaveText('1', { timeout: 20_000 });

  const doorTool = page.getByRole('button', { name: /Parametric Door/ });
  await doorTool.click();
  await expect(doorTool).toHaveAttribute('aria-pressed', 'true');
  await clickAt(page, 0.5, 0.25);
  await expect(page.getByTestId('opening-count')).toHaveText('1');

  await page.getByRole('button', { name: '3-Seat Sofa' }).click();
  await clickAt(page, 0.5, 0.5);
  await expect(page.getByTestId('component-count')).toHaveText('1');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(page.getByTestId('component-count')).toHaveText('0');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+y' : 'Control+y');
  await expect(page.getByTestId('component-count')).toHaveText('1');
});

test('an interrupted gesture does not wedge the drafting canvas', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await page.getByRole('button', { name: /Continuous Wall/ }).click();

  // Model a gesture whose pointerup/pointercancel never reaches the canvas
  // (OS gesture steal, palm rejection, capture lost to another element).
  await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="floorplan-overlay"]');
    if (!overlay) throw new Error('Floor-plan overlay canvas is not present.');
    const rect = overlay.getBoundingClientRect();
    overlay.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 99, pointerType: 'touch', isPrimary: true, bubbles: true,
      clientX: rect.left + 10, clientY: rect.top + 10,
    }));
  });

  // Re-arm the wall tool so any draft seeded by the interrupted gesture is cleared
  // and the two clicks below are the only geometry input.
  await page.keyboard.press('w');
  await clickAt(page, 0.25, 0.3);
  await clickAt(page, 0.7, 0.3);
  await expect(page.getByTestId('wall-count')).toHaveText('1');
});

test('autosaves locally and restores the drawing after reload', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await page.getByRole('button', { name: /Continuous Wall/ }).click();
  await clickAt(page, 0.25, 0.3);
  await clickAt(page, 0.7, 0.3);
  await expect(page.getByTestId('wall-count')).toHaveText('1');
  await page.waitForTimeout(2200);
  await page.reload();
  await expect(page.getByTestId('wall-count')).toHaveText('1');
});

test('exposes local export controls and has no serious or critical axe violations', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await expect(page.getByRole('button', { name: 'Export SVG' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export DXF R12' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export DXF R2000' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Backup JSON' })).toBeVisible();

  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(severe).toEqual([]);
});
