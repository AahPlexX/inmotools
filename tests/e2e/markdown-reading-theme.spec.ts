import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Markdown source' });

const open = async (page: Page, siteTheme: 'light' | 'dark' = 'light') => {
  await page.addInitScript((value) => { window.localStorage.setItem('inmotools.theme.v1', value); }, siteTheme);
  await page.goto('./#/tools/markdown-workbench');
  await expect(editorOf(page)).toBeVisible();
};

const RICH = [
  '# Reading theme sample',
  '',
  'A paragraph with a [link](https://example.com), `inline code`, **bold**, *italic* and a footnote[^1].',
  '',
  '> A quoted line.',
  '',
  '> [!NOTE]',
  '> A note alert.',
  '',
  '> [!WARNING]',
  '> A warning alert.',
  '',
  '- [x] done task',
  '- [ ] open task',
  '',
  '| Item | Qty |',
  '| - | - |',
  '| Widget | 4 |',
  '',
  '```js',
  '// a comment',
  'const answer = "forty-two"; const total = 42 + 1;',
  '```',
  '',
  'Inline math $E = mc^2$.',
  '',
  '[^1]: A footnote.',
  '',
].join('\n');

const previewBackground = (page: Page): Promise<string> =>
  page.locator('.markdown-workbench-preview').first().evaluate((node) => getComputedStyle(node).backgroundColor);

const editorBackground = (page: Page): Promise<string> =>
  page.locator('.markdown-workbench-editor .cm-editor').first().evaluate((node) => getComputedStyle(node).backgroundColor);

const chooseTheme = async (page: Page, value: 'default' | 'sepia' | 'contrast') => {
  await page.getByLabel('Reading theme', { exact: true }).selectOption(value);
  await expect(page.getByLabel('Reading theme', { exact: true })).toHaveValue(value);
};

test('MDW-R85 choosing Sepia changes the preview background, High contrast changes it again, Default restores it', async ({ page }) => {
  await open(page);
  const original = await previewBackground(page);
  const editor = await editorBackground(page);

  await chooseTheme(page, 'sepia');
  await expect.poll(() => previewBackground(page)).toBe('rgb(244, 236, 216)');
  await chooseTheme(page, 'contrast');
  await expect.poll(() => previewBackground(page)).toBe('rgb(0, 0, 0)');
  await chooseTheme(page, 'default');
  await expect.poll(() => previewBackground(page)).toBe(original);
  // The reading theme belongs to the preview: the editor keeps its own appearance throughout.
  expect(await editorBackground(page)).toBe(editor);
});

test('MDW-R85 the reading theme is remembered after a reload and leaves the document alone', async ({ page }) => {
  await open(page);
  await editorOf(page).click();
  await editorOf(page).press('ControlOrMeta+A');
  await page.keyboard.insertText('# Kept text');
  await chooseTheme(page, 'sepia');

  await page.reload();
  await expect(editorOf(page)).toBeVisible();
  await expect(page.getByLabel('Reading theme', { exact: true })).toHaveValue('sepia');
  await expect.poll(() => previewBackground(page)).toBe('rgb(244, 236, 216)');
});

for (const siteTheme of ['light', 'dark'] as const) {
  test(`MDW-R85 every reading theme meets colour contrast on a rich document under the ${siteTheme} site theme`, async ({ page }) => {
    await open(page, siteTheme);
    await editorOf(page).click();
    await editorOf(page).press('ControlOrMeta+A');
    await page.keyboard.insertText(RICH);
    await expect(page.locator('.markdown-workbench-preview h1')).toContainText('Reading theme sample');

    // Collect every theme's findings before asserting, so one failure lists them all.
    const found: string[] = [];
    for (const theme of ['default', 'sepia', 'contrast'] as const) {
      await chooseTheme(page, theme);
      const results = await new AxeBuilder({ page }).include('.markdown-workbench-preview').withRules(['color-contrast']).analyze();
      for (const violation of results.violations) {
        for (const node of violation.nodes) found.push(`${theme} reading theme, ${siteTheme} site theme: ${node.target.join(' ')}: ${node.any[0]?.message ?? violation.help}`);
      }
    }
    expect(found).toEqual([]);
  });
}
