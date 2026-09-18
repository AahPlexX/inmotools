import { expect, test } from '@playwright/test';

const editorLocator = (page: import('@playwright/test').Page) =>
  page.locator('[aria-label="Markdown source"]');

const setSource = async (page: import('@playwright/test').Page, value: string) => {
  const editor = editorLocator(page);
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.keyboard.press('Backspace');
  if (value) await editor.pressSequentially(value);
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

test('manual save does not report success when IndexedDB fails', async ({page}) => {
  await page.addInitScript(() => {
    IDBDatabase.prototype.transaction = function() { throw new DOMException('Test storage failure','QuotaExceededError'); };
  });
  await page.goto('./#/tools/markdown-workbench');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Local autosave failed');
  await page.getByRole('button',{name:'New',exact:true}).click();
  await expect(page.getByTestId('markdown-status')).toContainText('Could not save the current document');
  await expect(editorLocator(page)).toContainText('Untitled document');
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
