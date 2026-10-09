import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const library = JSON.stringify([
  { id: 'alpha', type: 'book', title: 'Alpha specimen', author: [{ family: 'Alpha' }], issued: { 'date-parts': [[2026]] } },
  { id: 'beta', type: 'book', title: 'Beta specimen', author: [{ family: 'Beta' }], issued: { 'date-parts': [[2025]] } },
]);
async function setSource(page: Page, source: string) {
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click(); await editor.press('ControlOrMeta+a'); await page.keyboard.insertText(source);
}
async function start(page: Page, source: string) {
  await page.goto('./#/tools/markdown-workbench'); await setSource(page, source);
  await page.locator('details').filter({ hasText: /^Citations/ }).first().locator('summary').first().click();
  await page.getByLabel('Bibliography format').selectOption('json');
  await page.getByLabel('Bibliography source', { exact: true }).fill(library);
}
async function download(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  return readFile((await (await pending).path())!);
}

test('MDW-R95 literal email word and period brackets survive preview and every actual prepared export without fabricated references', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const source = 'Contact [name@alpha] today. [42@alpha] [𝒜@alpha] [word.@alpha]';
  await start(page, source);
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview).toContainText(source);
  await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(0);
  await expect(page.locator('summary').filter({ hasText: /^Citations/ })).toHaveText('Citations (0 preview keys)');
  for (const label of ['Markdown', 'Pandoc Markdown']) expect((await download(page, label)).toString()).toBe(source);
  for (const label of ['Rendered Markdown', 'Plain text', 'AST JSON']) expect((await download(page, label)).toString()).toContain('name@alpha');
  const rendered = await context.newPage();
  await rendered.setContent((await download(page, 'Standalone HTML')).toString());
  await expect(rendered.locator('body')).toContainText(source);
  await expect(rendered.getByRole('heading', { name: 'References', exact: true })).toHaveCount(0); await rendered.close();
  const docx = await JSZip.loadAsync(await download(page, 'DOCX'));
  const word = await docx.file('word/document.xml')!.async('string');
  const epub = await JSZip.loadAsync(await download(page, 'EPUB (structural)'));
  const chapter = await epub.file('OEBPS/chapter1.xhtml')!.async('string');
  for (const text of [word, chapter]) {
    for (const marker of ['[name@alpha]', '[42@alpha]', '[𝒜@alpha]', '[word.@alpha]']) expect(text).toContain(marker);
    expect(text).not.toContain('Alpha specimen');
  }
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('MDW-R95 valid compound markers authored hyphens suppression edits and Undo retain citation behavior', async ({ page }) => {
  await start(page, '[name-@alpha, p. 14; compare @beta, chap. 2]');
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview).toContainText('(name- Alpha, 2026, p. 14; compare Beta, 2025, Chapter 2)');
  await setSource(page, '[name -@alpha, p. 14]');
  await expect(preview).toContainText('(name 2026, p. 14)');
  await page.getByRole('button', { name: 'Undo document step', exact: true }).click();
  await expect(preview).toContainText('name- Alpha');
  for (const style of ['ieee', 'chicago-author-date', 'mla', 'apa']) {
    await page.getByLabel('Citation style').selectOption(style);
    await expect(preview).toContainText('name-'); await expect(preview).toContainText('14');
    await setSource(page, '[name@alpha; @beta] [*word*@alpha] [42@beta]');
    await expect(preview).toContainText('[name@alpha; @beta]'); await expect(preview).toContainText('[word@alpha]');
    await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(0);
    expect((await download(page, 'Rendered Markdown')).toString()).toContain('[name@alpha; @beta]');
    await page.getByRole('button', { name: 'Undo document step', exact: true }).click();
    await expect(preview).toContainText('name-'); await expect(preview).toContainText('14');
  }
  await setSource(page, '[name@alpha] [@beta] [name@alpha; @beta] [@alpha, p. 14]');
  await expect(preview).toContainText('[name@alpha] (Beta, 2025) [name@alpha; @beta] (Alpha, 2026, p. 14)');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(0);
});

test('MDW-R95 long literal words and formatting boundaries wrap across phone orientations tablet and desktop', async ({ page }) => {
  const name = 'longemail'.repeat(60);
  await start(page, `[${name}@alpha]\n\n[*word*@alpha] [**word**@alpha]\n\n[\\-@alpha]`);
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview).toContainText(`[${name}@alpha]`);
  await expect(preview).toContainText('[word@alpha]');
  const notice = page.getByRole('status').filter({ hasText: 'Complex citation syntax kept as written:' });
  await expect(notice).toContainText('\\-@alpha');
  await expect(page.locator('summary').filter({ hasText: /^Citations/ })).toHaveText('Citations (1 preview key)');
  expect((await download(page, 'Rendered Markdown')).toString()).toContain(`[${name}@alpha]`);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport);
    const bounds = await preview.evaluate(node => {
      const box = node.getBoundingClientRect();
      const paragraphs = [...node.querySelectorAll('p')].map(p => { const r = p.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      return { left: box.left, right: box.right, overflow: node.scrollWidth - node.clientWidth, pageOverflow: document.documentElement.scrollWidth - innerWidth, paragraphs };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.overflow).toBeLessThanOrEqual(1); expect(bounds.pageOverflow).toBeLessThanOrEqual(1);
    for (let i = 1; i < bounds.paragraphs.length; i++) expect(bounds.paragraphs[i].top - bounds.paragraphs[i - 1].bottom).toBeGreaterThanOrEqual(0);
  }
});
