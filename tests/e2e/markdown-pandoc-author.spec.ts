import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { expect, test, type Page } from '@playwright/test';

const library = JSON.stringify(['alpha', 'beta'].map(id => ({ id, type: 'book', title: `Source ${id}`, author: [{ family: id }], issued: { 'date-parts': [[2026]] } })));
const setSource = async (page: Page, source: string) => {
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click(); await editor.press('ControlOrMeta+A'); await page.keyboard.insertText(source);
};
const start = async (page: Page, source: string, imported = true) => {
  await page.goto('./#/tools/markdown-workbench'); await setSource(page, source);
  if (imported) {
    const citations = page.locator('details').filter({ hasText: /^Citations/ }).first();
    await citations.locator('summary').first().click();
    await page.getByLabel('Bibliography format').selectOption('json');
    await page.getByLabel('Bibliography source', { exact: true }).fill(library);
  }
};
const download = async (page: Page, label = 'Pandoc Markdown') => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  return readFile((await (await pending).path())!, 'utf8');
};
const references = (source: string) => {
  const metadata = /^---\n([\s\S]*?)\n---/.exec(source);
  if (!metadata) return [];
  return (YAML.parse(metadata[1]) as { references: { id: string }[] }).references.map(entry => entry.id);
};

test('MDW-R94 author-only Pandoc download embeds its source while preview and original Markdown stay authored', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const source = '@alpha [p. 14] discusses the claim.\n';
  await start(page, source);
  await expect(page.locator('.markdown-workbench-preview')).toContainText('@alpha [p. 14]');
  expect(await download(page, 'Markdown')).toBe(source);
  const text = await download(page);
  expect(references(text)).toEqual(['alpha']); expect(text.endsWith(`---\n\n${source}`)).toBe(true);
  await expect(page.getByTestId('markdown-status')).toContainText('1 cited source embedded');
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('MDW-R94 edited mixed markers update ordered references and literal brackets do not fabricate a source', async ({ page }) => {
  await start(page, 'See @beta, [@alpha] and @beta.');
  expect(references(await download(page))).toEqual(['beta', 'alpha']);
  await setSource(page, 'Contact [name@alpha] today.');
  expect(await download(page)).toBe('Contact [name@alpha] today.');
  await expect(page.getByTestId('markdown-status')).toContainText('No cited source was found');
  await setSource(page, '@alpha. Example label\n\nSee @alpha and @beta and [@alpha].');
  expect(references(await download(page))).toEqual(['beta', 'alpha']);
});

test('MDW-R94 authored YAML references are kept and do not receive a false missing-bibliography status', async ({ page }) => {
  const source = '---\nreferences:\n- {id: own, type: book, title: Mine}\n---\n\n@own explains.\n';
  await start(page, source, false);
  expect(await download(page)).toBe(source);
  await expect(page.getByTestId('markdown-status')).toContainText('Your own references block was kept as written');
  await expect(page.getByTestId('markdown-status')).not.toContainText('not in your bibliography');
  await expect(page.getByTestId('markdown-status')).not.toContainText('No cited source');
});

test('MDW-R94 unknown author keys remain named with wrapping portrait landscape tablet and desktop status', async ({ page }) => {
  const missing = 'missing'.repeat(80);
  await start(page, `See @alpha and @${missing}.`);
  const text = await download(page);
  expect(references(text)).toEqual(['alpha']);
  const status = page.getByTestId('markdown-status');
  await expect(status).toContainText(missing); await expect(status).toContainText('1 cited key is not in your bibliography');
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 2560, height: 1440 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    const box = await status.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 2);
    expect(await status.evaluate(node => node.scrollHeight <= node.clientHeight + 2)).toBe(true);
    const children = await status.locator(':scope > span').evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }));
    for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
      const a = children[i]; const b = children[j];
      expect(Math.min(a.right, b.right) - Math.max(a.x, b.x) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 2).toBe(false);
    }
  }
});

test('MDW-R94 keys split by native markup stay authored and receive a useful Pandoc export notice', async ({ page }) => {
  const source = 'See @alpha$beta$, @alpha<tag>word and @{alpha`code`}.';
  await start(page, source);
  expect(await download(page)).toBe(source);
  await expect(page.getByTestId('markdown-status')).toContainText('Some citation keys cross markup and were not auto-embedded');
  await expect(page.getByTestId('markdown-status')).toContainText('Pass a bibliography file to Pandoc');
});
