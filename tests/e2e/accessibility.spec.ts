import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const route of ['./', './#/tools/fluid-type-matrix', './#/tools/regex-log-structurer']) {
  test(`has no serious or critical axe violations at ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
  });
}

test('keyboard focus remains visibly discoverable', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus-visible');
  await expect(focused).toBeVisible();
  const outline = await focused.evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(outline).not.toBe('none');
});
