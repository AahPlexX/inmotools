import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const editorLocator = (page: import('@playwright/test').Page) =>
  page.locator('[aria-label="Markdown source"]');

const setSource = async (page: import('@playwright/test').Page, value: string) => {
  const editor = editorLocator(page);
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.press('Backspace');
  if (value.length > 1_000) await page.keyboard.insertText(value);
  else if (value) await editor.pressSequentially(value);
};

const openPanel = async (page: import('@playwright/test').Page, name: RegExp) => {
  const panel = page.locator('details').filter({ hasText: name }).first();
  if (!await panel.evaluate((node) => (node as HTMLDetailsElement).open)) {
    await panel.locator('summary').first().click();
  }
  await expect(panel).toHaveAttribute('open', '');
  return panel;
};

const readDownloadBytes = async (download: import('@playwright/test').Download): Promise<Buffer> => {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

test('markdown page copy reads like product guidance rather than implementation notes', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await expect(page.getByTestId('suite-title')).toContainText('Write, Preview & Export Markdown');
  await expect(page.locator('.suite-summary')).toContainText('Write or paste Markdown and see the result as you work');
  await expect(page.locator('.suite-summary')).not.toContainText(/GFM|CommonMark|AST JSON/);
});

test('toolbar clearly groups workspace, document, editor and export controls', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await expect(page.getByRole('group', { name: 'View and history' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Document' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Export as' })).toBeVisible();
});

test('markdown help opens an accessible syntax guide modal with supported examples', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const openHelp = page.getByRole('button', { name: 'Markdown help' });
  await openHelp.click();

  const dialog = page.getByRole('dialog', { name: 'Markdown syntax guide' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('# Heading 1');
  await expect(dialog).toContainText('###### Heading 6');
  await expect(dialog).toContainText('- [ ] Task');
  await expect(dialog).toContainText('[Link text](https://example.com)');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  await openHelp.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openHelp).toBeFocused();
});

test('source highlighting, selection formatting and visible search work together', async ({page}) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'selected words');
  const editor = editorLocator(page);
  await editor.press('ControlOrMeta+a');
  await page.getByRole('button', {name:'Bold',exact:true}).click();
  await expect(editor).toContainText('**selected words**');
  await expect(page.locator('.markdown-workbench-preview strong')).toHaveText('selected words');
  await expect.poll(() => editor.locator('span').evaluateAll(nodes => nodes.some(node => getComputedStyle(node).fontWeight === '700'))).toBe(true);
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('**');
  await page.getByRole('button', {name:'Find / replace',exact:true}).click();
  await expect(page.locator('.cm-search')).toBeVisible();
});

test('syntax guide fits narrow landscape and keeps its close control reachable', async ({page}) => {
  await page.setViewportSize({width:568,height:320});
  await page.goto('./#/tools/markdown-workbench');
  await page.getByRole('button', {name:'Markdown help'}).click();
  const dialog=page.getByRole('dialog',{name:'Markdown syntax guide'});
  const bounds=await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(321);
  await expect(dialog.getByRole('button',{name:'Close',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('manual save reports IndexedDB failure but a clean document can still start New', async ({page}) => {
  await page.addInitScript(() => {
    IDBDatabase.prototype.transaction = function() { throw new DOMException('Test storage failure','QuotaExceededError'); };
  });
  await page.goto('./#/tools/markdown-workbench');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Local autosave failed');
  await page.getByRole('button',{name:'New',exact:true}).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Started a new document');
  await expect(editorLocator(page)).toContainText('Untitled document');
});


test('untouched default content does not create a local draft on the autosave timer', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await page.waitForTimeout(1_500);
  const drafts = await openPanel(page, /^Local drafts and storage/);
  await expect(drafts).toContainText('No local drafts saved yet.');
  await expect(drafts.locator('[data-testid="markdown-draft-list"]')).toHaveCount(0);
});

test('manual source scrolling keeps the split preview aligned without moving the caret', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const source = Array.from({ length: 80 }, (_, index) =>
    `## Section ${index + 1}\n\nParagraph ${index + 1} with enough text to create vertical space.`
  ).join('\n\n');
  await setSource(page, source);
  const editor = editorLocator(page);
  await editor.press('ControlOrMeta+Home');
  const preview = page.locator('.markdown-workbench-preview');
  await expect.poll(() => preview.evaluate((node) => (node as HTMLElement).scrollTop)).toBeLessThan(80);

  await page.locator('.cm-scroller').evaluate((node) => {
    const scroller = node as HTMLElement;
    scroller.scrollTop = scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await expect.poll(() => preview.evaluate((node) => (node as HTMLElement).scrollTop), { timeout: 5_000 }).toBeGreaterThan(500);
});

test('invalid bibliography input explains the parse problem instead of failing silently', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'See [@missing].');
  const citations = await openPanel(page, /^Citations/);
  await page.getByLabel('Bibliography format').selectOption('json');
  await page.getByLabel('Bibliography source').fill('{not valid json');
  await expect(citations.locator('.markdown-workbench-citation-warning')).toContainText(/couldn.t read|json syntax/i);

  await page.getByLabel('Bibliography format').selectOption('bib');
  await page.getByLabel('Bibliography source').fill('this is not a BibTeX entry');
  await expect(citations.locator('.markdown-workbench-citation-warning')).toContainText(/no bibtex entries|@article/i);
});

test('outline supports filtering and marks the current source section', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Start\n\nIntro\n\n## Installation\n\nSteps\n\n## API reference\n\nDetails');
  const panel = await openPanel(page, /^Outline/);
  const filter = panel.getByRole('searchbox', { name: 'Filter outline headings' });
  await expect(filter).toBeVisible();
  await filter.fill('api');
  await expect(panel.getByRole('button', { name: 'API reference' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Installation' })).toHaveCount(0);
  await filter.fill('');

  const editor = editorLocator(page);
  await editor.click();
  await editor.press('ControlOrMeta+End');
  await expect(panel.getByRole('button', { name: 'API reference' })).toHaveAttribute('aria-current', 'location');
});

test('local HTML files import as Markdown without upload', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await page.setInputFiles('input[type="file"][accept*=".html"]', {
    name: 'article.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<article><h1>Imported HTML</h1><p>A <strong>bold</strong> paragraph.</p><ul><li>One</li><li>Two</li></ul></article>'),
  });
  await expect(editorLocator(page)).toContainText('# Imported HTML');
  await expect(editorLocator(page)).toContainText('**bold**');
  await expect(page.locator('.markdown-workbench-preview h1')).toHaveText('Imported HTML');
  await expect(page.getByTestId('markdown-status')).toContainText(/Imported article\.html.*Markdown/i);
});

test('formatting controls expose keyboard-accessible explanatory tooltips', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const heading = page.getByRole('button', { name: 'Heading', exact: true });
  await heading.focus();
  const headingTip = page.getByRole('tooltip').filter({ hasText: /heading/i });
  await expect(headingTip).toBeVisible();
  await expect(heading).toHaveAttribute('aria-describedby', /markdown-format-tip-/);

  const toc = page.getByRole('button', { name: 'Table of contents', exact: true });
  await toc.focus();
  await expect(page.getByRole('tooltip').filter({ hasText: /heading links|table of contents/i })).toBeVisible();
});

test('editor settings expose usable touch targets and visible font-size feedback', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./#/tools/markdown-workbench');
  for (const label of ['Wrap lines', 'Vim keys', 'Spellcheck', 'Syntax suggestions']) {
    const box = await page.getByText(label, { exact: true }).boundingBox();
    expect(box, label).not.toBeNull();
    expect(box!.height, `${label} touch target height`).toBeGreaterThanOrEqual(24);
  }
  await expect(page.getByTestId('markdown-font-size-value')).toHaveText(/13\s*px/i);
  await page.getByLabel('Font size').press('ArrowRight');
  await expect(page.getByTestId('markdown-font-size-value')).toHaveText(/14\s*px/i);
});

test('dark workspace is readable and reversible without changing document content', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Dark check\n\n~~~javascript\nconst answer = 42;\n~~~');
  const workspace = page.getByTestId('markdown-workbench');
  await page.getByLabel('Dark workspace').check();
  await expect(workspace).toHaveClass(/markdown-workbench-theme-dark/);
  const contrast = await workspace.evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(contrast.background).not.toBe(contrast.color);
  await expect(editorLocator(page)).toContainText('const answer = 42;');
  await page.getByLabel('Dark workspace').uncheck();
  await expect(workspace).not.toHaveClass(/markdown-workbench-theme-dark/);
});

test('focus writing hides secondary chrome but keeps an obvious exit control', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
  await expect(page.getByTestId('markdown-workbench')).toHaveClass(/markdown-workbench-focus/);
  await expect(page.getByRole('button', { name: 'Exit focus', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Export as' })).toBeHidden();
  await expect(page.locator('.markdown-workbench-panel').first()).toBeHidden();
  await expect(editorLocator(page)).toBeVisible();

  await page.getByRole('button', { name: 'Exit focus', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Export as' })).toBeVisible();
});

test('GitHub-style quote and list shortcuts use the same Markdown actions as the toolbar', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'alpha');
  const editor = editorLocator(page);
  await editor.press('ControlOrMeta+Shift+.');
  await expect(editor).toContainText('> alpha');
  await editor.press('ControlOrMeta+Shift+8');
  await expect(editor).toContainText('- > alpha');

  await setSource(page, 'beta');
  await editor.press('ControlOrMeta+Shift+7');
  await expect(editor).toContainText('1. beta');
});

test('document metrics show characters and lines alongside words and sentences', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'One line.\nSecond line.');
  const metrics = await openPanel(page, /^Document metrics/);
  await expect(metrics).toContainText('Characters');
  await expect(metrics).toContainText('Lines');
  await expect(metrics).toContainText('18');
  await expect(metrics).toContainText('2');
});

test('ATX heading levels are visibly distinct in the rendered preview', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Level one\n\n### Level three\n\n###### Level six\n\nPlain paragraph.');

  const styles = await page.locator('.markdown-workbench-preview').evaluate((preview) => {
    const read = (selector: string) => {
      const node = preview.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      const style = getComputedStyle(node);
      return { size: Number.parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400 };
    };
    return { h1: read('h1'), h3: read('h3'), h6: read('h6'), p: read('p') };
  });

  expect(styles.h1.size).toBeGreaterThan(styles.h3.size);
  expect(styles.h3.size).toBeGreaterThan(styles.p.size);
  expect(styles.h6.weight).toBeGreaterThan(styles.p.weight);
});

test('syntax suggestions are on by default, context-aware, and can be disabled', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const toggle = page.getByLabel('Syntax suggestions');
  await expect(toggle).toBeChecked();

  await setSource(page, '');
  const editor = editorLocator(page);
  await editor.click();
  await page.keyboard.type('#');

  const completion = page.locator('.cm-tooltip-autocomplete');
  await expect(completion).toBeVisible();
  await expect(completion).toContainText('Heading 1');

  await toggle.uncheck();
  await page.keyboard.press('Escape');
  await setSource(page, '');
  await editor.click();
  await page.keyboard.type('#');
  await expect(completion).toBeHidden();
});

test('Copy HTML preserves fenced-code token classes in the copied rendered fragment', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '~~~javascript\nconst answer = 42;\n~~~');

  await page.getByRole('button', { name: 'Copy HTML', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Copied the rendered HTML');
  const html = await page.evaluate(() => navigator.clipboard.readText());

  expect(html).toContain('tok-keyword');
  expect(html).toContain('markdown-workbench-code-highlighted');
});

test('standalone HTML export preserves fenced-code syntax colors with self-contained CSS', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '~~~javascript\nconst answer = 42;\n~~~');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Standalone HTML', exact: true }).click();
  const html = (await readDownloadBytes(await downloadPromise)).toString('utf8');

  expect(html).toContain('tok-keyword');
  expect(html).toMatch(/\.tok-keyword[^}]*color:/);
});

test('EPUB export packages the fenced-code token stylesheet with highlighted markup', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '~~~javascript\nconst answer = 42;\n~~~');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EPUB (structural)', exact: true }).click();
  const zip = await JSZip.loadAsync(await readDownloadBytes(await downloadPromise));
  const chapter = await zip.file('OEBPS/chapter1.xhtml')?.async('string');
  const stylesheet = await zip.file('OEBPS/styles/markdown.css')?.async('string');

  expect(chapter).toContain('tok-keyword');
  expect(stylesheet).toMatch(/\.tok-keyword[^}]*color:/);
});

test('an oversized recognized fence remains readable without running cosmetic syntax highlighting', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const hugeFence = '~~~javascript\n' + 'const answer = 42;\n'.repeat(1_200) + '~~~';
  await setSource(page, hugeFence);

  const code = page.locator('.markdown-workbench-preview pre > code.language-javascript');
  await expect(code).toBeVisible();
  await expect(code).toContainText('const answer = 42;');
  await expect(code.locator('[class*="tok-"]')).toHaveCount(0);
});

test('fenced code blocks are colored by language in the live preview', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '```javascript\nconst answer = 42;\n```');
  const code = page.locator('.markdown-workbench-preview pre > code.language-javascript');
  await expect(code).toBeVisible();
  await expect(code).toContainText('const answer = 42;');
  await expect(code.locator('span').first()).toBeVisible();
  // Recognized languages carry more than one distinct token color; an
  // unrecognized language must fall back to plain, un-colored text instead
  // of guessing.
  const colors = await code.locator('span').evaluateAll((nodes) =>
    Array.from(new Set(nodes.map((node) => getComputedStyle(node).color))));
  expect(colors.length).toBeGreaterThan(1);

  await setSource(page, '```not-a-real-language\nplain text stays plain\n```');
  const plain = page.locator('.markdown-workbench-preview pre > code.language-not-a-real-language');
  await expect(plain).toContainText('plain text stays plain');
  await expect(plain.locator('span')).toHaveCount(0);
});

test('a delayed file read that loses a race with a newer edit is cancelled instead of overwriting it', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __fileReadGate: Promise<void> }).__fileReadGate =
      new Promise<void>((resolve) => {
        (window as unknown as { __unblockFileRead: () => void }).__unblockFileRead = resolve;
      });
    const originalText = File.prototype.text;
    File.prototype.text = async function (this: File) {
      await (window as unknown as { __fileReadGate: Promise<void> }).__fileReadGate;
      return originalText.call(this);
    };
  });
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'Original content before opening a file.');

  await page.setInputFiles('input[aria-label="Open a local Markdown file"]', {
    name: 'delayed.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Content from the delayed file'),
  });

  // The read is gated open; type a genuine intervening edit while it is
  // still in flight, then let the delayed read resolve.
  const editor = editorLocator(page);
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited while the file read was pending.');
  await page.evaluate(() => (window as unknown as { __unblockFileRead: () => void }).__unblockFileRead());

  await expect(page.getByTestId('markdown-status')).toContainText('File opening cancelled because the document changed');
  await expect(editor).toContainText('Original content before opening a file. Edited while the file read was pending.');
  await expect(editor).not.toContainText('Content from the delayed file');
});

test('starting a new document while its save is still pending is cancelled instead of discarding the newer edit', async ({ page }) => {
  await page.addInitScript(() => {
    const win = window as unknown as { __delayNextSave?: boolean; __unblockSave?: () => void };
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      const request = originalOpen(...args);
      if (win.__delayNextSave) {
        win.__delayNextSave = false;
        const realAddEventListener = request.addEventListener.bind(request);
        const gate = new Promise<void>((resolve) => { win.__unblockSave = resolve; });
        Object.defineProperty(request, 'onsuccess', {
          configurable: true,
          set(handler: (event: Event) => void) {
            realAddEventListener('success', (event) => { void gate.then(() => handler(event)); });
          },
        });
      }
      return request;
    }) as typeof indexedDB.open;
  });
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'Content before starting a new document.');
  // Let the mount-time draft-store setup (listDrafts/estimateStorageUsage)
  // finish its own indexedDB.open calls before arming the gate, so only the
  // save triggered by "New" below is delayed.
  await expect(page.getByTestId('markdown-save-state')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __delayNextSave: boolean }).__delayNextSave = true; });

  await page.getByRole('button', { name: 'New', exact: true }).click();

  const editor = editorLocator(page);
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Typed while New was still saving.');
  await page.evaluate(() => (window as unknown as { __unblockSave: () => void }).__unblockSave());

  await expect(page.getByTestId('markdown-status')).toContainText('Document changed while saving');
  await expect(editor).toContainText('Content before starting a new document. Typed while New was still saving.');
});

test('starting a new document while a name-only change races its pending save is cancelled', async ({ page }) => {
  await page.addInitScript(() => {
    const win = window as unknown as { __delayNextSave?: boolean; __unblockSave?: () => void };
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((...args: Parameters<typeof indexedDB.open>) => {
      const request = originalOpen(...args);
      if (win.__delayNextSave) {
        win.__delayNextSave = false;
        const realAddEventListener = request.addEventListener.bind(request);
        const gate = new Promise<void>((resolve) => { win.__unblockSave = resolve; });
        Object.defineProperty(request, 'onsuccess', {
          configurable: true,
          set(handler: (event: Event) => void) {
            realAddEventListener('success', (event) => { void gate.then(() => handler(event)); });
          },
        });
      }
      return request;
    }) as typeof indexedDB.open;
  });
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'Content whose name will change.');
  await expect(page.getByTestId('markdown-save-state')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __delayNextSave: boolean }).__delayNextSave = true; });

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByLabel('Document name').fill('Renamed while saving');
  await page.evaluate(() => (window as unknown as { __unblockSave: () => void }).__unblockSave());

  await expect(page.getByTestId('markdown-status')).toContainText('Document changed while saving');
  await expect(editorLocator(page)).toContainText('Content whose name will change.');
  await expect(page.getByLabel('Document name')).toHaveValue('Renamed while saving');
});

test('the formatting toolbar covers heading, blockquote, code, lists, rule and image insertion', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '');
  const editor = editorLocator(page);

  await page.getByRole('button', { name: 'Heading', exact: true }).click();
  await expect(editor).toContainText('# ');
  await page.getByRole('button', { name: 'Heading', exact: true }).click();
  await expect(editor).toContainText('## ');

  await setSource(page, '');
  await page.getByRole('button', { name: 'Blockquote', exact: true }).click();
  await expect(editor).toContainText('> ');
  // Toggles back off when the line is already prefixed.
  await page.getByRole('button', { name: 'Blockquote', exact: true }).click();
  await expect(editor).not.toContainText('>');

  await setSource(page, '');
  await page.getByRole('button', { name: 'Inline code', exact: true }).click();
  await expect(editor).toContainText('`code`');

  await setSource(page, '');
  await page.getByRole('button', { name: 'Code block', exact: true }).click();
  // CodeMirror renders each line as its own block element, so a plain
  // toContainText check across a newline loses the separator; read each
  // rendered line's text directly instead.
  await expect.poll(() => editor.locator('.cm-line').allTextContents()).toEqual(['```', 'code block', '```']);

  await setSource(page, '');
  await page.getByRole('button', { name: 'Bullet list', exact: true }).click();
  await expect(editor).toContainText('- ');

  await setSource(page, '');
  await page.getByRole('button', { name: 'Numbered list', exact: true }).click();
  await expect(editor).toContainText('1. ');

  await setSource(page, 'Paragraph text.');
  await page.getByRole('button', { name: 'Horizontal rule', exact: true }).click();
  await expect.poll(() => editor.locator('.cm-line').allTextContents()).toEqual(['Paragraph text.', '', '---', '', '']);

  await setSource(page, '');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(editor).toContainText('![alt text](https://example.com/image.png)');
  await expect(page.locator('.markdown-workbench-preview img')).toHaveAttribute('alt', 'alt text');
});

test('a pasted or dropped image is embedded locally as a data URI without uploading anything', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '');
  const editor = editorLocator(page);

  const pngBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext('2d')!; context.fillStyle = '#3366cc'; context.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG fixture encoding failed.')), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await editor.click();
  await page.evaluate(({ bytes, name }) => {
    const file = new File([new Uint8Array(bytes)], name, { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    document.activeElement?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dataTransfer }));
  }, { bytes: pngBytes, name: 'pasted.png' });

  await expect(page.getByTestId('markdown-status')).toContainText('Embedded "pasted.png"');
  await expect(editor).toContainText('![pasted](data:image/png;base64,');
  await expect(page.locator('.markdown-workbench-preview img[alt="pasted"]')).toBeVisible();

  await setSource(page, '');
  const box = (await editor.boundingBox())!;
  await page.evaluate(({ bytes, name, x, y }) => {
    const file = new File([new Uint8Array(bytes)], name, { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const target = document.elementFromPoint(x, y) ?? document.body;
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer }));
  }, { bytes: pngBytes, name: 'dropped.png', x: box.x + box.width / 2, y: box.y + box.height / 2 });

  await expect(page.getByTestId('markdown-status')).toContainText('Embedded "dropped.png"');
  await expect(editor).toContainText('![dropped](data:image/png;base64,');
});

test('dropping a .md file over the editor still opens it as a whole new document', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'Existing content.');
  const editor = editorLocator(page);
  const box = (await editor.boundingBox())!;

  await page.evaluate(({ x, y }) => {
    const file = new File(['# Dropped document'], 'dropped-doc.md', { type: 'text/markdown' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const target = document.elementFromPoint(x, y) ?? document.body;
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer }));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

  await expect(page.getByTestId('markdown-status')).toContainText('dropped-doc.md');
  await expect(page.locator('.markdown-workbench-preview h1')).toContainText('Dropped document');
});

test('GitHub-style alert blockquotes render as styled callouts instead of plain quotes', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = editorLocator(page);
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.press('Backspace');
  // insertText (not pressSequentially / setSource) inserts the whole string
  // as one input event with no discrete Enter keydown, so CodeMirror's
  // markdown auto-continue-blockquote-on-Enter feature never fires and
  // cannot inject an extra "> " before the second line.
  await page.keyboard.insertText('> [!WARNING]\n> Handle with care.');
  const alert = page.locator('.markdown-workbench-preview .markdown-alert-warning');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Warning');
  await expect(alert).toContainText('Handle with care.');
  await expect(page.locator('.markdown-workbench-preview blockquote')).toHaveCount(0);
});

test('a recognized emoji shortcode renders as its emoji in the live preview', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, 'Ship it :rocket:');
  await expect(page.locator('.markdown-workbench-preview p')).toContainText('Ship it 🚀');
});


test('opening a file saves dirty work first and gives the imported file a separate draft identity', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Working draft\n\nKeep this before opening another file.');

  await page.setInputFiles('input[aria-label="Open a local Markdown file"]', {
    name: 'Imported document.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Imported document\n\nNew file body.'),
  });

  await expect(page.getByTestId('markdown-status')).toContainText('Opened Imported document.md locally');
  await expect(page.locator('.markdown-workbench-preview h1')).toHaveText('Imported document');

  await page.waitForTimeout(1400);
  const panel = await openPanel(page, /^Local drafts and storage/);
  await expect(panel.getByRole('button', { name: /Working draft —/ })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: /Imported document —/ })).toHaveCount(1);

  await panel.getByRole('button', { name: /Working draft —/ }).click();
  await expect(editorLocator(page)).toContainText('Keep this before opening another file.');
});

test('document names survive autosave and a name-only edit is persisted', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Draft body');
  await page.getByLabel('Document name').fill('Project Alpha');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Saved a local draft');

  const editor = editorLocator(page);
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await page.waitForTimeout(1400);

  let panel = await openPanel(page, /^Local drafts and storage/);
  await expect(panel.getByRole('button', { name: /Project Alpha —/ })).toHaveCount(1);
  await expect(panel).not.toContainText('Autosave —');

  await page.getByLabel('Document name').fill('Project Beta');
  await page.waitForTimeout(1400);
  panel = await openPanel(page, /^Local drafts and storage/);
  await expect(panel.getByRole('button', { name: /Project Beta —/ })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: /Project Alpha —/ })).toHaveCount(0);
});

test('file selection validates Markdown or plain text instead of trusting accept alone', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Keep this document');

  await page.setInputFiles('input[aria-label="Open a local Markdown file"]', {
    name: 'wrong.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-not-really-a-markdown-document'),
  });

  await expect(page.getByTestId('markdown-status')).toContainText('is not a Markdown or plain-text document');
  await expect(editorLocator(page)).toContainText('# Keep this document');
});

test('Preview view is full-width, responsive, and returns to the mounted editor without losing text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Narrow preview\n\nText that must survive the view switch.');

  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.markdown-workbench-preview')).toBeVisible();
  await expect(editorLocator(page)).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(editorLocator(page)).toBeVisible();
  await expect(editorLocator(page)).toContainText('Text that must survive the view switch.');
});

test('common Markdown formatting shortcuts match the visible toolbar actions', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = editorLocator(page);
  const shortcutCases = [
    { key: 'ControlOrMeta+b', expected: '**selected**' },
    { key: 'ControlOrMeta+i', expected: '*selected*' },
    { key: 'ControlOrMeta+e', expected: '`selected`' },
    { key: 'ControlOrMeta+k', expected: '[selected](https://example.com)' },
  ];

  for (const shortcut of shortcutCases) {
    await setSource(page, 'selected');
    await editor.press('ControlOrMeta+a');
    await editor.press(shortcut.key);
    await expect(editor).toContainText(shortcut.expected);
  }

  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Control+B Meta+B');
  await expect(page.getByRole('button', { name: 'Italic', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Control+I Meta+I');
  await expect(page.getByRole('button', { name: 'Inline code', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Control+E Meta+E');
  await expect(page.getByRole('button', { name: 'Link', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
});

test('inserting a table of contents links to and lands on the actual rendered heading', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '# Intro\n\nHello.\n\n## Details\n\nMore.');
  await page.keyboard.press('ControlOrMeta+Home');
  await page.getByRole('button', { name: 'Table of contents', exact: true }).click();

  const editor = editorLocator(page);
  await expect(editor).toContainText('[Intro](#user-content-intro)');
  await expect(editor).toContainText('[Details](#user-content-details)');

  const tocLink = page.locator('.markdown-workbench-preview a', { hasText: 'Details' });
  await expect(tocLink).toHaveAttribute('href', '#user-content-details');
  await expect(page.locator('.markdown-workbench-preview h2#user-content-details')).toContainText('Details');

  const routeHash = await page.evaluate(() => window.location.hash);
  await tocLink.click();
  expect(await page.evaluate(() => window.location.hash)).toBe(routeHash);
});
