import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CLIENT_VIEWPORTS } from '../../src/tools/sheets/sheets-parity';

const ROUTE = './#/tools/tabular-sheet-workstation';

async function openWorkspace(page: Page) {
  await page.goto(ROUTE);
  const workspace = page.getByTestId('suite-workspace');
  await expect(workspace.getByTestId('tabular-sheet-workspace')).toBeVisible();
  return workspace;
}

function gridCell(workspace: ReturnType<Page['getByTestId']>, name: string) {
  return workspace.getByTestId('tsw-grid-scroll').getByRole('cell', { name, exact: true });
}

test('exposes Stage 2 formula SSOT, format, style, wrap, and tap-safe formula help', async ({ page }) => {
  const workspace = await openWorkspace(page);

  await expect(workspace.getByTestId('tsw-formula-ssot')).toHaveText('portable-dag');
  await gridCell(workspace, '2.5').click();
  await workspace.getByTestId('tsw-number-format').selectOption('$#,##0.00');
  await expect(gridCell(workspace, '$2.50')).toBeVisible();

  await gridCell(workspace, 'Paper').click();
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
  await expect(gridCell(workspace, 'Paper')).toBeVisible();
  await expect(gridCell(workspace, 'Ink')).toHaveCount(0);

  await workspace.getByRole('button', { name: 'Save validation' }).click();
  await expect(workspace.getByTestId('tsw-validation-editor')).toContainText('B2:B3');
  await gridCell(workspace, '4').click();
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
  const paper = gridCell(workspace, 'Paper');
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

test('selects a range, paints a merge, and writes column width', async ({ page }) => {
  const workspace = await openWorkspace(page);
  await gridCell(workspace, 'Paper').click();
  await gridCell(workspace, 'Ink').click({ modifiers: ['Shift'] });
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('A2:A3');
  await workspace.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(workspace.locator('td[data-row="1"][data-col="0"]')).toHaveAttribute('rowspan', '2');
  await workspace.getByRole('button', { name: 'Unmerge' }).click();
  await expect(workspace.locator('td[data-row="1"][data-col="0"]')).not.toHaveAttribute('rowspan', '2');
  await workspace.getByTestId('tsw-col-width').fill('140');
  await expect(workspace.locator('td[data-row="1"][data-col="0"]')).toHaveAttribute('data-col-width', '140');
  await gridCell(workspace, '2.5').click();
  await workspace.getByRole('button', { name: 'Freeze' }).click();
  await expect(workspace.locator('td[data-row="0"][data-col="0"]')).toHaveAttribute('data-frozen-row', 'true');
});

test('has no serious or critical axe violations in the local grid', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One focused axe pass covers the shared workspace DOM.');
  const workspace = await openWorkspace(page);
  await expect(workspace.getByTestId('tsw-grid-scroll')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-testid="tabular-sheet-workspace"]')
    .exclude('.tsw-univer-host')
    .analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
});

test('exposes paste special, AutoSum, insert function, go to, and list picker', async ({ page }) => {
  const workspace = await openWorkspace(page);
  await expect(workspace.getByTestId('tsw-parity-chrome')).toBeVisible();
  await workspace.getByTestId('tsw-insert-function').click();
  const functions = workspace.getByTestId('tsw-insert-function-list');
  await expect(functions).toBeVisible();
  await functions.getByRole('button', { name: /SUM —/ }).click();
  await expect(workspace.locator('#tsw-formula')).toHaveValue('=SUM(');
  await expect(workspace.getByTestId('tsw-formula-tooltip')).toBeVisible();

  await gridCell(workspace, '4').click();
  await gridCell(workspace, '2').click({ modifiers: ['Shift'] });
  await workspace.getByTestId('tsw-autosum').click();
  await expect(workspace.locator('#tsw-formula')).toHaveValue('=SUM(B2:B3)');

  await workspace.getByTestId('tsw-goto-a1').fill('D2');
  await workspace.getByTestId('tsw-goto-apply').click();
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('D2');

  await workspace.getByRole('button', { name: 'Save validation' }).click();
  await gridCell(workspace, '4').click();
  await expect(workspace.getByTestId('tsw-list-picker')).toBeVisible();
  await workspace.getByTestId('tsw-list-picker').selectOption('6');
  await expect(workspace.locator('#tsw-formula')).toHaveValue('6');

  await expect(workspace.getByTestId('tsw-named-ranges')).toContainText('TaxRate');
  await expect(workspace.getByTestId('tsw-chart-kind')).toHaveValue('column');
  await workspace.getByTestId('tsw-custom-format').fill('0.0');
  await workspace.getByTestId('tsw-apply-custom-format').click();
  await expect(workspace.getByTestId('tsw-print')).toBeVisible();
  await expect(workspace.getByTestId('tsw-protect')).toBeVisible();
});

test('opens paste-special and clear-all from the click and long-press menu', async ({ page }) => {
  const workspace = await openWorkspace(page);
  const paper = gridCell(workspace, 'Paper');
  await paper.click({ button: 'right' });
  const menu = workspace.getByTestId('tsw-context-menu');
  await expect(menu.getByRole('menuitem', { name: 'Paste values' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Clear contents' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Clear all' })).toBeVisible();
  await page.keyboard.press('Escape');
  await paper.dispatchEvent('pointerdown', { clientX: 80, clientY: 180 });
  await page.waitForTimeout(550);
  await expect(workspace.getByTestId('tsw-context-menu')).toBeVisible();
});

for (const viewport of CLIENT_VIEWPORTS) {
  test(`keeps parity chrome readable at ${viewport.name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Viewport matrix is CSS-width proof, not a single phone profile.');
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const workspace = await openWorkspace(page);
    await expect(workspace.getByTestId('tsw-parity-chrome')).toBeVisible();
    await expect(workspace.getByTestId('tsw-formula-help')).toBeVisible();
    await expect(workspace.getByTestId('tsw-insert-function')).toBeVisible();
    await expect(workspace.getByTestId('tsw-grid-scroll')).toBeVisible();
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowX, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(8);
    await workspace.getByTestId('tsw-formula-help').click();
    await expect(workspace.getByTestId('tsw-formula-tooltip')).toHaveAttribute('data-trigger', 'focus-or-tap');
    await workspace.getByRole('button', { name: 'Close formula help' }).click();
    await gridCell(workspace, 'Paper').dispatchEvent('pointerdown', { clientX: 40, clientY: 160 });
    await page.waitForTimeout(550);
    await expect(workspace.getByTestId('tsw-context-menu')).toBeVisible();
  });
}

test('mounts Univer engine-formula as the live formula SSOT', async ({ page }) => {
  test.setTimeout(60_000);
  const workspace = await openWorkspace(page);
  await workspace.getByLabel('Engine').selectOption('univer');
  const host = workspace.getByTestId('univer-host');
  await expect(host).toBeVisible({ timeout: 45_000 });
  await expect(workspace.getByTestId('tsw-formula-ssot')).toHaveText('univer-engine-formula', { timeout: 45_000 });
  await expect(host).toHaveAttribute('data-formula-ssot', 'univer-engine-formula');
});
