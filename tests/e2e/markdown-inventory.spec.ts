import { expect, test } from '@playwright/test';

const openSource = async (page: import('@playwright/test').Page, source: string) => {
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  return editor;
};

test('MDW-R19 auto-format aligns a table, keeps literals and can undo the whole formatting action', async ({ page }) => {
  const source = '|A|Longer|\n|-|-|\n|one|two|\n\n* first\n* second\n\n```text\nexact   spaces\n```';
  const editor = await openSource(page, source);
  await page.getByRole('button', { name: 'Auto-format', exact: true }).click();
  await expect(editor).toContainText('| A   | Longer |');
  await expect(editor).toContainText('- first');
  await expect(editor).toContainText('exact   spaces');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText('|A|Longer|');
  await expect(editor).toContainText('* first');
  await expect(editor).toContainText('exact   spaces');
});

test('MDW-R19 a delayed formatter cannot overwrite a newer edit', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private isFormatter: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isFormatter = String(url).includes('format-worker');
      }
      postMessage(message: unknown, transfer: Transferable[] = []) {
        if (this.isFormatter) setTimeout(() => super.postMessage(message, transfer), 1000);
        else super.postMessage(message, transfer);
      }
    };
  });
  const editor = await openSource(page, '* initial');
  await page.getByRole('button', { name: 'Auto-format', exact: true }).click();
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText(' newer');
  await expect(page.getByTestId('markdown-status')).toContainText('Formatting cancelled');
  await expect(editor).toContainText('* initial newer');
  await expect(page.getByRole('button', { name: 'Auto-format', exact: true })).toBeEnabled();
});

test('MDW-R18 style suggestions report source lines, reveal the caret and preserve valid hard breaks', async ({ page }) => {
  const source = '# Title\n\n### Jump\n\n- First\n* Second\n\nTrailing space \nHard break  \nNext line\n\n```text\n### Literal \n```';
  const editor = await openSource(page, source);
  await page.getByText('Markdown checks', { exact: true }).click();
  const checks = page.getByTestId('markdown-lint');
  await expect(checks.getByRole('button')).toHaveCount(3);
  await expect(checks.getByRole('button', { name: /Line 3: Heading/ })).toBeVisible();
  await expect(checks.getByRole('button', { name: /Line 6: List/ })).toBeVisible();
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const bounds = await checks.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: window.innerWidth };
    }));
    expect(bounds.every((rect) => rect.left >= 0 && rect.right <= rect.width)).toBe(true);
    expect(bounds.slice(1).every((rect, index) => rect.top >= bounds[index].bottom)).toBe(true);
  }
  await checks.getByRole('button', { name: /Line 8: Trailing/ }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.insertText('Located ');
  await expect(editor).toContainText('Located Trailing space');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText('Trailing space');
  await expect(checks.getByRole('button')).toHaveCount(3);
});

test('MDW-R09 regex replacement and match case preserve unrelated text and remain undoable', async ({ page }) => {
  const editor = await openSource(page, 'Alpha12 alpha34 ALPHA56');
  await page.getByRole('button', { name: 'Find / replace', exact: true }).click();
  const search = page.locator('.cm-search');
  await search.locator('input[name="search"]').fill('\\d+');
  await search.locator('input[name="replace"]').fill('0');
  await search.getByRole('checkbox', { name: 'regexp', exact: true }).check();
  await search.getByRole('button', { name: 'replace all', exact: true }).click();
  await expect(editor).toContainText('Alpha0 alpha0 ALPHA0');

  await search.getByRole('checkbox', { name: 'regexp', exact: true }).uncheck();
  await search.locator('input[name="search"]').fill('Alpha');
  await search.locator('input[name="replace"]').fill('Beta');
  await search.getByRole('checkbox', { name: 'match case', exact: true }).check();
  await search.getByRole('button', { name: 'replace all', exact: true }).click();
  await expect(editor).toContainText('Beta0 alpha0 ALPHA0');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toContainText('Alpha0 alpha0 ALPHA0');
});

test('MDW-R12 editor settings persist and Vim normal mode resumes after reload', async ({ page }) => {
  const source = '# Settings stay intact\n\n' + 'A long line of plain words. '.repeat(40);
  const editor = await openSource(page, source);
  await page.getByRole('checkbox', { name: 'Wrap lines', exact: true }).uncheck();
  await expect(page.locator('.cm-lineWrapping')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Spellcheck', exact: true }).uncheck();
  await expect(editor).toHaveAttribute('spellcheck', 'false');
  await page.getByRole('checkbox', { name: 'Vim keys', exact: true }).check();
  await expect(editor).toContainText('# Settings stay intact');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Wrap lines', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Spellcheck', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Vim keys', exact: true })).toBeChecked();
  await expect(editor).toHaveAttribute('spellcheck', 'false');
  await expect(page.locator('.cm-lineWrapping')).toHaveCount(0);
  await editor.click();
  await editor.press('Escape');
  const before = await editor.innerText();
  await editor.press('h');
  await expect(editor).toHaveText(before, { useInnerText: true });
  await editor.press('i');
  await page.keyboard.insertText('Vim insertion works');
  await expect(editor).toContainText('Vim insertion works');
  await page.getByRole('checkbox', { name: 'Vim keys', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Wrap lines', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Spellcheck', exact: true }).check();
  await expect(page.locator('.cm-lineWrapping')).toHaveCount(1);
  await expect(editor).toHaveAttribute('spellcheck', 'true');
});

test('MDW-R12 invalid stored preference values fall back to usable editor settings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('inmotools.markdown-workbench.prefs', JSON.stringify({
    view: 'invalid', fontSize: -200, lineWrapping: 'false', vimMode: 'false', spellcheck: 'false', syntaxSuggestions: 'false', darkMode: 'false',
  })));
  await page.goto('./#/tools/markdown-workbench');
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(editor).toBeVisible();
  await expect(page.getByRole('button', { name: 'Split', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: 'Vim keys', exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Wrap lines', exact: true })).toBeChecked();
  await expect(editor).toHaveAttribute('spellcheck', 'true');
  await expect(page.getByTestId('markdown-font-size-value')).toHaveText('13 px');
});

test('MDW-R15 typewriter keeps first and last caret lines centered through orientation changes', async ({ page }) => {
  const editor = await openSource(page, '# First\n\n' + Array.from({ length: 120 }, (_, i) => `Line ${i + 1}.`).join('\n'));
  const mode = page.getByRole('checkbox', { name: 'Typewriter mode', exact: true });
  await mode.check();
  const caretOffset = () => page.locator('.cm-editor').evaluate((node) => {
    const caret = node.querySelector('.cm-cursor')?.getBoundingClientRect();
    const scroller = node.querySelector('.cm-scroller')!.getBoundingClientRect();
    return caret ? Math.abs(caret.y + caret.height / 2 - scroller.y - scroller.height / 2) : Infinity;
  });
  await editor.press('ControlOrMeta+Home');
  await page.keyboard.insertText('First ');
  await expect.poll(caretOffset).toBeLessThan(24);
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText('\nLast');
  await expect.poll(caretOffset).toBeLessThan(24);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.keyboard.insertText(' line');
  await expect.poll(caretOffset).toBeLessThan(24);
  await expect(editor).toContainText('Last line');
  await mode.uncheck();
  await editor.press('ControlOrMeta+End');
  await page.keyboard.insertText(' remains editable');
  await expect(editor).toContainText('Last line remains editable');
});

test('MDW-R17 bounded table builder inserts chosen dimensions and supports cancel and undo', async ({ page }) => {
  const editor = await openSource(page, 'Before');
  const trigger = page.getByRole('button', { name: 'Table builder', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Build a table' });
  await dialog.getByLabel('Data rows', { exact: true }).fill('0');
  await expect(dialog.getByRole('button', { name: 'Insert table', exact: true })).toBeDisabled();
  await dialog.getByLabel('Data rows', { exact: true }).fill('3');
  await dialog.getByLabel('Columns', { exact: true }).fill('4');
  await dialog.getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(editor).toContainText('Before');
  const table = page.locator('.markdown-workbench-preview table');
  await expect(table.locator('thead th')).toHaveCount(4);
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveText('Before');
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(editor).toHaveText('Before');
});
