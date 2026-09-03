import { expect, test } from '@playwright/test';

test('RegexMatrix Portability Planner performs explicit safe rewrites and preserves manual blockers', async ({ page }) => {
  await page.goto('./#/regex-matrix');
  await page.getByLabel('Pattern').fill('(?<word>\\w+)\\s+\\k<word>');
  await page.getByRole('tab', { name: 'Portability' }).click();
  await page.getByLabel('Portability target').selectOption('python');
  await expect(page.getByTestId('portability-status')).toContainText(/safe rewrite/i);
  await expect(page.getByTestId('portability-preview')).toContainText('(?P<word>');
  await expect(page.getByTestId('portability-preview')).toContainText('(?P=word)');
  await page.getByRole('button', { name: 'Apply portability rewrite' }).click();
  await expect(page.getByRole('textbox', { name: 'Pattern', exact: true })).toHaveText('(?P<word>\\w+)\\s+(?P=word)');

  await page.getByLabel('Engine flavor').selectOption('ecmascript');
  await page.getByLabel('Pattern').fill('(?<=foo)bar');
  await page.getByLabel('Portability target').selectOption('go-re2');
  await expect(page.getByTestId('portability-status')).toContainText(/manual/i);
  await expect(page.getByTestId('portability-blockers')).toContainText(/lookbehind/i);
  await expect(page.getByRole('button', { name: 'Apply portability rewrite' })).toBeDisabled();
});
