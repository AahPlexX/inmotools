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
      // Univer's canvas grid is reached through the workspace formula bar and
      // sheet tabs; its internal chrome is excluded the same way CodeMirror is.
      .exclude('.tsw-univer-host')
      // Script-disabled sandboxed previews (Web Layout Studio renders the
      // user's own layout in sandbox="" iframes) can never answer axe's frame
      // messaging, so every rule waits on them and the scan overruns the test
      // timeout. Their content is user-authored; the frames' own accessible
      // names are asserted directly below instead.
      .exclude('iframe[sandbox=""]')
      .analyze();
    for (const title of await page.locator('iframe[sandbox=""]').evaluateAll((frames) => frames.map((frame) => frame.getAttribute('title') ?? ''))) {
      expect(title.trim(), 'sandboxed preview iframe needs a title').not.toBe('');
    }
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
