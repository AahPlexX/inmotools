import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const library = JSON.stringify([
  { id: 'alpha', type: 'book', title: 'Alpha bibliography specimen', author: [{ family: 'Alpha', given: 'Test' }], issued: { 'date-parts': [[2026]] } },
  { id: 'beta', type: 'book', title: 'Beta bibliography specimen', author: [{ family: 'Beta', given: 'Test' }], issued: { 'date-parts': [[2025]] } },
  { id: 'unused', type: 'book', title: 'Uncited bibliography specimen' },
]);

async function setSource(page: Page, source: string) {
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  return editor;
}

async function loadLibrary(page: Page, text = library) {
  const panel = page.locator('.markdown-workbench-panel').filter({ has: page.locator('textarea[aria-label="Bibliography source"]') });
  if (!await panel.evaluate(node => (node as HTMLDetailsElement).open)) await panel.locator(':scope > summary').click();
  await page.getByLabel('Bibliography format').selectOption('json');
  await page.getByLabel('Bibliography source', { exact: true }).fill(text);
}

async function download(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  return readFile((await (await pending).path())!);
}

test('MDW-R51 all cited entries reach actual exports while native marker literals and original Windows source survive', async ({ page, context }) => {
  await page.goto('./#/tools/markdown-workbench');
  const source = '---\r\ntitle: "[@unused]"\r\n---\r\n\r\nSee [@beta], [@alpha], [@beta] and [@missing].\r\n\r\n    [@alpha]\r\n\r\n``[@alpha] ` inner``\r\n\r\n````md\r\n```\r\n[@alpha]\r\n````\r\n\r\n> <details>\r\n> <summary>Prose [@alpha], code ``[@alpha] ` inner``</summary>\r\n>\r\n> Closed body [@beta].\r\n>\r\n> </details>\r\n';
  await page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'citations.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  await loadLibrary(page);
  const preview = page.locator('.markdown-workbench-preview');
  const heading = preview.getByRole('heading', { name: 'References', exact: true });
  await expect(heading).toHaveCount(1);
  await expect(preview.locator('#user-content-references ~ p')).toHaveCount(2);
  await expect(preview).toContainText('Alpha bibliography specimen');
  await expect(preview).toContainText('Beta bibliography specimen');
  await expect(preview).not.toContainText('Uncited bibliography specimen');
  await expect(preview.locator('pre code').first()).toHaveText('[@alpha]\n');
  await expect(preview.locator('pre code').nth(1)).toHaveText('```\n[@alpha]\n');
  await expect(preview.locator('summary code')).toHaveText('[@alpha] ` inner');
  await expect(preview.locator('summary')).toContainText('Alpha');
  await expect(page.locator('.markdown-workbench-citation-warning')).toHaveText('Unresolved citation key: missing');
  expect((await download(page, 'Markdown')).toString('utf8')).toBe(source);
  const rendered = (await download(page, 'Rendered Markdown')).toString('utf8');
  expect(rendered).toContain('## References');
  expect(rendered).toContain('[@missing]');
  const ast = JSON.parse((await download(page, 'AST JSON')).toString('utf8'));
  expect(ast.children.slice(-3).map((node: { type: string }) => node.type)).toEqual(['heading', 'paragraph', 'paragraph']);
  expect(JSON.stringify(ast.children.slice(-3))).not.toContain('position');
  const exported = await context.newPage();
  await exported.setContent((await download(page, 'Standalone HTML')).toString('utf8'));
  await expect(exported.getByRole('heading', { name: 'References', exact: true })).toHaveCount(1);
  await expect(exported.locator('body')).toContainText('Alpha bibliography specimen');
  await expect(exported.locator('body')).toContainText('Beta bibliography specimen');
  await exported.emulateMedia({ media: 'print' });
  await expect(exported.getByRole('heading', { name: 'References', exact: true })).toBeVisible();
  await exported.close();
  const docx = await JSZip.loadAsync(await download(page, 'DOCX'));
  const word = await docx.file('word/document.xml')!.async('string');
  for (const text of ['References', 'Alpha bibliography specimen', 'Beta bibliography specimen']) expect(word).toContain(text);
  const epub = await JSZip.loadAsync(await download(page, 'EPUB (structural)'));
  const chapter = await epub.file('OEBPS/chapter1.xhtml')!.async('string');
  for (const text of ['References', 'Alpha bibliography specimen', 'Beta bibliography specimen']) expect(chapter).toContain(text);
  expect(await page.evaluate(xml => new DOMParser().parseFromString(xml, 'application/xhtml+xml').querySelector('parsererror')?.textContent ?? null, chapter)).toBeNull();
  await page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'rendered.md', mimeType: 'text/markdown', buffer: Buffer.from(rendered) });
  await expect(heading).toHaveCount(1);
  await expect(preview.locator('pre code').first()).toHaveText('[@alpha]\n');
});

test('MDW-R51 style loading, invalid libraries, document edits and resets cannot retain stale References', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let intercepted = false;
  await page.route(/\/assets\/ieee-[^/]+\.js(?:\?.*)?$/, async route => { intercepted = true; await gate; await route.continue(); });
  await page.goto('./#/tools/markdown-workbench');
  const editor = await setSource(page, 'See [@beta] and [@alpha].');
  await loadLibrary(page);
  const preview = page.locator('.markdown-workbench-preview');
  const heading = preview.getByRole('heading', { name: 'References', exact: true });
  await expect(heading).toHaveCount(1);
  await page.getByLabel('Citation style').selectOption('ieee');
  await expect.poll(() => intercepted).toBe(true);
  await expect(heading).toHaveCount(0);
  await expect(preview).toContainText('[@beta]');
  for (const label of ['Rendered Markdown', 'Standalone HTML', 'Print / PDF', 'DOCX', 'EPUB (structural)', 'AST JSON']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: 'Markdown', exact: true })).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'Formatting citations…' })).toBeVisible();
  release();
  await expect(heading).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Rendered Markdown', exact: true })).toBeEnabled();
  const entries = preview.locator('#user-content-references ~ p');
  await expect(entries.first()).toContainText('Beta bibliography specimen');
  await expect(entries.first()).toContainText('[1]');
  await expect(entries.nth(1)).toContainText('Alpha bibliography specimen');
  for (const style of ['chicago-author-date', 'mla', 'apa']) {
    await page.getByLabel('Citation style').selectOption(style);
    await expect(entries.first()).toContainText(/Alpha bibliography specimen/i);
    await expect(entries.nth(1)).toContainText(/Beta bibliography specimen/i);
  }
  await page.getByLabel('Bibliography source', { exact: true }).fill('{');
  await expect(heading).toHaveCount(0);
  await expect(page.locator('.markdown-workbench-citation-warning')).toContainText('CSL-JSON');
  await loadLibrary(page);
  await expect(heading).toHaveCount(1);
  await setSource(page, 'Only [@alpha].');
  await expect(entries).toHaveCount(1);
  await expect(preview).not.toContainText('Beta bibliography specimen');
  await setSource(page, '``[@alpha] ` literal``\n\n\\[@beta]\n\n$[@math]$');
  await expect(heading).toHaveCount(0);
  await editor.press('ControlOrMeta+z');
  await expect(heading).toHaveCount(1);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Started a new document.');
  await expect(heading).toHaveCount(0);
});

test('MDW-R51 long References wrap through portrait, landscape and tablet viewports and escape unfinished code on export', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'See [@long].\n\n````md\n```\n[@literal]');
  const title = 'Longbibliographytoken'.repeat(32);
  await loadLibrary(page, JSON.stringify([{ id: 'long', type: 'book', title, author: [{ family: 'Fixture' }], issued: { 'date-parts': [[2026]] } }]));
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(1);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const bounds = await preview.evaluate(node => {
      const heading = node.querySelector('#user-content-references')!.getBoundingClientRect();
      const entry = node.querySelector('#user-content-references + p')!.getBoundingClientRect();
      const panel = document.querySelector('.markdown-workbench-bibliography-output')!;
      return { left: entry.left, right: entry.right, gap: entry.top - heading.bottom, overflow: node.scrollWidth - node.clientWidth, panelOverflow: panel.scrollWidth - panel.clientWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.gap).toBeGreaterThanOrEqual(0);
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    expect(bounds.panelOverflow).toBeLessThanOrEqual(1);
  }
  const rendered = await download(page, 'Rendered Markdown');
  await page.setInputFiles('input[type="file"][accept*=".html"]', { name: 'unfinished.rendered.md', mimeType: 'text/markdown', buffer: rendered });
  await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(1);
  await expect(preview.locator('pre code')).toHaveText('```\n[@literal]\n');
  await expect(preview).toContainText(title);
});

test('MDW-R51 failed style loading stops pending export state and recovers by selecting a bundled style', async ({ page }) => {
  await page.route(/\/assets\/ieee-[^/]+\.js(?:\?.*)?$/, route => route.abort('failed'));
  await page.goto('./#/tools/markdown-workbench');
  const source = 'See [@alpha].';
  await setSource(page, source);
  await loadLibrary(page);
  const preview = page.locator('.markdown-workbench-preview');
  const references = preview.getByRole('heading', { name: 'References', exact: true });
  await expect(references).toHaveCount(1);
  await page.getByLabel('Citation style').selectOption('ieee');
  await expect(page.getByRole('alert')).toContainText('Couldn’t format these citations.');
  await expect(page.getByRole('status').filter({ hasText: 'Formatting citations…' })).toHaveCount(0);
  await expect(references).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rendered Markdown', exact: true })).toBeDisabled();
  expect((await download(page, 'Markdown')).toString('utf8')).toBe(source);
  await page.getByLabel('Citation style').selectOption('apa');
  await expect(references).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rendered Markdown', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'All tools', exact: true }).click();
  await expect(page.getByTestId('markdown-workbench')).toHaveCount(0);
  const reload = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
  await page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })));
  await reload;
});


for (const [format, header] of [
  ['yaml', '---\ntitle: "[@unused]"\n---'],
  ['toml', '+++\ntitle = "[@unused]"\n+++'],
  ['json', '{\n"title": "brace } and [@unused]"\n}'],
] as const) {
  test(`MDW-R51 ${format} metadata preserves citation boundaries and exact source for native line endings`, async ({ page }) => {
    await page.goto('./#/tools/markdown-workbench');
    await loadLibrary(page);
    const preview = page.locator('.markdown-workbench-preview');
    for (const newline of ['\n', '\r\n', '\r']) {
      const source = header.replace(/\n/g, newline) + newline + newline + '[@alpha].' + newline + newline + '    [@beta]' + newline;
      await page.setInputFiles('input[type="file"][accept*=".html"]', { name: `${format}-fixture.md`, mimeType: 'text/markdown', buffer: Buffer.from(source) });
      await expect(preview.getByRole('heading', { name: 'References', exact: true })).toHaveCount(1);
      await expect(preview.locator('#user-content-references ~ p')).toHaveCount(1);
      await expect(preview).toContainText('(Alpha, 2026).');
      await expect(preview).not.toContainText('Beta bibliography specimen');
      await expect(preview).not.toContainText('Uncited bibliography specimen');
      await expect(preview.locator('pre code')).toHaveText('[@beta]\n');
      expect((await download(page, 'Markdown')).equals(Buffer.from(source))).toBe(true);
    }
  });
}
