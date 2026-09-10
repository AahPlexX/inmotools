import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const targetViewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

test('PlanCraft export inputs stay usable and truthful across target viewports', async ({ page }) => {
  await page.goto('./#/floorplan-studio');

  const drawingScale = page.getByLabel('Drawing scale');
  await expect(drawingScale).toBeVisible();
  await expect(drawingScale.locator('option')).toHaveCount(4);
  await drawingScale.selectOption('1:50');
  await expect(drawingScale).toHaveValue('1:50');

  const layerStack = page.getByText('Layer stack', { exact: true });
  await expect(layerStack).toBeVisible();
  for (const layer of ['WALLS', 'DOORS', 'WINDOWS', 'FURNITURE', 'MEP', 'CLEARANCE', 'DIMENSIONS']) {
    await expect(page.getByLabel(layer, { exact: true })).toBeVisible();
  }

  const disclaimer = page.locator('.plancraft-disclaimer');
  await expect(disclaimer).toContainText(/planning aids/i);
  await expect(disclaimer).toContainText(/not code-compliance certification/i);

  for (const viewport of targetViewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();

    const narrowInteractionLayout = viewport.width <= 767 || (viewport.height <= 460 && viewport.width > viewport.height);
    if (narrowInteractionLayout) {
      const canvasBox = await page.getByTestId('floorplan-overlay').boundingBox();
      const controlsBox = await page.getByRole('group', { name: 'Viewport controls' }).boundingBox();
      expect(canvasBox, `${viewport.width}x${viewport.height} canvas box`).not.toBeNull();
      expect(controlsBox, `${viewport.width}x${viewport.height} controls box`).not.toBeNull();
      expect(
        controlsBox!.y,
        `${viewport.width}x${viewport.height} viewport controls must not cover the drafting canvas`,
      ).toBeGreaterThanOrEqual(canvasBox!.y + canvasBox!.height - 1);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.width}x${viewport.height} document overflow`).toBeLessThanOrEqual(1);
  }

  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});
