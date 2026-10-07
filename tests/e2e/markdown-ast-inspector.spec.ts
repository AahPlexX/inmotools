import { expect, test, type Page } from '@playwright/test';

const load = async (page: Page, source: string) => page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'tree.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
const tree = (page: Page) => page.getByRole('tree', { name: 'Markdown syntax tree' });
const highlighted = (page: Page) => page.locator('.cm-ast-highlight');

test('MDW-R56 keyboard tree selection highlights the node source range and follows edits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/tools/markdown-workbench');
  await load(page, '# Title\n\nHello *world*.\n\nSecond paragraph.\n');
  await page.getByText('Syntax tree', { exact: true }).click();
  await expect(tree(page)).toBeVisible();
  await expect(tree(page).getByRole('treeitem')).toHaveCount(4);
  await expect(tree(page).getByRole('treeitem').first()).toHaveAttribute('aria-expanded', 'true');

  await tree(page).focus();

  await page.keyboard.press('ArrowDown');
  await expect(tree(page).locator('[aria-selected="true"]')).toHaveAttribute('data-ast-type', 'heading');
  await expect(highlighted(page)).toHaveText('# Title');

  await page.keyboard.press('ArrowDown');
  await expect(highlighted(page)).toHaveText('Hello *world*.');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(tree(page).locator('[aria-selected="true"]')).toHaveAttribute('data-ast-type', 'emphasis');
  await expect(highlighted(page)).toHaveText('*world*');
  await expect(page.getByTestId('markdown-ast-summary')).toContainText('Selected source range 3:7–3:14');

  await page.keyboard.press('ArrowLeft');
  await expect(tree(page).locator('[aria-selected="true"]')).toHaveAttribute('data-ast-type', 'paragraph');
  await page.keyboard.press('Home');
  await expect(tree(page).locator('[aria-selected="true"]')).toHaveAttribute('data-ast-type', 'root');

  await tree(page).locator('[data-ast-type="paragraph"]').last().click();
  await expect(highlighted(page)).toHaveText('Second paragraph.');

  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText('\nThird paragraph.');
  await expect(page.getByTestId('markdown-ast-summary')).toContainText(/rows shown/);
  await expect(tree(page).locator('[data-ast-type="paragraph"]')).toHaveCount(2);
  await expect(highlighted(page)).toHaveText(['Second paragraph.', 'Third paragraph.']);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('MDW-R56 large documents render a bounded window of tree rows', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await load(page, Array.from({ length: 3000 }, (_, index) => `Paragraph ${index}`).join('\n\n'));
  await page.getByText('Syntax tree', { exact: true }).click();
  await tree(page).focus();
  await expect(page.getByTestId('markdown-ast-summary')).toContainText('3001 rows shown');
  expect(await tree(page).getByRole('treeitem').count()).toBeLessThan(60);
  await page.keyboard.press('End');
  await expect(highlighted(page)).toHaveText('Paragraph 2999');
  await expect(tree(page).locator('[aria-selected="true"]')).toBeVisible();
});
