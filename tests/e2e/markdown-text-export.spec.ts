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

const readDownload = async (download: Download): Promise<string> => readFile(await download.path(), 'utf8');

const SOURCE = [
  '---',
  'title: Hidden title',
  '---',
  '',
  '# Plain heading',
  '',
  'Some **bold** and *italic* text with a [link](https://example.com/page).',
  '',
  '- first item',
  '- second item',
  '',
  '| Item | Qty |',
  '| - | - |',
  '| Widget | 4 |',
].join('\n');

test('MDW-R81 Export TXT downloads the text without Markdown marks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWith(page, SOURCE);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.txt$/);
  const text = await readDownload(download);
  expect(text).toBe([
    'Plain heading',
    '',
    'Some bold and italic text with a link (https://example.com/page).',
    '',
    '• first item',
    '• second item',
    '',
    'Item\tQty',
    'Widget\t4',
    '',
  ].join('\n'));
  for (const mark of ['**', '# ', '](', '| ', 'title: Hidden']) expect(text).not.toContain(mark);
  await expect(page.getByTestId('markdown-status')).toContainText(/Exported .*\.txt/);
  expect(errors).toEqual([]);
});

test('MDW-R81 Export TXT follows later edits and leaves the Markdown export as typed', async ({ page }) => {
  await openWith(page, '# One\n\nFirst **line**.');

  let downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  expect(await readDownload(await downloadPromise)).toBe('One\n\nFirst line.\n');

  await editorOf(page).press('ControlOrMeta+A');
  await page.keyboard.insertText('# Two\n\nSecond `code` _line_.');
  downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  expect(await readDownload(await downloadPromise)).toBe('Two\n\nSecond code line.\n');

  downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const markdown = await downloadPromise;
  expect(markdown.suggestedFilename()).toMatch(/\.md$/);
  expect(await readDownload(markdown)).toBe('# Two\n\nSecond `code` _line_.');
});
