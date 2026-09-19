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

async function writeTypingConfigPreference(page: Page, value: unknown) {
  await page.evaluate(async ({ dbName, value }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('preferences', 'readwrite');
      tx.objectStore('preferences').put({ key: 'config', value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Preference write failed'));
    });
    db.close();
  }, { dbName: DB_NAME, value });
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

  // Export is side-effect-free: history changes only when Save is explicitly chosen.
  await expect(resultDialog).toBeVisible();
  const preSaveHistory = workspace.getByRole('region', { name: 'Session history' });
  const preSaveTotal = preSaveHistory.locator('.tw-stat').filter({ hasText: 'Total tests' });
  await expect(preSaveTotal).toContainText('0');

  const csvPromise = page.waitForEvent('download');
  await resultDialog.getByRole('button', { name: 'Export CSV' }).click();
  expect((await csvPromise).suggestedFilename()).toMatch(/^typing-test-.*\.csv$/);
  await expect(resultDialog).toBeVisible();

  await resultDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(resultDialog).toBeHidden();
  await expect(preSaveTotal).toContainText('1');

  await page.reload();
  const reloadedWorkspace = page.getByTestId('suite-workspace');
  const history = page.getByRole('region', { name: 'Session history' });
  const totalTests = history.locator('.tw-stat').filter({ hasText: 'Total tests' });
  await expect(totalTests).toContainText('1');
  const pbPanel = reloadedWorkspace.getByRole('heading', { name: 'Personal best / pacer' }).locator('..');
  await expect(pbPanel).toContainText('Best');

  await reloadedWorkspace.getByRole('button', { name: 'Clear history…' }).click();
  const clearDialog = reloadedWorkspace.getByRole('alertdialog', { name: 'Clear local test history?' });
  await clearDialog.getByRole('button', { name: 'Clear history' }).click();
  await expect(totalTests).toContainText('0');
  await expect(pbPanel).toContainText('No comparable personal best yet.');
});

test('auto-finishes a forgiving target after an error and preserves the error in scoring', async ({ page }) => {
  await clearTypingDatabase(page);
  const workspace = await openWorkspace(page);

  await workspace.getByLabel('Mode').selectOption('custom');
  await workspace.getByLabel('Duration').selectOption('words');
  await wordCountSelect(workspace).selectOption('10');
  await workspace.getByLabel('Errors').selectOption('forgiving');
  await workspace.getByRole('button', { name: 'Paste text' }).click();

  const target = 'cat dog bird fish red blue green gold sun moon';
  const customDialog = workspace.getByRole('dialog', { name: 'Paste or edit custom text' });
  await customDialog.getByRole('textbox', { name: 'Custom text' }).fill(target);
  await customDialog.getByRole('button', { name: 'Use this text' }).click();

  const canvas = workspace.getByRole('textbox', { name: /Typing test canvas/i });
  await canvas.focus();
  await page.keyboard.type(`x${target.slice(1)}`, { delay: 8 });

  const resultDialog = workspace.getByRole('dialog', { name: 'Test result' });
  await expect(resultDialog).toBeVisible();
  const errorSummary = resultDialog.locator('.tw-summary > div').filter({ hasText: 'Errors' });
  await expect(errorSummary).toContainText('1');

  const jsonPromise = page.waitForEvent('download');
  await resultDialog.getByRole('button', { name: 'Export JSON' }).click();
  const exported = JSON.parse((await downloadBuffer(await jsonPromise)).toString('utf8'));
  expect(exported.test.finishReason).toBe('completed');
  expect(exported.test.incorrectChars).toBe(1);
  expect(exported.test.missedChars).toBe(1);
  expect(exported.test.accuracy).toBeLessThan(100);

  await expect(resultDialog).toBeVisible();
  await resultDialog.getByRole('button', { name: 'Discard' }).click();
  await expect(resultDialog).toBeHidden();
  await workspace.getByLabel('Errors').selectOption('master');
  await canvas.focus();
  await page.keyboard.type('x');
  await expect(resultDialog).toBeVisible();
  await expect(resultDialog.getByRole('button', { name: 'PDF certificate' })).toHaveCount(0);
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
  const importBundle = {
    ...bundle,
    tests: [
      { ...bundle.tests[0], id: 77, tags: ['legal'] },
      { ...bundle.tests[0], id: 78, tags: 'not-an-array' },
    ],
  };
  await importInput.setInputFiles({ name: 'typing-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importBundle)) });
  await expect(workspace).toContainText('Imported 1 test. Skipped 1 invalid record.');
  await expect(totalTests).toContainText('2');

  const filterInput = history.getByLabel('Filter by tag');
  await filterInput.fill('legal');
  const matchingTests = history.locator('.tw-stat').filter({ hasText: 'Matching tests' });
  await expect(matchingTests).toContainText('1');
  await expect(history.locator('tbody tr')).toHaveCount(1);

  await workspace.getByRole('button', { name: 'Export…' }).click();
  const filteredExportDialog = workspace.getByRole('dialog', { name: 'Export history' });
  const filteredJsonPromise = page.waitForEvent('download');
  await filteredExportDialog.getByRole('button', { name: 'Export JSON' }).click();
  const filteredBundle = JSON.parse((await downloadBuffer(await filteredJsonPromise)).toString('utf8'));
  expect(filteredBundle.tests).toHaveLength(1);
  expect(filteredBundle.tests[0].tags).toContain('legal');
  await page.keyboard.press('Escape');
  await filterInput.fill('');
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

  await writeTypingConfigPreference(page, {
    mode: 'not-a-mode',
    layout: 'not-a-layout',
    durationMode: 'time',
    durationValue: 999,
    fontSize: 999,
    audioVolume: 5,
    metronomeBpm: 999,
    pacerWpm: -20,
  });
  await page.reload();
  const restoredWorkspace = page.getByTestId('suite-workspace');
  await expect(restoredWorkspace.getByLabel('Mode')).toHaveValue('words-1000');
  await expect(restoredWorkspace.getByLabel('Layout')).toHaveValue('qwerty');
  await expect(restoredWorkspace.locator('label').filter({ hasText: /^\s*Seconds/ }).locator('select')).toHaveValue('30');
  await expect(restoredWorkspace.getByLabel('Font size')).toHaveValue('40');
  await expect(restoredWorkspace.getByLabel('Volume')).toHaveValue('1');

  await writeTypingConfigPreference(page, {
    mode: 'words-1000',
    durationMode: 'quote',
    durationValue: 120,
    quoteLength: 'short',
    language: 'english',
    layout: 'qwerty',
  });
  await page.reload();
  await expect(restoredWorkspace.getByLabel('Mode')).toHaveValue('quote');
  await expect(restoredWorkspace.getByLabel('Duration')).toHaveValue('quote');

  await writeTypingConfigPreference(page, {
    mode: 'custom',
    customText: '   ',
    durationMode: 'time',
    durationValue: 30,
    language: 'english',
    layout: 'qwerty',
  });
  await page.reload();
  await expect(restoredWorkspace.getByLabel('Mode')).toHaveValue('words-1000');

  await restoredWorkspace.getByLabel('Mode').selectOption('custom');
  await restoredWorkspace.getByRole('button', { name: 'Paste text' }).click();
  const emptyCustomDialog = restoredWorkspace.getByRole('dialog', { name: 'Paste or edit custom text' });
  await emptyCustomDialog.getByRole('textbox', { name: 'Custom text' }).fill('   ');
  await expect(emptyCustomDialog.getByRole('button', { name: 'Use this text' })).toBeDisabled();
});

test('has no serious or critical automated accessibility violations at rest', async ({ page }) => {
  const workspace = await openWorkspace(page);
  const results = await new AxeBuilder({ page })
    .include('.tw-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(workspace.locator('.tw-caret').first()).toHaveCSS('animation-name', 'none');
});

test('reflows without page-level horizontal overflow at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openWorkspace(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});