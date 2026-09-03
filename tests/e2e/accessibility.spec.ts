import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { TOOLS } from '../../src/catalog';

// Driven from the catalog so a newly registered tool is audited without editing this file.
const routes = ['./', ...TOOLS.map((tool) => `./#/tools/${tool.slug}`)];

for (const route of routes) {
  test(`has no serious or critical axe violations at ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('main, [data-testid$="-studio"], .workspace-body').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      // CodeMirror owns .cm-scroller and marks it tabindex="-1" by design; the editor is
      // reached through its focusable contenteditable role="textbox" child, so keyboard
      // access exists and scrollable-region-focusable reports a false positive here.
      .exclude('.cm-scroller')
      .analyze();
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
