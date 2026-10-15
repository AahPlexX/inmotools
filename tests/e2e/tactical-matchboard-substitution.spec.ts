import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await page.goto('./#/tools/tactical-matchboard-studio');
  await expect(page.getByTestId('suite-workspace').getByRole('heading', {
    name: 'Tactical Matchboard Studio',
    exact: true,
  })).toBeVisible();
});

test('authors a timed substitution and swaps the two player tokens at the authored millisecond', async ({ page }) => {
  const setup = page.locator('.tactical-setup').first();
  await setup.getByRole('combobox', { name: /Formation/ }).selectOption('ussf-4v4-1-2-1');
  await page.getByRole('button', { name: 'Build board' }).click();
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(4);

  await page.locator('.tactical-player-list button').nth(3).click();
  await page.getByText('Squad, props and presentation', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('substitute');
  await page.getByRole('button', { name: 'Save token' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Roster token updated');
  await expect(page.locator('#token-1')).toHaveCount(1);
  await expect(page.locator('#token-4')).toHaveCount(0);

  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Outgoing player').selectOption('token-1');
  await page.getByLabel('Incoming player').selectOption('token-4');
  await page.getByLabel('Substitution time (ms)').fill('2000');
  await page.getByRole('button', { name: 'Add timed substitution' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Timed substitution authored at 2000 ms');

  await page.getByLabel('Playhead (ms)').fill('1999');
  await page.getByRole('button', { name: 'Set playhead' }).click();
  await expect(page.locator('#token-1')).toHaveCount(1);
  await expect(page.locator('#token-4')).toHaveCount(0);

  await page.getByLabel('Playhead (ms)').fill('2000');
  await page.getByRole('button', { name: 'Set playhead' }).click();
  await expect(page.locator('#token-1')).toHaveCount(0);
  await expect(page.locator('#token-4')).toHaveCount(1);
});
