import { expect, test, type Page } from '@playwright/test';

const ROUTE = './#/tools/tabular-sheet-workstation';

async function openWorkspace(page: Page) {
  await page.goto(ROUTE);
  const workspace = page.getByTestId('suite-workspace');
  await expect(workspace.getByTestId('tabular-sheet-workspace')).toBeVisible();
  return workspace;
}

test('exposes Stage 2 formula SSOT, format, style, wrap, and tap-safe formula help', async ({ page }) => {
  const workspace = await openWorkspace(page);

  await expect(workspace.getByTestId('tsw-formula-ssot')).toHaveText('portable-dag');
  await workspace.getByRole('cell', { name: '2.5' }).click();
  await workspace.getByTestId('tsw-number-format').selectOption('$#,##0.00');
  await expect(workspace.getByRole('cell', { name: '$2.50' })).toBeVisible();

  await workspace.getByRole('cell', { name: 'Paper' }).click();
  await workspace.getByTestId('tsw-style-chrome').getByRole('button', { name: 'Bold' }).click();
  await expect(workspace.getByTestId('tsw-style-chrome').getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  await workspace.getByTestId('tsw-wrap').click();
  await expect(workspace.getByTestId('tsw-wrap')).toHaveAttribute('aria-pressed', 'true');
  await workspace.getByTestId('tsw-overflow').selectOption('clip');
  await expect(workspace.getByTestId('tsw-overflow')).toHaveValue('clip');

  await workspace.getByTestId('tsw-formula-help').click();
  const tip = workspace.getByTestId('tsw-formula-tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute('data-trigger', 'focus-or-tap');
  await tip.getByRole('button', { name: 'Close formula help' }).click();
  await expect(tip).toHaveCount(0);
});

test('enforces column autofilter, validation, and conditional-format editor hooks', async ({ page }) => {
  const workspace = await openWorkspace(page);

  await workspace.getByRole('button', { name: 'Filter column A' }).click();
  const filter = workspace.getByTestId('tsw-autofilter');
  await expect(filter).toBeVisible();
  await filter.getByLabel('Contains').fill('paper');
  await filter.getByRole('button', { name: 'Apply filter' }).click();
  await expect(workspace.getByRole('cell', { name: 'Paper' })).toBeVisible();
  await expect(workspace.getByRole('cell', { name: 'Ink' })).toHaveCount(0);

  await workspace.getByRole('button', { name: 'Save validation' }).click();
  await expect(workspace.getByTestId('tsw-validation-editor')).toContainText('B2:B3');
  await workspace.getByRole('cell', { name: '4' }).click();
  await workspace.locator('#tsw-formula').fill('8');
  await workspace.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(workspace.getByTestId('tsw-validation-status')).toContainText('Qty must be 2, 4, or 6.');
  await expect(workspace.locator('#tsw-formula')).toHaveValue('8');

  await workspace.getByRole('button', { name: 'Save CF rule' }).click();
  await expect(workspace.getByTestId('tsw-cf-editor')).toContainText('B2:B3');
  await expect(workspace.getByTestId('tsw-cf-editor')).toContainText('gt');
});

test('opens the reserved context menu from right-click and long-press', async ({ page }) => {
  const workspace = await openWorkspace(page);
  const paper = workspace.getByRole('cell', { name: 'Paper' });
  await paper.click({ button: 'right' });
  const menu = workspace.getByTestId('tsw-context-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copy' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await paper.dispatchEvent('pointerdown', { clientX: 80, clientY: 180 });
  await page.waitForTimeout(550);
  await expect(workspace.getByTestId('tsw-context-menu')).toBeVisible();
});

test('keeps Stage 2 chrome readable at a 320 CSS-pixel portrait viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const workspace = await openWorkspace(page);
  await expect(workspace.getByTestId('tsw-style-chrome')).toBeVisible();
  await expect(workspace.getByTestId('tsw-formula-ssot')).toBeVisible();
  await expect(workspace.getByTestId('tsw-grid-scroll')).toBeVisible();
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflowX).toBeLessThanOrEqual(8);
});

test('mounts Univer engine-formula as the live formula SSOT', async ({ page }) => {
  test.setTimeout(60_000);
  const workspace = await openWorkspace(page);
  await workspace.getByLabel('Engine').selectOption('univer');
  const host = workspace.getByTestId('univer-host');
  await expect(host).toBeVisible({ timeout: 45_000 });
  await expect(workspace.getByTestId('tsw-formula-ssot')).toHaveText('univer-engine-formula', { timeout: 45_000 });
  await expect(host).toHaveAttribute('data-formula-ssot', 'univer-engine-formula');
});
