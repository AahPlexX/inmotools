import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

async function replaceSource(page: import('@playwright/test').Page, source: string) {
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  return editor;
}

test('MDW-R34 abbreviation glossary is readable without hover through orientation changes and formatting', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const expansion = 'HyperText Markup Language with an exceptionally long explanation ' + 'unbroken'.repeat(40);
  await replaceSource(page, '*[HTML]: ' + expansion + '\n\nHTML html HTML5.\n\n`HTML`\n\n|A|B|\n|-|-|\n|one|two|');
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview.locator('abbr')).toHaveText('HTML');
  await expect(preview.locator('abbr')).toHaveAttribute('title', expansion);
  await expect(preview.locator('code')).toHaveText('HTML');
  const glossary = preview.locator('.markdown-abbreviation-glossary');
  const summary = glossary.locator('summary');
  await summary.focus();
  await summary.press('Enter');
  await expect(glossary.locator('dd')).toBeVisible();
  await expect(glossary.locator('dd')).toHaveText(expansion);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const metrics = await glossary.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      const label = node.querySelector('dt')!.getBoundingClientRect();
      const expansion = node.querySelector('dd')!.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: node.clientWidth, scroll: node.scrollWidth, gap: expansion.top - label.bottom, target: node.querySelector('summary')!.getBoundingClientRect().height };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(viewport.width);
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
    expect(metrics.gap).toBeGreaterThanOrEqual(0);
    expect(metrics.target).toBeGreaterThanOrEqual(44);
  }
  await summary.click();
  await expect(glossary.locator('dd')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(glossary.locator('dd')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Auto-format', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Markdown formatted.');
  await expect(preview.locator('abbr')).toHaveAttribute('title', expansion);
  await page.getByRole('button', { name: 'Markdown help · Syntax guide', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('*[HTML]: HyperText Markup Language');
});

test('MDW-R34 actual exports preserve semantic abbreviations, accessible expansions and readable DOCX', async ({ page, context }) => {
  await page.goto('./#/tools/markdown-workbench');
  await replaceSource(page, '*[HTML]: HyperText Markup Language\n\nHTML.');
  const download = async (label: string) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    return readFile((await (await pending).path())!);
  };
  const html = (await download('Standalone HTML')).toString('utf8');
  const exported = await context.newPage();
  await exported.setViewportSize({ width: 320, height: 568 });
  await exported.setContent(html);
  await expect(exported.locator('abbr')).toHaveAttribute('title', 'HyperText Markup Language');
  await exported.getByText('Abbreviations (1)', { exact: true }).click();
  await expect(exported.locator('dd')).toHaveText('HyperText Markup Language');
  expect(await exported.locator('summary').evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await exported.close();
  const epub = await JSZip.loadAsync(await download('EPUB (structural)'));
  expect(await epub.file('OEBPS/chapter1.xhtml')!.async('string')).toContain('<abbr title="HyperText Markup Language">HTML</abbr>');
  expect(await epub.file('OEBPS/styles/markdown.css')!.async('string')).toContain('.markdown-abbreviation-glossary');
  const docx = await JSZip.loadAsync(await download('DOCX'));
  const document = await docx.file('word/document.xml')!.async('string');
  expect(document).toContain('HTML');
  expect(document).not.toContain('*[HTML]');
  const ast = JSON.parse((await download('AST JSON')).toString('utf8'));
  expect(JSON.stringify(ast)).toContain('"type":"abbreviation"');
  expect(JSON.stringify(ast)).not.toContain('abbreviationDefinition');
});

test('MDW-R34 removing definitions or their uses clears the glossary and never leaks earlier definitions', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await replaceSource(page, '*[HTML]: Expansion\n\nHTML');
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview.locator('abbr')).toHaveCount(1);
  await replaceSource(page, '*[HTML]: Expansion\n\nNo matching label.');
  await expect(preview.locator('abbr')).toHaveCount(0);
  await expect(preview.locator('details')).toHaveCount(0);
  await replaceSource(page, 'HTML without a definition.');
  await expect(preview).toContainText('HTML without a definition.');
  await expect(preview.locator('abbr')).toHaveCount(0);
  await replaceSource(page, '*[HTML]: <img src=x> & "quoted"\n\nHTML');
  await expect(preview.locator('abbr')).toHaveAttribute('title', '<img src=x> & "quoted"');
  await expect(preview.locator('img')).toHaveCount(0);
  await preview.locator('summary').click();
  await expect(preview.locator('dd')).toHaveText('<img src=x> & "quoted"');
});
