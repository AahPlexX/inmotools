import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';

const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Markdown source' });

const openWith = async (page: Page, source: string) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = editorOf(page);
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await page.keyboard.insertText(source);
};

const openCitations = async (page: Page) => {
  const panel = page.locator('details').filter({ hasText: /^Citations/ }).first();
  if (await panel.evaluate((node) => (node as HTMLDetailsElement).open)) return;
  await panel.locator('summary').first().click();
  await expect(panel).toHaveAttribute('open', '');
};

const readDownload = async (download: Download): Promise<string> => readFile(await download.path(), 'utf8');

const BIB = '@article{smith2024,\n  author = {Smith, Alice},\n  title = {A Study of Pandoc},\n  journal = {Journal of Tests},\n  year = {2024}\n}\n';

const SOURCE = '# Heading one\n\nA claim [@smith2024, p. 3].\n\n## Heading two\n\nA second claim [@ghost2000].\n';

test('MDW-R82 Pandoc Markdown embeds the cited sources as YAML references and keeps the body as written', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWith(page, SOURCE);
  await openCitations(page);
  await page.setInputFiles('input[aria-label="Load a local bibliography file"]', { name: 'library.bib', mimeType: 'text/plain', buffer: Buffer.from(BIB) });
  await expect(page.getByLabel('Bibliography source')).toHaveValue(/smith2024/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pandoc Markdown', exact: true }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.pandoc\.md$/);
  const text = await readDownload(download);
  expect(text.startsWith('---\nreferences:\n')).toBe(true);
  expect(text).toContain('id: smith2024');
  expect(text).toContain('title: A Study of Pandoc');
  expect(text).not.toContain('ghost2000\n  type');
  expect(text.endsWith(`---\n\n${SOURCE}`)).toBe(true);
  await expect(page.getByTestId('markdown-status')).toContainText('1 cited source embedded');
  await expect(page.getByTestId('markdown-status')).toContainText('ghost2000');
  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
});

test('MDW-R82 Pandoc Markdown without a bibliography leaves the document as written and says so', async ({ page }) => {
  await openWith(page, 'Cites [@smith2024].\n');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pandoc Markdown', exact: true }).click();
  expect(await readDownload(await downloadPromise)).toBe('Cites [@smith2024].\n');
  await expect(page.getByTestId('markdown-status')).toContainText('No cited source was found in your bibliography');
});
