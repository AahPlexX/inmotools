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
