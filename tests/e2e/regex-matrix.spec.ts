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

  await page.getByLabel('Pattern').fill('(a+)+$');
  await page.getByRole('button', { name: 'Run pattern' }).click();
  await expect(page.getByTestId('redos-status')).toContainText(/hazard|unsafe|critical/i);
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
  await expect(page.getByLabel('Pattern')).toHaveValue('^(?!admin)[a-z0-9_]{5,12}$');
});

test('RegexMatrix remains accessible and avoids document overflow on the active viewport', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(severe).toEqual([]);
});
