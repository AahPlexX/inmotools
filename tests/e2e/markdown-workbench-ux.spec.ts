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

test('a fenced code block in a recognized language is syntax-highlighted in the rendered preview', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, "```js\nconst total = 1 + 2;\n```");

  const codeBlock = page.locator('.markdown-workbench-preview pre code.language-js');
  await expect(codeBlock).toBeVisible();
  const keyword = codeBlock.locator('.tok-keyword').first();
  await expect(keyword).toHaveText('const');
  await expect.poll(() => keyword.evaluate((node) => getComputedStyle(node).color))
    .not.toBe(await codeBlock.evaluate((node) => getComputedStyle(node).color));
});

test('a fenced code block in an unrecognized language renders as plain, uncolored text', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, "```not-a-real-language\nfoo bar baz\n```");

  const codeBlock = page.locator('.markdown-workbench-preview pre code');
  await expect(codeBlock).toContainText('foo bar baz');
  await expect(codeBlock.locator('[class*="tok-"]')).toHaveCount(0);
});

test('a mermaid code fence is rendered as a diagram, not highlighted as source text', async ({ page }) => {
  await page.goto('./#/tools/markdown-workbench');
  await setSource(page, '```mermaid\nflowchart LR\nA-->B\n```');

  await expect(page.locator('.markdown-workbench-preview .markdown-workbench-diagram svg')).toBeVisible();
  await expect(page.locator('.markdown-workbench-preview [class*="tok-"]')).toHaveCount(0);
});
