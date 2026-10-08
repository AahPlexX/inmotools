import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Markdown source' });

// The site header's theme choice is stored under this key; the accessibility spec uses the same one.
const openWithSiteTheme = async (page: Page, theme: 'light' | 'dark') => {
  await page.addInitScript((value) => { window.localStorage.setItem('inmotools.theme.v1', value); }, theme);
  await page.goto('./#/tools/markdown-workbench');
  await expect(editorOf(page)).toBeVisible();
};

const luminance = (rgb: string): number => {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map((part) => {
    const channel = Number(part) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

// The first opaque background at or above the element, which is what the reader sees behind it.
const surfaceLuminance = (page: Page, selector: string): Promise<number> =>
  page.evaluate((target) => {
    for (let node = document.querySelector(target); node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      const match = color.match(/[\d.]+/g);
      if (match && (match.length < 4 || Number(match[3]) > 0.99)) return color;
    }
    return 'rgb(255, 255, 255)';
  }, selector).then(luminance);

const SURFACES = ['.markdown-workbench-toolbar', '.markdown-workbench-preview', '.markdown-workbench-editor .cm-editor'];

test('MDW-R83 the workspace follows the site theme: dark surfaces in dark, light surfaces in light', async ({ page }) => {
  await openWithSiteTheme(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const selector of SURFACES) expect(await surfaceLuminance(page, selector), `${selector} in dark`).toBeLessThan(0.1);

  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const selector of SURFACES) expect(await surfaceLuminance(page, selector), `${selector} in light`).toBeGreaterThan(0.6);

  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const selector of SURFACES) expect(await surfaceLuminance(page, selector), `${selector} back in dark`).toBeLessThan(0.1);
});

for (const theme of ['dark', 'light'] as const) {
  test(`MDW-R83 the workspace has no colour-contrast violation under the ${theme} site theme in every view`, async ({ page }) => {
    await openWithSiteTheme(page, theme);
    const views = page.getByRole('group', { name: 'View and history' }).locator('button[aria-pressed]');
    const count = await views.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let index = 0; index < count; index += 1) {
      const button = views.nth(index);
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await page.locator('details').evaluateAll((nodes) => nodes.forEach((node) => { (node as HTMLDetailsElement).open = true; }));
      const results = await new AxeBuilder({ page })
        // CodeMirror marks its scroller tabindex="-1" by design; the accessibility spec excludes it the same way.
        .exclude('.cm-scroller')
        .withRules(['color-contrast'])
        .analyze();
      const found = results.violations.flatMap((violation) => violation.nodes.map((node) => `${node.target.join(' ')}: ${node.any[0]?.message ?? violation.help}`));
      expect(found, `${theme} theme, view button ${index + 1}`).toEqual([]);
    }
  });
}
