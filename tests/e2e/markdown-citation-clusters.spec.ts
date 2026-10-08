import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import AxeBuilder from '@axe-core/playwright';

const library = JSON.stringify([
  { id: 'alpha', type: 'book', title: 'Alpha specimen', author: [{ family: 'Alpha' }], issued: { 'date-parts': [[2026]] } },
  { id: 'beta', type: 'book', title: 'Beta specimen', author: [{ family: 'Beta' }], issued: { 'date-parts': [[2025]] } },
]);
async function setSource(page: Page, source: string) {
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click(); await editor.press('ControlOrMeta+a'); await page.keyboard.insertText(source);
}
async function start(page: Page, source: string) {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, source);
  await page.locator('details').filter({ hasText: /^Citations/ }).first().locator('summary').first().click();
  await page.getByLabel('Bibliography format').selectOption('json');
  await page.getByLabel('Bibliography source', { exact: true }).fill(library);
}
async function download(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  return readFile((await (await pending).path())!);
}
const source = 'See [see @alpha, p. 14 discussion; compare @beta, chap. 2 concluding].';

test('MDW-R93 compound annotations reach preview and all actual prepared exports while original source survives', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page, source);
  const preview = page.locator('.markdown-workbench-preview');
  const sentence = 'See (see Alpha, 2026, p. 14 discussion; compare Beta, 2025, Chapter 2 concluding).';
  await expect(preview).toContainText(sentence);
  expect((await download(page, 'Markdown')).toString()).toBe(source);
  for (const label of ['Rendered Markdown', 'Plain text']) expect((await download(page, label)).toString()).toContain(sentence);
  const ast = (await download(page, 'AST JSON')).toString();
  for (const token of ['14 discussion', '2 concluding', 'compare Beta']) expect(ast).toContain(token);
  const exported = await context.newPage();
  await exported.setContent((await download(page, 'Standalone HTML')).toString());
  await expect(exported.locator('body')).toContainText(sentence); await exported.close();
  const docx = await JSZip.loadAsync(await download(page, 'DOCX'));
  const word = await docx.file('word/document.xml')!.async('string');
  const epub = await JSZip.loadAsync(await download(page, 'EPUB (structural)'));
  const chapter = await epub.file('OEBPS/chapter1.xhtml')!.async('string');
  for (const token of ['14 discussion', '2 concluding', 'compare Beta']) { expect(word).toContain(token); expect(chapter).toContain(token); }
  expect((await download(page, 'Pandoc Markdown')).toString()).toContain(source);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('MDW-R93 annotation-only edits and Undo refresh clusters through every bundled style', async ({ page }) => {
  await start(page, 'First [@alpha, p. 14]. Second [@alpha, p. 27].');
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview).toContainText('p. 14'); await expect(preview).toContainText('p. 27');
  for (const style of ['ieee', 'chicago-author-date', 'mla', 'apa']) {
    await page.getByLabel('Citation style').selectOption(style);
    await setSource(page, 'First [see @alpha, p. 42]. Second [@alpha, p. 63].');
    await expect(preview).toContainText('42'); await expect(preview).toContainText('63');
    await expect(preview).not.toContainText('14'); await expect(preview).not.toContainText('27');
    await expect(preview).toContainText('see');
    await page.getByRole('button', { name: 'Undo document step', exact: true }).click();
    await expect(preview).toContainText('14'); await expect(preview).toContainText('27');
    await expect(preview).not.toContainText('42');
  }
  await setSource(page, 'Alpha says [-@alpha, p. 14].');
  await expect(preview).toContainText('Alpha says (2026, p. 14).');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(preview).not.toContainText('p. 14');
  await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(0);
});

test('MDW-R93 unresolved and complex annotations stay visible with wrapping phone and tablet notices', async ({ page }) => {
  const longSuffix = 'longannotation'.repeat(30);
  const authored = `[see @alpha, p. 14 and *${longSuffix}*]\n\n[compare @alpha, p. 27; @missing, chap. 2]`;
  await start(page, authored);
  const preview = page.locator('.markdown-workbench-preview');
  const notice = page.getByRole('status').filter({ hasText: 'Complex citation syntax kept as written:' });
  await expect(notice).toBeVisible(); await expect(notice).toContainText(longSuffix);
  await expect(preview).toContainText('@alpha'); await expect(preview).toContainText('p. 14');
  await expect(preview).toContainText('@missing'); await expect(preview).toContainText('p. 27');
  expect((await download(page, 'Rendered Markdown')).toString()).toContain(authored);
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(editor).toHaveAttribute('tabindex', '0');
  await page.getByRole('checkbox', { name: 'Spellcheck', exact: true }).uncheck();
  await expect(editor).toHaveAttribute('spellcheck', 'false');
  await expect(editor).toHaveAttribute('tabindex', '0');
  await editor.focus(); await editor.press('Shift+Tab');
  await expect(editor).not.toBeFocused(); await page.keyboard.press('Tab');
  await expect(editor).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).include('[data-testid="markdown-workbench"]').analyze();
  expect(accessibility.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? '')), JSON.stringify(accessibility.violations)).toEqual([]);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport);
    const bounds = await notice.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const next = node.nextElementSibling?.getBoundingClientRect();
      const previous = node.previousElementSibling?.getBoundingClientRect();
      return { left: rect.left, right: rect.right, overflow: node.scrollWidth - node.clientWidth, nextGap: next ? next.top - rect.bottom : 0, previousGap: previous ? rect.top - previous.bottom : 0, pageOverflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.overflow).toBeLessThanOrEqual(1); expect(bounds.pageOverflow).toBeLessThanOrEqual(1);
    expect(bounds.nextGap).toBeGreaterThanOrEqual(0); expect(bounds.previousGap).toBeGreaterThanOrEqual(0);
  }
});
