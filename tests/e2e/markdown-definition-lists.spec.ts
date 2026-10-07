import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

async function openSource(page: import('@playwright/test').Page, source: string) {
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  return editor;
}

test('MDW-R35 definition lists retain formatting, table rows and readable bounds through orientation changes', async ({ page }) => {
  const term = 'LongTerm'.repeat(12);
  const explanation = 'definition'.repeat(35);
  const editor = await openSource(page, term + '\n: A **' + explanation + '** with H~2~O.\n\nhead\n| - |\nrow1\n: row2\n\nSecond\n: Another meaning.');
  const preview = page.locator('.markdown-workbench-preview');
  const list = preview.locator('.markdown-definition-list').first();
  await expect(list.locator('dt')).toHaveText(term);
  await expect(list.locator('dd strong')).toHaveText(explanation);
  await expect(list.locator('sub')).toHaveText('2');
  await expect(preview.locator('table td')).toHaveText(['row1', ': row2']);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const metrics = await list.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      const term = node.querySelector('dt')!.getBoundingClientRect();
      const definition = node.querySelector('dd')!.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: node.clientWidth, scroll: node.scrollWidth, gap: definition.top - term.bottom };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(viewport.width);
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
    expect(metrics.gap).toBeGreaterThanOrEqual(0);
  }
  await page.getByRole('button', { name: 'Auto-format', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Markdown formatted.');
  await expect(list.locator('dt')).toHaveText(term);
  await expect(list.locator('dd strong')).toHaveText(explanation);
  await expect(preview.locator('table td')).toHaveText(['row1', ': row2']);
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText('| - |');
  await page.getByRole('button', { name: 'Markdown help · Syntax guide', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Definition lists');
});

test('MDW-R35 actual HTML, EPUB, DOCX and AST exports retain terms and definitions', async ({ page, context }) => {
  await openSource(page, 'Apple\n: A **fruit**.');
  const download = async (label: string) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const html = (await download('Standalone HTML')).toString('utf8');
  const exported = await context.newPage();
  await exported.setViewportSize({ width: 320, height: 568 });
  await exported.setContent(html);
  await expect(exported.locator('dt')).toHaveText('Apple');
  await expect(exported.locator('dd strong')).toHaveText('fruit');
  expect(await exported.locator('dt').evaluate((node) => Number(getComputedStyle(node).fontWeight))).toBeGreaterThanOrEqual(600);
  await exported.close();
  const epub = await JSZip.loadAsync(await download('EPUB (structural)'));
  expect(await epub.file('OEBPS/chapter1.xhtml')!.async('string')).toMatch(/<dt\b[^>]*>Apple<\/dt>/);
  expect(await epub.file('OEBPS/styles/markdown.css')!.async('string')).toContain('.markdown-definition-list');
  const docx = await JSZip.loadAsync(await download('DOCX'));
  const document = await docx.file('word/document.xml')!.async('string');
  expect(document).toContain('Apple');
  expect(document).toContain('fruit');
  expect(document).not.toContain(': A');
  const ast = JSON.parse((await download('AST JSON')).toString('utf8'));
  expect(JSON.stringify(ast)).toContain('"type":"defList"');
});

test('MDW-R35 worker formatting preserves nested definition tables and list containers with Undo', async ({ page }) => {
  const source = '* outside\n\nTerm\n\n:   head\n    | - |\n    row1\n    : row2\n\n- Nested term\n\n  :   Meaning with H~2~O.\n\n* after';
  const editor = await openSource(page, source);
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview.locator('.markdown-definition-list')).toHaveCount(2);
  await expect(preview.locator('table td')).toHaveText(['row1', ': row2']);
  await page.getByRole('button', { name: 'Auto-format', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Markdown formatted.');
  await expect(editor).toContainText('- outside');
  await expect(editor).toContainText('    : row2');
  await expect(preview.locator('.markdown-definition-list')).toHaveCount(2);
  await expect(preview.locator('table td')).toHaveText(['row1', ': row2']);
  await expect(preview.locator('sub')).toHaveText('2');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText('* outside');
  await expect(preview.locator('table td')).toHaveText(['row1', ': row2']);
});

test('MDW-R35 local HTML import preserves definition terms and nested definition blocks', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await page.setInputFiles('input[type="file"][accept*=".html"]', {
    name: 'definitions.html', mimeType: 'text/html',
    buffer: Buffer.from('<dl><dt>Term</dt><dd>A <strong>definition</strong>.</dd><dt>Next</dt><dd><p>First paragraph.</p><p>Next paragraph.</p><ul><li>Item</li></ul></dd></dl>'),
  });
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toContainText(':');
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview.locator('dt')).toHaveText(['Term', 'Next']);
  await expect(preview.locator('dd strong')).toHaveText('definition');
  await expect(preview.locator('dd li')).toHaveText('Item');
  await expect(preview.locator('dd').last()).toContainText('Next paragraph.');
});
