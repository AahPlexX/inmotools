import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Markdown Workbench's source editor is a CodeMirror 6 view (see
// MarkdownEditor.tsx), which owns a contenteditable div rather than a
// native <textarea>/<input>. `.fill()` does not work reliably against a
// contenteditable, so tests that need to replace the whole document type
// into it directly: focus, select-all, delete, then type the new text.
const setSource = async (page: import('@playwright/test').Page, value: string) => {
  const editor = page.locator('[aria-label="Markdown source"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.press('Backspace');
  await editor.pressSequentially(value);
};

test('catalog link, exact alias, and generic route open the same local workspace', async ({ page }) => {
  await page.goto('./#/');
  const catalogLink = page.getByRole('link', { name: /Markdown Workbench/ });
  await expect(catalogLink).toBeVisible();
  await expect(catalogLink).toHaveAttribute('href', '#/tools/markdown-workbench');
  await catalogLink.click();
  await expect(page.getByTestId('markdown-workbench')).toBeVisible();

  await page.goto('./#/tools/markdown-workbench');
  await expect(page.getByTestId('suite-title')).toContainText('Markdown, Math & Citation Publishing Workbench');
  await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);
  await expect(page.getByTestId('markdown-workbench')).toBeVisible();
});

test('editing the source updates the live preview, and toggling Source view hides it', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('h1')).toContainText('Untitled document');

  await setSource(page, '# Hello Workbench\n\nA **bold** paragraph with *italic* text.');
  await expect(preview.locator('h1')).toContainText('Hello Workbench');
  await expect(preview.locator('strong')).toContainText('bold');
  await expect(preview.locator('em')).toContainText('italic');

  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(preview).toBeHidden();
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(preview).toBeVisible();
});

test('undo and redo roll source edits back and forward', async ({ page }) => {
  // History is committed per CodeMirror docChanged event (effectively per
  // keystroke for typed input - see state-engine.ts's commitHistory), so one
  // Undo click reverts the single most recent change, not an entire typed
  // sequence. This test exercises that actual granularity: it establishes a
  // baseline, applies one further single-character edit, then checks that
  // one Undo/Redo cycle rolls exactly that edit back and forward.
  await page.goto('./#/tools/markdown-workbench');
  const preview = page.locator('.markdown-workbench-preview');
  await setSource(page, '# Version one');
  await expect(preview.locator('h1')).toContainText('Version one');

  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(redo).toBeDisabled();
  await expect(undo).toBeEnabled();

  await page.keyboard.press('!');
  await expect(preview.locator('h1')).toContainText('Version one!');

  await undo.click();
  await expect(preview.locator('h1')).toContainText('Version one');
  await expect(preview.locator('h1')).not.toContainText('Version one!');
  await expect(redo).toBeEnabled();

  await redo.click();
  await expect(preview.locator('h1')).toContainText('Version one!');
});

test('evaluates a table formula and keeps a static cell untouched', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, [
    '| Item | Qty | Price | Total |',
    '| - | - | - | - |',
    '| Widgets | 4 | 2.5 | =B2*C2 |',
  ].join('\n'));

  const preview = page.locator('.markdown-workbench-preview');
  const row = preview.locator('table tbody tr').first();
  await expect(row.locator('td').nth(0)).toHaveText('Widgets');
  await expect(row.locator('td').nth(3)).toHaveText('10');
});

test('resolves a pasted .bib citekey into an APA in-text citation and bibliography entry', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'See [@smith2024] for details.');

  await page.locator('details').filter({ hasText: /^Citations/ }).locator('summary').click();
  await page.getByLabel('Bibliography source').fill(
    '@article{smith2024,\n  author = {Smith, Jane},\n  title = {A study of things},\n  journal = {Journal of Things},\n  year = {2024}\n}',
  );

  await expect(page.locator('.markdown-workbench-bibliography-output')).toContainText('Smith', { timeout: 15_000 });
  await expect(page.locator('.markdown-workbench-bibliography-output')).toContainText('Journal of Things');
  await expect(page.locator('.markdown-workbench-citation-warning')).toHaveCount(0);

  await page.getByLabel('Citation style').selectOption('ieee');
  await expect(page.locator('.markdown-workbench-bibliography-output')).toBeVisible();
});

test('reports an unresolved citekey as a non-blocking warning', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'See [@doesnotexist] for details.');

  await page.locator('details').filter({ hasText: /^Citations/ }).locator('summary').click();
  await page.getByLabel('Bibliography source').fill(
    '@article{smith2024,\n  author = {Smith, Jane},\n  title = {A study of things},\n  year = {2024}\n}',
  );

  await expect(page.locator('.markdown-workbench-citation-warning')).toContainText('doesnotexist', { timeout: 15_000 });
});

test('exposes every export control and downloads a Markdown, HTML, and AST JSON file', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Export check\n\nSome content.');

  for (const name of ['Markdown', 'Standalone HTML', 'Print / PDF', 'DOCX', 'EPUB (structural)', 'AST JSON']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }

  const mdDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  expect((await mdDownload).suggestedFilename()).toBe('document.md');

  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Standalone HTML', exact: true }).click();
  expect((await htmlDownload).suggestedFilename()).toBe('document.html');

  const astDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'AST JSON', exact: true }).click();
  expect((await astDownload).suggestedFilename()).toBe('document.ast.json');
});

test('downloads a DOCX and a structural EPUB', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# DOCX and EPUB check\n\nSome content.');

  const docxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOCX', exact: true }).click();
  expect((await docxDownload).suggestedFilename()).toBe('document.docx');
  await expect(page.locator('.markdown-workbench-status')).toContainText(/exported document\.docx/i, { timeout: 15_000 });

  const epubDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EPUB (structural)', exact: true }).click();
  expect((await epubDownload).suggestedFilename()).toBe('document.epub');
  await expect(page.locator('.markdown-workbench-status')).toContainText(/structural EPUB/i, { timeout: 15_000 });
});

test('routes the Print / PDF export through the browser print dialog rather than a direct download', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  let printInvoked = false;
  await page.exposeFunction('__markdownWorkbenchPrintProbe', () => { printInvoked = true; });
  await page.evaluate(() => {
    window.print = () => (window as unknown as { __markdownWorkbenchPrintProbe: () => void }).__markdownWorkbenchPrintProbe();
  });
  await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
  await expect.poll(() => printInvoked).toBe(true);
});

const viewports = [
  { name: '320 portrait phone', width: 320, height: 568 },
  { name: '390 portrait phone', width: 390, height: 844 },
  { name: '844 landscape phone', width: 844, height: 390 },
  { name: '768 tablet portrait', width: 768, height: 1024 },
  { name: '1440 desktop', width: 1440, height: 900 },
];

for (const viewport of viewports) {
  test(`stays readable without overflow or collisions at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#/tools/markdown-workbench');
    await expect(page.getByTestId('markdown-workbench')).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `document must not scroll horizontally at ${viewport.name}`).toBeLessThanOrEqual(clientWidth + 1);

    const collisions = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.markdown-workbench-toolbar-group, .markdown-workbench-status span, .markdown-workbench-metrics dt, .markdown-workbench-metrics dd')]
        .map((node) => ({ text: (node.textContent ?? '').trim(), rect: node.getBoundingClientRect(), node }))
        .filter((item) => item.text.length > 0 && item.rect.width > 0 && item.rect.height > 0);
      const overlaps: string[] = [];
      for (let left = 0; left < boxes.length; left += 1) {
        for (let right = left + 1; right < boxes.length; right += 1) {
          const a = boxes[left]!; const b = boxes[right]!;
          if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
          const intersectWidth = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          const intersectHeight = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
          if (intersectWidth > 1 && intersectHeight > 1) overlaps.push(`"${a.text}" overlaps "${b.text}"`);
        }
      }
      return overlaps;
    });
    expect(collisions, `overlapping text at ${viewport.name}`).toEqual([]);

    const clipped = await page.evaluate(() => [...document.querySelectorAll('.markdown-workbench-toolbar, .markdown-workbench-status, .markdown-workbench-panel')]
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => `${node.className}: ${node.scrollWidth} > ${node.clientWidth}`));
    expect(clipped, `clipped containers at ${viewport.name}`).toEqual([]);

    const results = await new AxeBuilder({ page })
      .include('[data-testid="suite-workspace"]')
      .exclude('.cm-scroller')
      .analyze();
    const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking.map((item) => `${item.id}: ${item.help}`)).toEqual([]);
  });
}
