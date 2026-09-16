import { expect, test, type Download, type Page } from '@playwright/test';
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

async function downloadBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function wordCountSelect(workspace: ReturnType<Page['getByTestId']>) {
  const configuration = workspace.getByRole('region', { name: 'Test configuration' });
  return configuration.locator('label').filter({ hasText: /^\s*Words/ }).locator('select');
}

function fontSelect(workspace: ReturnType<Page['getByTestId']>) {
  const comfortPanel = workspace.getByRole('heading', { name: 'Comfort & accessibility' }).locator('..');
  return comfortPanel.locator('label').filter({ hasText: /^\s*Font/ }).locator('select');
}

test('completes a multiline word-count custom target, persists it, and exports the JSON envelope', async ({ page }) => {
  await clearTypingDatabase(page);
  const workspace = await openWorkspace(page);

  await workspace.getByLabel('Mode').selectOption('custom');
  await workspace.getByLabel('Duration').selectOption('words');
  const wordsSelect = wordCountSelect(workspace);
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

  const exported = JSON.parse((await downloadBuffer(download)).toString('utf8'));
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

test('exports history metadata across formats and re-imports a bundle without id collisions', async ({ page }) => {
  await clearTypingDatabase(page);
  const workspace = await openWorkspace(page);

  await workspace.getByLabel('Mode').selectOption('custom');
  await workspace.getByLabel('Duration').selectOption('words');
  await wordCountSelect(workspace).selectOption('10');
  await workspace.getByRole('button', { name: 'Paste text' }).click();
  const customDialog = workspace.getByRole('dialog', { name: 'Paste or edit custom text' });
  await customDialog.getByRole('textbox', { name: 'Custom text' }).fill('one two three four five six seven eight nine ten');
  await customDialog.getByRole('button', { name: 'Use this text' }).click();

  const canvas = workspace.getByRole('textbox', { name: /Typing test canvas/i });
  await canvas.focus();
  await page.keyboard.type('one two three four five six seven eight nine ten', { delay: 10 });

  const resultDialog = workspace.getByRole('dialog', { name: 'Test result' });
  await expect(resultDialog).toBeVisible();
  await resultDialog.getByPlaceholder('add tag').fill('saved-tag');
  await resultDialog.getByPlaceholder('add tag').press('Enter');
  await resultDialog.getByLabel('Notes').fill('saved note');
  await resultDialog.getByRole('button', { name: 'Save', exact: true }).click();

  const history = workspace.getByRole('region', { name: 'Session history' });
  const totalTests = history.locator('.tw-stat').filter({ hasText: 'Total tests' });
  await expect(totalTests).toContainText('1');

  await workspace.getByRole('button', { name: 'Export…' }).click();
  const exportDialog = workspace.getByRole('dialog', { name: 'Export history' });
  await exportDialog.getByLabel('Typist name').fill('History Typist');
  await exportDialog.getByLabel('Organization').fill('Records Office');
  await exportDialog.getByLabel('Certified by').fill('Supervisor');
  await exportDialog.getByLabel('Global tags to add (Enter to add)').fill('archive');
  await exportDialog.getByLabel('Global tags to add (Enter to add)').press('Enter');
  await exportDialog.getByLabel('Notes').fill('quarterly export');

  const csvPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Export CSV' }).click();
  const csvDownload = await csvPromise;
  expect(csvDownload.suggestedFilename()).toMatch(/^typing-history-.*\.csv$/);
  const csv = (await downloadBuffer(csvDownload)).toString('utf8');
  expect(csv).toContain('export_tags');
  expect(csv).toContain('archive');
  expect(csv).toContain('quarterly export');
  expect(csv).toContain('Records Office');

  const mdPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Export Markdown' }).click();
  const markdownDownload = await mdPromise;
  expect(markdownDownload.suggestedFilename()).toMatch(/^typing-history-.*\.md$/);
  const markdown = (await downloadBuffer(markdownDownload)).toString('utf8');
  expect(markdown).toContain('History Typist');
  expect(markdown).toContain('Records Office');
  expect(markdown).toContain('archive');
  expect(markdown).toContain('quarterly export');

  const jsonPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Export JSON' }).click();
  const jsonDownload = await jsonPromise;
  expect(jsonDownload.suggestedFilename()).toMatch(/^typing-history-.*\.json$/);
  const jsonBuffer = await downloadBuffer(jsonDownload);
  const bundle = JSON.parse(jsonBuffer.toString('utf8'));
  expect(bundle.typistName).toBe('History Typist');
  expect(bundle.organization).toBe('Records Office');
  expect(bundle.globalTags).toContain('archive');
  expect(bundle.notes).toBe('quarterly export');
  expect(bundle.tests).toHaveLength(1);
  expect(bundle.tests[0].id).toEqual(expect.any(Number));

  await page.keyboard.press('Escape');
  await expect(exportDialog).toBeHidden();

  const importInput = workspace.locator('label').filter({ hasText: /Import JSON/ }).locator('input[type="file"]');
  await importInput.setInputFiles({ name: 'typing-history.json', mimeType: 'application/json', buffer: jsonBuffer });
  await expect(workspace).toContainText('Imported 1 test.');
  await expect(totalTests).toContainText('2');
});

test('loads a CSV dictionary and exports raw keystrokes and a PDF certificate', async ({ page }) => {
  await clearTypingDatabase(page);
  const workspace = await openWorkspace(page);

  const dictionaryCsv = 'alpha,beta,gamma,delta,epsilon\nzeta,eta,theta,iota,kappa';
  const dictionaryInput = workspace.locator('label').filter({ hasText: /Load CSV dictionary/ }).locator('input[type="file"]');
  await dictionaryInput.setInputFiles({ name: 'practice.csv', mimeType: 'text/csv', buffer: Buffer.from(dictionaryCsv) });
  await expect(workspace).toContainText('Loaded 10 custom words.');
  await expect(workspace.getByLabel('Mode')).toHaveValue('custom');

  await workspace.getByLabel('Duration').selectOption('words');
  await wordCountSelect(workspace).selectOption('10');
  const expectedTarget = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
  const canvas = workspace.getByRole('textbox', { name: /Typing test canvas/i });
  const renderedTarget = await canvas.evaluate((element) => (element.textContent ?? '').replace(/\u00a0/g, ' ').trim());
  expect(renderedTarget).toBe(expectedTarget);

  await canvas.focus();
  await page.keyboard.type(expectedTarget, { delay: 8 });
  const resultDialog = workspace.getByRole('dialog', { name: 'Test result' });
  await expect(resultDialog).toBeVisible();
  await expect(resultDialog.getByRole('checkbox', { name: 'Save raw keystroke log' })).toBeChecked();

  const rawPromise = page.waitForEvent('download');
  await resultDialog.getByRole('button', { name: 'Export keystrokes' }).click();
  const rawDownload = await rawPromise;
  expect(rawDownload.suggestedFilename()).toMatch(/^typing-test-.*-keystrokes\.csv$/);
  const rawCsv = (await downloadBuffer(rawDownload)).toString('utf8');
  expect(rawCsv.split('\n')[0]).toContain('seq,time_ms,key,code,expected,index,correct');
  expect(rawCsv).toContain('KeyA');

  const history = workspace.getByRole('region', { name: 'Session history' });
  const totalTests = history.locator('.tw-stat').filter({ hasText: 'Total tests' });
  await expect(totalTests).toContainText('1');

  await workspace.getByRole('button', { name: 'New text' }).click();
  await canvas.focus();
  await page.keyboard.type(expectedTarget, { delay: 8 });
  await expect(resultDialog).toBeVisible();
  await resultDialog.getByLabel('Typist name').fill('Certificate Typist');
  await resultDialog.getByLabel('Organization / classroom').fill('Typing Lab');
  await resultDialog.getByLabel('Certified by (proctor)').fill('Browser Proctor');

  const pdfPromise = page.waitForEvent('download');
  await resultDialog.getByRole('button', { name: 'PDF certificate' }).click();
  const pdfDownload = await pdfPromise;
  expect(pdfDownload.suggestedFilename()).toMatch(/^typing-test-.*\.pdf$/);
  const pdfBuffer = await downloadBuffer(pdfDownload);
  expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  expect(pdfBuffer.length).toBeGreaterThan(500);
  await expect(totalTests).toContainText('2');
});

test('normalizes duration families, honors exact word count, bundles fonts, and exposes modal semantics', async ({ page }) => {
  await clearTypingDatabase(page);
  const workspace = await openWorkspace(page);

  await workspace.getByLabel('Mode').selectOption('words-1000');
  await workspace.getByLabel('Duration').selectOption('words');
  const wordsSelect = wordCountSelect(workspace);
  await expect(wordsSelect).toHaveValue('25');
  await wordsSelect.selectOption('10');

  const canvas = workspace.getByRole('textbox', { name: /Typing test canvas/i });
  const targetWordCount = await canvas.evaluate((element) => (element.textContent ?? '').trim().split(/\s+/).filter(Boolean).length);
  expect(targetWordCount).toBe(10);

  await fontSelect(workspace).selectOption('dyslexic');
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