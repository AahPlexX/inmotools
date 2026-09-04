import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Markdown Workbench's source editor is a CodeMirror 6 view (see
// MarkdownEditor.tsx), which owns a contenteditable div rather than a
// native <textarea>/<input>. `.fill()` does not work reliably against a
// contenteditable, so tests that need to replace the whole document type
// into it directly: focus, select-all, delete, then type the new text.
const editorLocator = (page: import('@playwright/test').Page) =>
  page.locator('[aria-label="Markdown source"]');

const setSource = async (page: import('@playwright/test').Page, value: string) => {
  const editor = editorLocator(page);
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.press('Backspace');
  await editor.pressSequentially(value);
};

const SAMPLE_BIB = '@article{smith2024,\n  author = {Smith, Jane},\n  title = {A study of things},\n  journal = {Journal of Things},\n  year = {2024}\n}';

// Idempotent: a <details> summary click toggles, so clicking an
// already-expanded panel would collapse it again.
const openPanel = async (page: import('@playwright/test').Page, name: RegExp) => {
  const panel = page.locator('details').filter({ hasText: name }).first();
  if (await panel.evaluate((node) => (node as HTMLDetailsElement).open)) return;
  await panel.locator('summary').first().click();
  await expect(panel).toHaveAttribute('open', '');
};

const readDownload = async (download: import('@playwright/test').Download): Promise<string> => {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
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
  // sequence. This test exercises that actual granularity.
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

test('resolves a pasted .bib citekey and substitutes the formatted citation into the document', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'See [@smith2024] for details.');

  const preview = page.locator('.markdown-workbench-preview');
  // Before a library is supplied the marker must stay exactly as written.
  await expect(preview).toContainText('[@smith2024]');

  await openPanel(page, /^Citations/);
  await page.getByLabel('Bibliography source').fill(SAMPLE_BIB);

  // The formatted in-text citation replaces the marker in the rendered document.
  await expect(preview).toContainText('Smith', { timeout: 15_000 });
  await expect(preview).toContainText('2024');
  await expect(preview).not.toContainText('[@smith2024]');

  await expect(page.locator('.markdown-workbench-bibliography-output')).toContainText('Journal of Things');
  await expect(page.locator('.markdown-workbench-citation-warning')).toHaveCount(0);

  // IEEE renders a numeric marker instead, proving the substitution follows the style.
  await page.getByLabel('Citation style').selectOption('ieee');
  await expect(preview).toContainText(/\[\d+\]/, { timeout: 15_000 });
});

test('an unresolved citekey is reported and left verbatim in the document', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'See [@doesnotexist] for details.');

  await openPanel(page, /^Citations/);
  await page.getByLabel('Bibliography source').fill(SAMPLE_BIB);

  await expect(page.locator('.markdown-workbench-citation-warning')).toContainText('doesnotexist', { timeout: 15_000 });
  // The marker must remain visible rather than silently vanishing.
  await expect(page.locator('.markdown-workbench-preview')).toContainText('[@doesnotexist]');
});

test('a citation marker inside a code fence is never rewritten', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'Real [@smith2024].\n\n```\nExample [@smith2024]\n```');

  await openPanel(page, /^Citations/);
  await page.getByLabel('Bibliography source').fill(SAMPLE_BIB);

  const preview = page.locator('.markdown-workbench-preview');
  await expect(preview.locator('p').first()).toContainText('Smith', { timeout: 15_000 });
  await expect(preview.locator('pre code')).toContainText('[@smith2024]');
});

test('the document name drives every export filename and defaults from the document title', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  // Default document begins with "# Untitled document", so the filename stem
  // is derived from that heading rather than a hardcoded name.
  await expect(page.getByTestId('markdown-filename-preview')).toContainText('Untitled-document');

  await setSource(page, '# Quarterly Report\n\nBody.');
  await expect(page.getByTestId('markdown-filename-preview')).toContainText('Quarterly-Report');

  await page.getByLabel('Document name').fill('Board Pack: Q1/Q2');
  await expect(page.getByTestId('markdown-filename-preview')).toContainText('Board-Pack-Q1Q2');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Board-Pack-Q1Q2.md');
});

test('exposes every export control and downloads Markdown, HTML and AST JSON', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Export check\n\nSome content.');

  for (const name of ['Markdown', 'Rendered Markdown', 'Standalone HTML', 'Print / PDF', 'DOCX', 'EPUB (structural)', 'AST JSON']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }

  const mdDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  expect((await mdDownload).suggestedFilename()).toBe('Export-check.md');

  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Standalone HTML', exact: true }).click();
  const html = await readDownload(await htmlDownload);
  expect(html).toContain('<title>Export check</title>');
  expect(html).toContain('Some content.');

  const astDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'AST JSON', exact: true }).click();
  const ast = await readDownload(await astDownload);
  expect(JSON.parse(ast).type).toBe('root');
});

test('the rendered Markdown export carries evaluated formulas while the plain export keeps the source', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, [
    '| A | B |',
    '| - | - |',
    '| 4 | =A2*3 |',
  ].join('\n'));

  const plain = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  expect(await readDownload(await plain)).toContain('=A2*3');

  const rendered = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Rendered Markdown', exact: true }).click();
  const renderedText = await readDownload(await rendered);
  expect(renderedText).toContain('| 4 | 12 |');
  expect(renderedText).not.toContain('=A2*3');
});

test('HTML export still contains the document when exporting from Source view', async ({ page }) => {
  // Regression guard: the preview pane is not mounted in Source view, so an
  // export that scraped it produced an empty document body.
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Source view export\n\nThis body must survive.');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.locator('.markdown-workbench-preview')).toBeHidden();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Standalone HTML', exact: true }).click();
  const html = await readDownload(await download);
  expect(html).toContain('This body must survive.');
  expect(html).toContain('Source view export');
});

test('downloads a DOCX and a structural EPUB', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# DOCX and EPUB check\n\nSome content.');

  const docxDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'DOCX', exact: true }).click();
  expect((await docxDownload).suggestedFilename()).toBe('DOCX-and-EPUB-check.docx');
  await expect(page.getByTestId('markdown-status')).toContainText(/\.docx/i, { timeout: 15_000 });

  const epubDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EPUB (structural)', exact: true }).click();
  expect((await epubDownload).suggestedFilename()).toBe('DOCX-and-EPUB-check.epub');
  await expect(page.getByTestId('markdown-status')).toContainText(/structural EPUB/i, { timeout: 15_000 });
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

test('opens a local Markdown file without uploading it', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await page.setInputFiles('input[aria-label="Open a local Markdown file"]', {
    name: 'imported-notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Imported heading\n\nImported body text.'),
  });

  await expect(page.locator('.markdown-workbench-preview h1')).toContainText('Imported heading');
  await expect(page.getByTestId('markdown-status')).toContainText(/imported-notes\.md/);
  // The opened filename seeds the document name, so exports inherit it.
  await expect(page.getByTestId('markdown-filename-preview')).toContainText('imported-notes');
});

test('loads a bibliography from a local file and resolves citations from it', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'See [@smith2024].');
  await openPanel(page, /^Citations/);

  await page.setInputFiles('input[aria-label="Load a local bibliography file"]', {
    name: 'library.bib',
    mimeType: 'text/plain',
    buffer: Buffer.from(SAMPLE_BIB),
  });

  await expect(page.getByLabel('Bibliography source')).toHaveValue(/smith2024/);
  await expect(page.locator('.markdown-workbench-preview')).toContainText('Smith', { timeout: 15_000 });
});

test('builds a clickable outline from the document headings', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Top level\n\nIntro.\n\n## Second section\n\nMore text.');
  await openPanel(page, /^Outline/);

  const outline = page.getByTestId('markdown-outline');
  await expect(outline.getByRole('button', { name: 'Top level' })).toBeVisible();
  const second = outline.getByRole('button', { name: 'Second section' });
  await expect(second).toBeVisible();

  // Selecting an entry focuses the editor at that heading.
  await second.click();
  await expect(editorLocator(page)).toBeFocused();
});

test('reports malformed math without breaking the preview', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'Good $x^2$ and broken $\\frac{1$ here.');
  await openPanel(page, /^Math check/);

  const diagnostics = page.getByTestId('markdown-math-diagnostics');
  await expect(diagnostics).toContainText('\\frac{1');
  // The rest of the document still renders.
  await expect(page.locator('.markdown-workbench-preview')).toContainText('Good');

  await setSource(page, 'All $x^2$ fine.');
  await expect(page.getByTestId('markdown-math-diagnostics')).toHaveCount(0);
});

test('surfaces frontmatter and uses its title for exports', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '---\ntitle: Frontmatter Driven\nauthor: A Writer\n---\n\nBody copy.');
  await openPanel(page, /^Frontmatter/);

  const frontmatter = page.getByTestId('markdown-frontmatter');
  await expect(frontmatter).toContainText('title');
  await expect(frontmatter).toContainText('Frontmatter Driven');
  await expect(frontmatter).toContainText('A Writer');
  await expect(page.getByTestId('markdown-filename-preview')).toContainText('Frontmatter-Driven');
});

test('saves, lists, reloads and deletes a local draft', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Draft under test\n\nSaved locally.');

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('markdown-save-state')).toContainText(/Saved/, { timeout: 15_000 });

  await openPanel(page, /^Local drafts and storage/);
  const draftList = page.getByTestId('markdown-draft-list');
  await expect(draftList.locator('li')).toHaveCount(1);

  // Starting a new document must not destroy the stored draft.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.markdown-workbench-preview h1')).toContainText('Untitled document');

  await openPanel(page, /^Local drafts and storage/);
  await draftList.locator('li > button').first().click();
  await expect(page.locator('.markdown-workbench-preview h1')).toContainText('Draft under test');

  await page.getByRole('button', { name: /^Delete draft saved/ }).click();
  await expect(page.getByTestId('markdown-status')).toContainText(/Deleted/, { timeout: 15_000 });
  await expect(draftList).toHaveCount(0);
});

test('changing the font size keeps the caret and document intact', async ({ page }) => {
  // Regression guard: font size used to be part of the editor-construction
  // dependency list, so every slider step destroyed and rebuilt CodeMirror.
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Caret test');

  const slider = page.getByLabel('Font');
  await slider.focus();
  await slider.press('ArrowRight');
  await slider.press('ArrowRight');

  // The editor still holds the same document and remains editable in place.
  await editorLocator(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ok');
  await expect(page.locator('.markdown-workbench-preview h1')).toContainText('Caret test ok');
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
      const boxes = [...document.querySelectorAll('.markdown-workbench-toolbar-group, .markdown-workbench-status span, .markdown-workbench-metrics dt, .markdown-workbench-metrics dd, .markdown-workbench-namebar > *')]
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

    const clipped = await page.evaluate(() => [...document.querySelectorAll('.markdown-workbench-toolbar, .markdown-workbench-status, .markdown-workbench-panel, .markdown-workbench-namebar')]
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
