import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const source = 'H~2~O and x^2^; ~~old~~.\n\nP~a\\ cat~; x^&amp;^; x^<img>^.\n\nEscaped H\\~2\\~O and x\\^2\\^.\n\n`H~2~O x^2^`\n\n$x^2$';

async function openSource(page: import('@playwright/test').Page, text: string) {
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  return editor;
}

test('MDW-R33 scripts preserve literal boundaries and readable bounds through orientation changes and formatting', async ({ page }) => {
  const editor = await openSource(page, source);
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview.locator('sub')).toHaveText(['2', 'a cat']);
  await expect(preview.locator('sup')).toHaveText(['2', '&', '<img>']);
  await expect(preview.locator('del')).toHaveText('old');
  await expect(preview.locator('img')).toHaveCount(0);
  await expect(preview.locator('code')).toHaveText('H~2~O x^2^');
  await expect(preview).toContainText('Escaped H~2~O and x^2^.');
  await expect(preview.locator('.katex').first()).toBeVisible();
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(preview.locator('sub')).toHaveText(['2', 'a cat']);
    const metrics = await preview.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: node.clientWidth, scroll: node.scrollWidth };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(viewport.width);
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
  }
  await page.getByRole('button', { name: 'Auto-format', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Markdown formatted.');
  await expect(preview.locator('sub')).toHaveText(['2', 'a cat']);
  await expect(preview.locator('sup')).toHaveText(['2', '&', '<img>']);
  await expect(editor).toContainText('H~2~O');
  await page.getByRole('button', { name: 'Markdown help · Syntax guide', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('H~2~O');
  await expect(page.getByRole('dialog')).toContainText('x^2^');
});

test('MDW-R33 actual HTML, EPUB, DOCX, AST and clipboard exports retain script semantics', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openSource(page, 'H~2~O and x^2^');
  const downloadBytes = async (label: string) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const html = (await downloadBytes('Standalone HTML')).toString('utf8');
  const exported = await context.newPage();
  await exported.setViewportSize({ width: 320, height: 568 });
  await exported.setContent(html);
  await expect(exported.locator('sub')).toHaveText('2');
  await expect(exported.locator('sup')).toHaveText('2');
  await exported.close();
  const epub = await JSZip.loadAsync(await downloadBytes('EPUB (structural)'));
  const chapter = await epub.file('OEBPS/chapter1.xhtml')!.async('string');
  expect(chapter).toMatch(/<sub\b[^>]*>2<\/sub>/);
  expect(chapter).toMatch(/<sup\b[^>]*>2<\/sup>/);
  const docx = await JSZip.loadAsync(await downloadBytes('DOCX'));
  const document = await docx.file('word/document.xml')!.async('string');
  expect(document).toContain('w:val="subscript"');
  expect(document).toContain('w:val="superscript"');
  const ast = JSON.parse((await downloadBytes('AST JSON')).toString('utf8'));
  expect(JSON.stringify(ast)).toContain('"type":"subscript"');
  expect(JSON.stringify(ast)).toContain('"type":"superscript"');
  await page.getByRole('button', { name: 'Copy HTML', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Copied the rendered HTML');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(/<sub\b[^>]*>2<\/sub>/);
  expect(clipboard).toMatch(/<sup\b[^>]*>2<\/sup>/);
});
