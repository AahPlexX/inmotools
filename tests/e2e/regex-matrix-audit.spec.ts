import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

type StudioViewName = 'Editor' | 'Matches' | 'Explain';

const selectStudioViewWhenSegmented = async (page: import('@playwright/test').Page, name: StudioViewName) => {
  const navigation = page.getByRole('navigation', { name: 'Studio view' });
  if (await navigation.isVisible()) await navigation.getByRole('button', { name, exact: true }).click();
};

test('RegexMatrix advances zero-length Unicode matches by code point and exposes capped-result continuation', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByLabel('Pattern').fill('(?=)');
  await page.getByLabel('Flags').fill('gu');
  await page.getByLabel('Test subject').fill('😀');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await selectStudioViewWhenSegmented(page, 'Matches');
  await expect(page.getByTestId('match-count')).toHaveText('2');
  await expect(page.getByTestId('match-inspector')).toContainText('0–0');
  await expect(page.getByTestId('match-inspector')).toContainText('2–2');

  await selectStudioViewWhenSegmented(page, 'Editor');
  await page.getByLabel('Pattern').fill('a');
  await page.getByLabel('Flags').fill('g');
  await page.getByLabel('Test subject').fill('a'.repeat(5_001));
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await selectStudioViewWhenSegmented(page, 'Matches');
  await expect(page.getByTestId('match-count')).toHaveText('5001');
  await expect(page.getByTestId('match-limit-status')).toContainText('omitted 1 remaining match');
  await expect(page.getByRole('group', { name: 'Returned match pages' })).toBeVisible();
  await expect(page.getByTestId('match-inspector').locator('article')).toHaveCount(100);

  await page.getByTestId('continue-matches').click();
  await expect(page.getByTestId('match-count')).toHaveText('1');
  await expect(page.getByTestId('match-inspector')).toContainText('Match 5001');
  await expect(page.getByTestId('match-inspector')).toContainText('5000–5001');
});

test('RegexMatrix explanation pagination makes tokens after the initial slice reachable', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByLabel('Pattern').fill('(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)(n)(o)(p)(q)(r)(s)(t)');
  await selectStudioViewWhenSegmented(page, 'Explain');
  const pager = page.getByRole('group', { name: 'Explanation pages' });
  await expect(pager).toBeVisible();
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(pager).toContainText('Page 2');
  await expect(page.getByLabel('Regex structural explanation').locator('li')).not.toHaveCount(0);
});

test('RegexMatrix saved-session pagination and deletion expose every locally retained snapshot', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  const pattern = page.getByRole('textbox', { name: 'Pattern', exact: true });
  for (let index = 0; index < 13; index += 1) {
    await pattern.fill(`session-${index}`);
    await page.getByRole('button', { name: 'Save session' }).click();
  }

  await page.getByText(/Saved sessions \(13\)/).click();
  const pager = page.getByRole('group', { name: 'Saved session pages' });
  await expect(pager).toBeVisible();
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(pager).toContainText('Page 2 of 2');
  await expect(page.getByRole('button', { name: /Load saved session session-0/ })).toBeVisible();
  await page.getByRole('button', { name: /Delete saved session session-0/ }).click();
  await expect(page.getByText(/Saved sessions \(12\)/)).toBeVisible();
});

test('Python exposes JavaScript-compatible UTF-16 offsets and separates runtime startup from execution timing', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./#/regex-matrix');
  await page.getByLabel('Engine flavor').selectOption('python');
  await page.getByLabel('Pattern').fill('a');
  await page.getByLabel('Flags').fill('g');
  await page.getByLabel('Test subject').fill('😀a');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await selectStudioViewWhenSegmented(page, 'Matches');

  await expect(page.getByTestId('match-inspector')).toContainText('2–3');
  const timing = page.getByTestId('runtime-timing');
  await expect(timing).toContainText(/startup/i);
  await expect(timing).toContainText(/execution/i);
  await expect(timing).toContainText(/UTF-16/i);
});

test('Python and Oniguruma report the shared 5,000-record limit instead of silently implying completeness', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./#/regex-matrix');
  for (const flavor of ['oniguruma', 'python'] as const) {
    await selectStudioViewWhenSegmented(page, 'Editor');
    await page.getByLabel('Engine flavor').selectOption(flavor);
    await page.getByLabel('Pattern').fill('a');
    await page.getByLabel('Flags').fill('g');
    await page.getByLabel('Test subject').fill('a'.repeat(5_001));
    await page.getByRole('button', { name: 'Run pattern' }).click();
    await selectStudioViewWhenSegmented(page, 'Matches');
    await expect(page.getByTestId('match-count')).toHaveText('5001');
    await expect(page.getByTestId('match-limit-status')).toContainText('omitted 1 remaining match');
  }
});

test('replacement preview is isolated behind a worker watchdog and exposes cancellation without losing normal preview output', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await selectStudioViewWhenSegmented(page, 'Editor');
  await expect(page.getByTestId('replacement-preview-status')).toContainText(/worker/i);
  await expect(page.getByTestId('replacement-preview-status')).toContainText(/watchdog/i);
  await expect(page.getByRole('button', { name: 'Cancel replacement preview', exact: true })).toBeVisible();
  await expect(page.getByTestId('replacement-preview-output')).toContainText('Release: 2026/08/31');
});

test('match JSON export declares the UTF-16 coordinate system used by the UI', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByLabel('Pattern').fill('a');
  await page.getByLabel('Flags').fill('g');
  await page.getByLabel('Test subject').fill('😀a');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await selectStudioViewWhenSegmented(page, 'Matches');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export up to 100,000 matches', exact: true }).click();
  const file = await download;
  const payload = JSON.parse(await (await import('node:fs/promises')).readFile(await file.path() ?? '', 'utf8')) as {
    offsetUnit?: string;
    matches: Array<{ index: number; end: number }>;
  };
  expect(payload.offsetUnit).toBe('utf16-code-unit');
  expect(payload.matches[0]).toMatchObject({ index: 2, end: 3 });
});

for (const viewport of [
  { name: '320 portrait phone', width: 320, height: 568 },
  { name: '844 landscape phone', width: 844, height: 390 },
  { name: '768 tablet portrait', width: 768, height: 1024 },
]) {
  test(`RegexMatrix audit surface reflows without document overflow or blocking accessibility defects at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#/regex-matrix');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `document overflow at ${viewport.name}`).toBeLessThanOrEqual(1);
    const results = await new AxeBuilder({ page }).include('[data-testid="regex-matrix-workspace"]').analyze();
    const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
}
