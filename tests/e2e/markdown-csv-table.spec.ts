import { expect, test, type Page } from '@playwright/test';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Markdown source' });
const openBuilder = async (page: Page) => {
  await page.getByRole('button', { name: 'Table builder', exact: true }).click();
  return page.getByRole('dialog', { name: 'Build a table' });
};

test('MDW-R72 pasted CSV becomes a pipe table and Copy as CSV returns the CSV', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/tools/markdown-workbench');
  const editor = editorOf(page);
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.insertText('Before');

  const csv = 'Name,Note\nAda,"likes, commas"\nBob,plain';
  let dialog = await openBuilder(page);
  await expect(dialog.getByRole('button', { name: 'Copy as CSV', exact: true })).toBeDisabled();
  await dialog.getByLabel('Paste CSV', { exact: true }).fill(csv);
  await dialog.getByRole('button', { name: 'Insert table from CSV', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(editor).toContainText('| Name | Note |');
  await expect(editor).toContainText('| Ada | likes, commas |');
  const table = page.locator('.markdown-workbench-preview table');
  await expect(table.locator('thead th')).toHaveCount(2);
  await expect(table.locator('tbody tr')).toHaveCount(2);

  dialog = await openBuilder(page);
  await dialog.getByRole('button', { name: 'Copy as CSV', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Copied the table as CSV.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Name,Note\nAda,"likes, commas"\nBob,plain');
  await page.keyboard.press('Escape');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('MDW-R72 invalid CSV is explained and the cursor outside a table cannot copy', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = editorOf(page);
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.insertText('just text');
  const dialog = await openBuilder(page);
  await expect(dialog.getByRole('button', { name: 'Copy as CSV', exact: true })).toBeDisabled();
  await dialog.getByLabel('Paste CSV', { exact: true }).fill('a,"b');
  await dialog.getByRole('button', { name: 'Insert table from CSV', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('never closed');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width + 0.5).toBe(true);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveText('just text');
});
