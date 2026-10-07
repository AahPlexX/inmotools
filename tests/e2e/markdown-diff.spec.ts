import { expect, test, type Page } from '@playwright/test';

const load = async (page: Page, source: string) => page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'compare.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
const summary = (page: Page) => page.getByTestId('markdown-diff-summary');
const baseline = (page: Page) => page.getByLabel('Compare current text with');

test('MDW-R57 an edited line shows as changed against the opened file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/tools/markdown-workbench');
  await load(page, 'one\n\ntwo\n\nthree\n');
  await page.getByText('Compare changes', { exact: true }).click();
  await expect(baseline(page)).toHaveValue('opened-file');
  await expect(summary(page)).toHaveText('No differences.');
  await expect(page.locator('.cm-changedLine')).toHaveCount(0);

  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+Home');
  await editor.press('ArrowDown');
  await editor.press('ArrowDown');
  await editor.press('Shift+End');
  await page.keyboard.insertText('TWO');

  await expect(summary(page)).toContainText('1 change: 1 line added or changed, 1 line removed or replaced.');
  const diff = page.getByTestId('markdown-diff-view');
  await expect(diff.locator('.cm-changedLine')).toContainText('TWO');
  await expect(diff.locator('.cm-deletedChunk')).toContainText('two');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('MDW-R57 compares the current text with a saved draft and updates as the text changes', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await load(page, 'alpha\n\nbeta\n');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('markdown-save-state')).toContainText(/Saved/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByText('Compare changes', { exact: true }).click();
  await expect(page.getByText('Choose what to compare with.')).toBeVisible();
  await baseline(page).selectOption({ index: 1 });
  await expect(summary(page)).toContainText(/\d+ changes?:/);
  await expect(page.getByTestId('markdown-diff-view').locator('.cm-deletedChunk')).toContainText('alpha');

  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.insertText('alpha\n\nbeta\n');
  await expect(summary(page)).toHaveText('No differences.');
});
