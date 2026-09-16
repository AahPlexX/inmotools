import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTE = '/inmotools/#/tools/typing-workstation';
const APP_ROOT = '/inmotools/';
const DB_NAME = 'inmotools-typing-workstation';

async function openWorkspace(page: Page) {
  await page.goto(ROUTE);
  const workspace = page.getByTestId('suite-workspace');
  await expect(workspace).toHaveAttribute('aria-label', 'Typing Workstation workspace');
  return workspace;
}

async function clearTypingDatabase(page: Page) {
  await page.goto(APP_ROOT);
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed'));
      request.onblocked = () => reject(new Error('IndexedDB delete was blocked'));
    });
  }, DB_NAME);
}

test('completes a multiline word-count custom target, persists it, and exports the JSON envelope', async ({ page }) => {
  await clearTypingDatabase(page);
  const workspace = await openWorkspace(page);

  await workspace.getByLabel('Mode').selectOption('custom');
  await workspace.getByLabel('Duration').selectOption('words');
  const wordsSelect = workspace.getByLabel('Words', { exact: true });
  await expect(wordsSelect).toHaveValue('25');
  await wordsSelect.selectOption('10');
  await workspace.getByRole('button', { name: 'Paste text' }).click();

  const customDialog = workspace.getByRole('dialog', { name: 'Paste or edit custom text' });
  await expect(customDialog).toBeVisible();
  const customText = 'one two three four five\nsix seven eight nine ten';
  await customDialog.getByRole('textbox', { name: 'Custom text' }).fill(customText);
  await customDialog.getByRole('button', { name: 'Use this text' }).click();

  const canvas = workspace.getByRole('textbox', { name: /Typing test canvas/i });
  await canvas.focus();
  await page.keyboard.type('one two three four five', { delay: 20 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('six seven eight nine ten', { delay: 20 });

  const resultDialog = workspace.getByRole('dialog', { name: 'Test result' });
  await expect(resultDialog).toBeVisible();
  await resultDialog.getByLabel('Typist name').fill('Browser Regression');
  await resultDialog.getByPlaceholder('add tag').fill('e2e');
  await resultDialog.getByPlaceholder('add tag').press('Enter');
  await resultDialog.getByLabel('Notes').fill('Focused browser validation');

  const downloadPromise = page.waitForEvent('download');
  await resultDialog.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^typing-test-.*\.json$/);

  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(exported.tool).toBe('inmotools-typing-workstation');
  expect(exported.schemaVersion).toBe(1);
  expect(exported.typistName).toBe('Browser Regression');
  expect(exported.test.finishReason).toBe('completed');
  expect(exported.test.targetText).toContain('\n');
  expect(exported.test.tags).toContain('e2e');

  await page.reload();
  const history = page.getByRole('region', { name: 'Session history' });
  await expect(history.locator('.tw-stat').filter({ hasText: 'Total tests' })).toContainText('1');
});

test('normalizes duration families, honors exact word count, bundles fonts, and exposes modal semantics', async ({ page }) => {
  await clearTypingDatabase(page);
  const workspace = await openWorkspace(page);

  await workspace.getByLabel('Mode').selectOption('words-1000');
  await workspace.getByLabel('Duration').selectOption('words');
  const wordsSelect = workspace.getByLabel('Words', { exact: true });
  await expect(wordsSelect).toHaveValue('25');
  await wordsSelect.selectOption('10');

  const canvas = workspace.getByRole('textbox', { name: /Typing test canvas/i });
  const targetWordCount = await canvas.evaluate((element) => (element.textContent ?? '').trim().split(/\s+/).filter(Boolean).length);
  expect(targetWordCount).toBe(10);

  await workspace.getByLabel('Font').selectOption('dyslexic');
  await expect(canvas).toHaveCSS('font-family', /OpenDyslexic/);
  const dyslexicLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "OpenDyslexic"');
  });
  expect(dyslexicLoaded).toBe(true);

  await workspace.getByRole('button', { name: 'Export…' }).click();
  const exportDialog = workspace.getByRole('dialog', { name: 'Export history' });
  await expect(exportDialog).toBeVisible();
  await expect(exportDialog.getByLabel('Typist name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(exportDialog).toBeHidden();

  await workspace.getByRole('button', { name: 'Clear history…' }).click();
  const clearDialog = workspace.getByRole('alertdialog', { name: 'Clear local test history?' });
  await expect(clearDialog).toBeVisible();
  await expect(clearDialog).toContainText('This removes every locally stored test from this browser.');
  await page.keyboard.press('Escape');
  await expect(clearDialog).toBeHidden();
});

test('has no serious or critical automated accessibility violations at rest', async ({ page }) => {
  await openWorkspace(page);
  const results = await new AxeBuilder({ page })
    .include('.tw-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious).toEqual([]);
});

test('reflows without page-level horizontal overflow at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openWorkspace(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
