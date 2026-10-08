import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Markdown source' });
const saveNamedDraft = async (page: Page, name: string, text: string) => {
  const editor = editorOf(page);
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
  await page.getByLabel('Document name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('markdown-save-state')).toContainText(/^Saved/, { timeout: 15_000 });
};

test('MDW-R71 three drafts export to a ZIP with three .md files and import back', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/tools/markdown-workbench');
  await saveNamedDraft(page, 'Alpha', '# Alpha body');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await saveNamedDraft(page, 'Beta', '# Beta body');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await saveNamedDraft(page, 'Gamma', '# Gamma body');

  await page.getByText('Local drafts and storage', { exact: false }).click();
  const list = page.getByTestId('markdown-draft-list');
  await expect(list.locator('li')).toHaveCount(3);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all drafts (ZIP)', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('markdown-drafts.zip');
  const path = testInfo.outputPath('drafts.zip');
  await file.saveAs(path);
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  expect(Object.keys(archive).sort()).toEqual(['Alpha.md', 'Beta.md', 'Gamma.md']);
  expect(Buffer.from(archive['Beta.md'] as Uint8Array).toString('utf8')).toBe('# Beta body');

  for (let remaining = 3; remaining > 0; remaining -= 1) {
    await list.getByRole('button', { name: /^Delete draft/ }).first().click();
    await expect(list.locator('li')).toHaveCount(remaining - 1);
  }
  await expect(page.getByText('No local drafts saved yet.')).toBeVisible();

  await page.getByLabel('Import drafts from a ZIP file').setInputFiles(path);
  await expect(page.getByTestId('markdown-status')).toContainText('Imported 3 drafts');
  await expect(list.locator('li')).toHaveCount(3);
  for (const name of ['Alpha', 'Beta', 'Gamma']) await expect(list).toContainText(name);

  // The same archive again adds nothing.
  await page.getByLabel('Import drafts from a ZIP file').setInputFiles(path);
  await expect(page.getByTestId('markdown-status')).toContainText('Imported 0 drafts from drafts.zip. 3 already saved');
  await expect(list.locator('li')).toHaveCount(3);

  // An imported draft opens with its text.
  await list.getByRole('button', { name: /^Beta/ }).click();
  await expect(editorOf(page)).toContainText('# Beta body');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('MDW-R71 a file that is not a ZIP is refused and the export reports when there is nothing to export', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await page.getByText('Local drafts and storage', { exact: false }).click();
  await page.getByRole('button', { name: 'Export all drafts (ZIP)', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('no local drafts to export');
  await page.getByLabel('Import drafts from a ZIP file').setInputFiles({ name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  await expect(page.getByTestId('markdown-status')).toContainText('not a readable ZIP');
  await expect(page.getByText('No local drafts saved yet.')).toBeVisible();
});
