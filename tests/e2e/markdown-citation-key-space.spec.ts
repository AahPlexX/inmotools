import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import YAML from 'yaml';

const entry = (id: string, family = 'KeyAuthor') => ({ id, type: 'book', title: `${family} specimen`, author: [{ family }], issued: { 'date-parts': [[2026]] } });
async function setSource(page: Page, source: string) {
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click(); await editor.press('ControlOrMeta+a'); await page.keyboard.insertText(source);
}
async function start(page: Page, source: string, library: ReturnType<typeof entry>[]) {
  await page.goto('./#/tools/markdown-workbench'); await setSource(page, source);
  await page.locator('details').filter({ hasText: /^Citations/ }).first().locator('summary').first().click();
  await page.getByLabel('Bibliography format').selectOption('json');
  await page.getByLabel('Bibliography source', { exact: true }).fill(JSON.stringify(library));
}
async function download(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  return readFile((await (await pending).path())!);
}

test('MDW-R96 invalid braced spaces stay literal in preview and all actual downloads without false references', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const ids = ['alpha beta', 'alpha\tbeta', 'alpha\u00A0beta'];
  const source = ids.map(id => `Claim [@{${id}}].`).join('\n\n');
  await start(page, source, ids.map(id => entry(id)));
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview).toContainText('Claim [@{alpha beta}].');
  await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(0);
  await expect(page.locator('summary').filter({ hasText: /^Citations/ })).toHaveText('Citations (0 preview keys)');
  for (const label of ['Markdown', 'Pandoc Markdown', 'Rendered Markdown']) expect((await download(page, label)).toString()).toBe(source);
  for (const label of ['Plain text', 'AST JSON']) {
    const text = (await download(page, label)).toString();
    expect(text).toContain('[@{alpha beta}]'); expect(text).not.toContain('KeyAuthor specimen');
  }
  const htmlPage = await context.newPage();
  await htmlPage.setContent((await download(page, 'Standalone HTML')).toString());
  await expect(htmlPage.locator('body')).toContainText('[@{alpha beta}]');
  await expect(htmlPage.getByRole('heading', { name: 'References', exact: true })).toHaveCount(0); await htmlPage.close();
  const docx = await JSZip.loadAsync(await download(page, 'DOCX'));
  const epub = await JSZip.loadAsync(await download(page, 'EPUB (structural)'));
  for (const text of [await docx.file('word/document.xml')!.async('string'), await epub.file('OEBPS/chapter1.xhtml')!.async('string')]) {
    expect(text).toContain('[@{alpha beta}]'); expect(text).not.toContain('KeyAuthor specimen');
  }
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('MDW-R96 valid Unicode keys reach exact Pandoc references and prepared exports through edits and Undo', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const ids = [0x85, 0x2028, 0x2029, 0xfeff].map(point => `alpha${String.fromCodePoint(point)}beta`);
  const entries = ids.map((id, index) => entry(id, `Key${index + 1}`));
  const source = ids.map(id => `[@{${id}}, p. 14]`).join('\n\n');
  await start(page, source, entries);
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview).toContainText('(Key1, 2026, p. 14)');
  await expect(preview).toContainText('(Key4, 2026, p. 14)');
  const pandoc = (await download(page, 'Pandoc Markdown')).toString();
  const metadata = /^---\r?\n([\s\S]*?)\r?\n---/.exec(pandoc);
  expect(metadata).not.toBeNull();
  expect((YAML.parse(metadata![1]) as { references: { id: string }[] }).references.map(reference => reference.id)).toEqual(ids);
  expect(pandoc.endsWith(source)).toBe(true);
  expect((await download(page, 'Markdown')).toString()).toBe(source);
  for (const label of ['Rendered Markdown', 'Plain text', 'AST JSON']) {
    const text = (await download(page, label)).toString();
    for (const family of ['Key1', 'Key2', 'Key3', 'Key4']) expect(text).toContain(family);
    expect(text).not.toContain('[@{alpha');
  }
  const htmlPage = await context.newPage();
  await htmlPage.setContent((await download(page, 'Standalone HTML')).toString());
  await expect(htmlPage.getByRole('heading', { name: 'References', exact: true })).toHaveCount(1);
  for (const family of ['Key1', 'Key2', 'Key3', 'Key4']) await expect(htmlPage.locator('body')).toContainText(`${family} specimen`);
  await htmlPage.close();
  const docx = await JSZip.loadAsync(await download(page, 'DOCX'));
  const epub = await JSZip.loadAsync(await download(page, 'EPUB (structural)'));
  for (const text of [await docx.file('word/document.xml')!.async('string'), await epub.file('OEBPS/chapter1.xhtml')!.async('string')]) {
    for (const family of ['Key1', 'Key2', 'Key3', 'Key4']) expect(text).toContain(`${family} specimen`);
    expect(text).not.toContain('[@{alpha');
  }
  await setSource(page, '[@{alpha beta}]');
  await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(0);
  await expect(page.locator('summary').filter({ hasText: /^Citations/ })).toHaveText('Citations (0 preview keys)');
  await page.getByRole('button', { name: 'Undo document step', exact: true }).click();
  await expect(preview).toContainText('(Key4, 2026, p. 14)');
  const restored = (await download(page, 'Pandoc Markdown')).toString();
  expect(restored).toBe(pandoc);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('MDW-R96 key guidance and long valid and invalid IDs remain readable across viewport changes', async ({ page }) => {
  const long = 'chapter'.repeat(70);
  const valid = `${long}.1.`; const invalid = `${long} section`;
  const source = `[@{${invalid}}]\n\n[@{${valid}}, p. 14]`;
  await start(page, source, [entry(invalid, 'Invalid'), entry(valid, 'Valid')]);
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview).toContainText(`[@{${invalid}}]`);
  await expect(preview).toContainText('(Valid, 2026, p. 14)');
  await expect(preview).not.toContainText('Invalid specimen');
  await expect(page.locator('summary').filter({ hasText: /^Citations/ })).toHaveText('Citations (1 preview key)');
  const hint = page.locator('.markdown-workbench-hint').filter({ hasText: 'Keys cannot contain spaces or tabs' });
  await expect(hint).toContainText('use a hyphen or underscore instead');
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport);
    const boxes = await page.locator('.markdown-workbench-preview, .markdown-workbench-hint').evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      const paragraphs = [...node.querySelectorAll('p')].map(p => { const r = p.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      return { left: box.left, right: box.right, overflow: node.scrollWidth - node.clientWidth, pageOverflow: document.documentElement.scrollWidth - innerWidth, paragraphs };
    }));
    for (const bounds of boxes) {
      expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds.overflow).toBeLessThanOrEqual(1); expect(bounds.pageOverflow).toBeLessThanOrEqual(1);
      for (let i = 1; i < bounds.paragraphs.length; i++) expect(bounds.paragraphs[i].top - bounds.paragraphs[i - 1].bottom).toBeGreaterThanOrEqual(0);
    }
  }
});
