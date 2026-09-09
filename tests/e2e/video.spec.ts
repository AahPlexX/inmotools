import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('explains exact selected-track preview policy and reflows across target viewports', async ({ page }) => {
  await page.goto('./#/tools/video-keyframe-slicer');

  const policy = page.getByTestId('video-preview-policy');
  await expect(policy).toBeVisible();
  await expect(policy).toContainText(/source preview/i);
  await expect(policy).toContainText(/selected-track preview/i);

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#video-file')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.width}x${viewport.height} document overflow`).toBeLessThanOrEqual(1);
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
});
