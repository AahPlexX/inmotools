import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('RegexMatrix catalog, alias, and generic routes open the lazy local workspace', async ({ page }) => {
  await page.goto('./#/');
  const link = page.getByRole('link', { name: /RegexMatrix Studio & Academy/ });
  await expect(link).toHaveAttribute('href', '#/tools/regex-matrix');
  await link.click();
  await expect(page.getByTestId('regex-matrix-workspace')).toBeVisible();
  await page.goto('./#/regex-matrix');
  await expect(page.getByTestId('suite-title')).toContainText('RegexMatrix Studio & Academy');
  await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);
  await page.goto('./#/tools/regex-matrix');
  await expect(page.getByTestId('regex-matrix-workspace')).toBeVisible();
});

test('Studio executes matches, exposes diagnostics, and identifies a ReDoS hazard', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByLabel('Pattern').fill('(?<year>\\d{4})-(?<month>\\d{2})');
  await page.getByLabel('Flags').fill('g');
  await page.getByLabel('Test subject').fill('2026-08 2025-12');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await expect(page.getByTestId('match-count')).toHaveText('2');
  await expect(page.getByTestId('match-inspector')).toContainText('year');
  await expect(page.getByTestId('engine-status')).toContainText(/Execution/i);
  const railroad = page.getByTestId('railroad-projection');
  await expect(railroad).toBeVisible();
  await expect(railroad).toContainText(/year/i);
  await page.getByRole('button', { name: /Named capture group <year>/ }).click();
  await expect(page.getByTestId('railroad-selection')).toContainText(/0–/);

  await page.getByLabel('Pattern').fill('(a+)+$');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await expect(page.getByTestId('redos-status')).toContainText(/hazard|unsafe|critical/i);
});

test('Oniguruma executes locally and the pattern editor offers flavor-aware completions', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByLabel('Engine flavor').selectOption('oniguruma');
  await expect(page.getByTestId('engine-status')).toContainText(/Execution.*Oniguruma/i);

  const pattern = page.getByRole('textbox', { name: 'Pattern', exact: true });
  await pattern.fill('foo|bar');
  await page.getByLabel('Flags').fill('g');
  await page.getByLabel('Test subject').fill('foo baz bar');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await expect(page.getByTestId('match-count')).toHaveText('2');
  await expect(page.getByTestId('engine-status')).toContainText(/Oniguruma/i);

  await pattern.fill('(?P');
  await pattern.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('(?P<name>a)');
});

test('Academy lesson can be completed and opened in Studio', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByRole('button', { name: 'Academy' }).click();
  await expect(page.getByTestId('academy-panel')).toBeVisible();
  await page.getByRole('button', { name: /Negative Lookahead/ }).click();
  await page.getByLabel('Academy solution').fill('^(?!admin)[a-z0-9_]{5,12}$');
  await page.getByRole('button', { name: 'Check solution' }).click();
  await expect(page.getByTestId('lesson-status')).toContainText(/complete/i);
  await page.getByRole('button', { name: 'Open in Studio' }).click();
  await expect(page.getByRole('button', { name: 'Studio' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Pattern' })).toHaveText('^(?!admin)[a-z0-9_]{5,12}$');
});

test('RegexMatrix remains accessible and avoids document overflow on the active viewport', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(severe).toEqual([]);
});

test('Studio exports YAML and generated code downloads', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  const yamlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export test YAML' }).click();
  expect((await yamlDownload).suggestedFilename()).toBe('regex-matrix-tests.yaml');

  const codeDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export code' }).click();
  expect((await codeDownload).suggestedFilename()).toMatch(/regex-matrix-typescript\.ts$/);
});

test('Studio session snapshots can be saved and restored locally', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  const patternEditor = page.getByRole('textbox', { name: 'Pattern', exact: true });
  await patternEditor.fill('saved-pattern');
  await page.getByRole('button', { name: 'Save session' }).click();
  await patternEditor.fill('changed-pattern');
  await page.getByText(/Saved sessions \(1\)/).click();
  await page.getByRole('button', { name: /Load saved session saved-pattern/ }).click();
  await expect(page.getByRole('textbox', { name: 'Pattern' })).toHaveText('saved-pattern');
});

test('RegexMatrix keyboard accelerators switch modes and submit Academy work', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await expect(page.getByTestId('regex-matrix-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Studio' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+M');
  await expect(page.getByRole('button', { name: 'Academy' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Negative Lookahead/ }).click();
  await page.getByLabel('Academy solution').fill('^(?!admin)[a-z0-9_]{5,12}$');
  await page.getByLabel('Academy solution').press('Control+Enter');
  await expect(page.getByTestId('lesson-status')).toContainText(/complete/i);
  await page.keyboard.press('Control+M');
  await expect(page.getByRole('button', { name: 'Studio' })).toHaveAttribute('aria-pressed', 'true');
});

test('Mobile Studio uses segmented work views without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/regex-matrix');
  const switcher = page.getByRole('navigation', { name: 'Studio view' });
  await expect(switcher).toBeVisible();
  await page.getByRole('button', { name: 'Matches', exact: true }).click();
  await expect(page.getByTestId('match-inspector')).toBeVisible();
  await expect(page.getByLabel('Test subject')).not.toBeVisible();
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.getByLabel('Regex structural explanation')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});



test('RegexMatrix parity workbench exposes benchmark, reference, list export, debugger, and synthesis', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await expect(page.getByTestId('regex-matrix-workspace')).toBeVisible();

  await page.getByRole('tab', { name: 'Reference' }).click();
  await page.getByLabel('Search regex reference').fill('lookbehind');
  await expect(page.getByTestId('regex-reference-results')).toContainText(/lookbehind/i);

  await page.getByRole('tab', { name: 'Benchmark' }).click();
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await expect(page.getByTestId('benchmark-summary')).toContainText(/median|p95/i);

  await page.getByRole('tab', { name: 'List & export' }).click();
  await page.getByLabel('Pattern').fill('\\w+');
  await page.getByLabel('Flags').fill('g');
  await page.getByLabel('Test subject').fill('alpha beta');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await expect(page.getByTestId('match-export-preview')).toContainText('alpha');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export matches CSV' }).click();
  expect((await download).suggestedFilename()).toBe('regex-matrix-matches.csv');

  await page.getByRole('tab', { name: 'Debugger' }).click();
  await expect(page.getByTestId('debugger-step')).toContainText(/step/i);
  await page.getByRole('button', { name: 'Next debug step' }).click();

  await page.getByRole('tab', { name: 'Synthesize' }).click();
  await page.getByLabel('Positive synthesis samples').fill('123\n456\n789');
  await page.getByLabel('Negative synthesis samples').fill('12a\n1234');
  await page.getByRole('button', { name: 'Generate candidates' }).click();
  await expect(page.getByTestId('synthesis-candidates')).toContainText('\\d');
});

test('RegexMatrix Academy includes SEO course and deterministic practice lab', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByRole('button', { name: 'Academy' }).click();
  await expect(page.getByRole('heading', { name: 'Regex for SEO' })).toBeVisible();
  await page.getByRole('button', { name: 'Practice Lab' }).click();
  await expect(page.getByTestId('practice-lab')).toContainText(/challenge|practice/i);
});

test('Python re executes locally with Python-only named groups', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByLabel('Engine flavor').selectOption('python');
  await expect(page.getByTestId('engine-status')).toContainText(/Execution.*Python/i);
  await page.getByLabel('Pattern').fill('(?P<word>\\w+)');
  await page.getByLabel('Flags').fill('g');
  await page.getByLabel('Test subject').fill('alpha beta');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await expect(page.getByTestId('match-count')).toHaveText('2');
  await expect(page.getByTestId('match-inspector')).toContainText('word');
  await expect(page.getByTestId('match-inspector')).toContainText('alpha');
});

test('Regex crossword validates row and column constraints', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByRole('button', { name: 'Academy' }).click();
  await page.getByRole('button', { name: 'Practice Lab' }).click();
  await page.getByRole('button', { name: 'Regex Crossword' }).click();
  await expect(page.getByTestId('regex-crossword')).toBeVisible();
  const values = ['C','A','T','A','R','E','R','E','D'];
  for (let index = 0; index < values.length; index += 1) {
    const row = Math.floor(index / 3) + 1;
    const column = (index % 3) + 1;
    await page.getByLabel(`Crossword cell ${row},${column}`).fill(values[index]!);
  }
  await page.getByRole('button', { name: 'Check crossword' }).click();
  await expect(page.getByTestId('crossword-status')).toContainText(/complete/i);
});

test('Custom Academy tracks import locally, persist, export, and open in Studio', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByRole('button', { name: 'Academy' }).click();
  await page.getByRole('button', { name: 'Custom Tracks' }).click();
  const payload = JSON.stringify({ schemaVersion: 1, track: { id: 'team-basics', title: 'Team Regex Basics', lessons: [{ id: 'digits-only', title: 'Digits only', objective: 'Match only digits.', guide: 'Anchor the expression and require one or more digits.', starter: '^\\d+$', flags: '', hint: 'Use anchors.', cases: [{ value: '123', shouldMatch: true }, { value: '12a', shouldMatch: false }] }] } });
  await page.getByLabel('Custom track JSON').fill(payload);
  await page.getByRole('button', { name: 'Import custom track' }).click();
  await expect(page.getByTestId('custom-track-library')).toContainText('Team Regex Basics');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Team Regex Basics' }).click();
  expect((await download).suggestedFilename()).toBe('regex-matrix-track-team-basics.json');
  await page.getByRole('button', { name: 'Open custom lesson Digits only' }).click();
  await expect(page.getByRole('button', { name: 'Studio' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Pattern', exact: true })).toHaveText('^\\d+$');
});

