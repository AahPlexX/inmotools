import { expect, test, type Page } from '@playwright/test';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Markdown source' });
const replaceText = async (page: Page, text: string) => {
  const editor = editorOf(page);
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
};
const saveDraft = async (page: Page) => {
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('markdown-save-state')).toContainText(/Saved/, { timeout: 15_000 });
  await expect(page.getByTestId('markdown-save-state')).not.toContainText('Unsaved');
};

test('MDW-R69 the first saved version can be restored after a second save', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/tools/markdown-workbench');
  await page.getByText('Local drafts and storage', { exact: false }).click();
  await expect(page.getByText('No versions yet.')).toBeVisible();

  await replaceText(page, '# First version');
  await saveDraft(page);
  await replaceText(page, '# Second version');
  await saveDraft(page);

  const list = page.getByTestId('markdown-snapshot-list');
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list.locator('li').nth(0)).toContainText('# Second version');
  await expect(list.locator('li').nth(1)).toContainText('# First version');

  await list.locator('li').nth(1).getByRole('button', { name: /Restore/ }).click();
  await expect(editorOf(page)).toContainText('# First version');
  await expect(editorOf(page)).not.toContainText('Second version');
  await expect(page.getByTestId('markdown-status')).toContainText('Restored the version');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('MDW-R69 versions survive a reload, belong to their draft and a restore keeps the replaced text', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await replaceText(page, 'alpha one');
  await saveDraft(page);
  await replaceText(page, 'alpha two');
  await saveDraft(page);

  await page.reload();
  await page.getByText('Local drafts and storage', { exact: false }).click();
  await page.getByTestId('markdown-draft-list').getByRole('button').first().click();
  const list = page.getByTestId('markdown-snapshot-list');
  await expect(list.locator('li')).toHaveCount(2);

  await list.locator('li').nth(1).getByRole('button', { name: /Restore/ }).click();
  await expect(editorOf(page)).toContainText('alpha one');
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list.locator('li').nth(0)).toContainText('alpha two');

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(page.getByText('No versions yet.')).toBeVisible();
});
