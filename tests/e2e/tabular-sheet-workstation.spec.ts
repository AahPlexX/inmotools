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

function cellAt(workspace: ReturnType<Page['getByTestId']>, row: number, col: number) {
  return workspace.locator(`td[data-row="${row}"][data-col="${col}"]`);
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
  await cellAt(workspace, 1, 2).click({ force: true });
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
  for (const name of ['SUM', 'AVERAGE', 'IF', 'VLOOKUP', 'XLOOKUP', 'INDEX-MATCH', 'TEXTJOIN', 'COUNTIF', 'SUMIF', 'FILTER', 'SORT', 'UNIQUE']) {
    await expect(functions.getByRole('button', { name: new RegExp(`^${name} `) })).toBeVisible();
  }
  await functions.getByRole('button', { name: /^SUM —/ }).click();
  await expect(workspace.locator('#tsw-formula')).toHaveValue('=SUM(');
  await expect(workspace.getByTestId('tsw-formula-tooltip')).toBeVisible();
  await workspace.getByRole('button', { name: 'Close formula help' }).click();

  await workspace.getByTestId('tsw-goto-a1').fill('B4');
  await workspace.getByTestId('tsw-goto-apply').click();
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('B4');
  await workspace.getByTestId('tsw-autosum').click();
  await expect(workspace.locator('#tsw-formula')).toHaveValue('=SUM(B2:B3)');

  await workspace.getByRole('button', { name: 'Save validation' }).click();
  await workspace.getByTestId('tsw-goto-a1').fill('B2');
  await workspace.getByTestId('tsw-goto-apply').click();
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('B2');
  await expect(workspace.getByTestId('tsw-list-picker')).toBeVisible();
  await workspace.getByTestId('tsw-list-picker').selectOption('6');
  await expect(workspace.locator('#tsw-formula')).toHaveValue('6');

  await workspace.getByTestId('tsw-goto-a1').fill('D2');
  await workspace.getByTestId('tsw-goto-apply').click();
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('D2');

  await expect(workspace.getByTestId('tsw-named-ranges')).toContainText('TaxRate');
  await expect(workspace.getByTestId('tsw-chart-kind')).toHaveValue('column');
  await expect(workspace.getByTestId('tsw-fill-down')).toBeVisible();
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
    test.skip(
      testInfo.project.name !== 'desktop-chromium',
      'P16 proof is a CSS-width portrait+landscape matrix on desktop-chromium. iPhone 13 / mobile-chromium is not accepted as the sole mobile gate.',
    );
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const workspace = await openWorkspace(page);
    await expect(workspace.getByTestId('tsw-parity-chrome')).toBeVisible();
    await expect(workspace.getByTestId('tsw-formula-help')).toBeVisible();
    await expect(workspace.getByTestId('tsw-insert-function')).toBeVisible();
    await expect(workspace.getByTestId('tsw-grid-scroll')).toBeVisible();
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowX, `${viewport.name} ${viewport.orientation} horizontal overflow`).toBeLessThanOrEqual(8);
    await workspace.getByTestId('tsw-formula-help').click();
    const tip = workspace.getByTestId('tsw-formula-tooltip');
    await expect(tip).toHaveAttribute('data-trigger', 'focus-or-tap');
    await expect(tip).not.toHaveAttribute('data-trigger', 'hover');
    await workspace.getByRole('button', { name: 'Close formula help' }).click();
    await expect(tip).toHaveCount(0);
    await expect(cellAt(workspace, 1, 0)).toBeVisible();
    await gridCell(workspace, 'Paper').dispatchEvent('pointerdown', { clientX: 40, clientY: 160 });
    await page.waitForTimeout(550);
    const menu = workspace.getByTestId('tsw-context-menu');
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox, `${viewport.name} context menu has a box`).toBeTruthy();
    expect(menuBox!.y, `${viewport.name} context menu top`).toBeGreaterThanOrEqual(-1);
    expect(menuBox!.y + menuBox!.height, `${viewport.name} context menu bottom`).toBeLessThanOrEqual(viewport.height + 1);
    expect(menuBox!.x, `${viewport.name} context menu left`).toBeGreaterThanOrEqual(-1);
    expect(menuBox!.x + menuBox!.width, `${viewport.name} context menu right`).toBeLessThanOrEqual(viewport.width + 1);
  });
}

test('keeps the 320x740 context menu in-viewport and dismisses it after focus is blurred', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const workspace = await openWorkspace(page);
  await gridCell(workspace, 'Paper').click({ button: 'right' });
  const menu = workspace.getByTestId('tsw-context-menu');
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).toBeTruthy();
  expect(menuBox!.y).toBeGreaterThanOrEqual(-1);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(741);
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('opens formula help when the formula bar receives focus without an equals sign', async ({ page }) => {
  const workspace = await openWorkspace(page);
  await cellAt(workspace, 0, 0).click();
  await expect(workspace.locator('#tsw-formula')).toHaveValue('Item');
  await workspace.locator('#tsw-formula').focus();
  const tip = workspace.getByTestId('tsw-formula-tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute('data-trigger', 'focus-or-tap');
});

test('types into a clicked cell and moves the selection with ArrowUp', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const workspace = await openWorkspace(page);
  await cellAt(workspace, 5, 0).click();
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('A6');
  await page.keyboard.type('10');
  await page.keyboard.press('Enter');
  await expect(cellAt(workspace, 5, 0)).toHaveText('10');
  await cellAt(workspace, 6, 0).click();
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('A7');
  await page.keyboard.press('ArrowUp');
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('A6');
  await page.keyboard.press('Enter');
  await expect(workspace.getByTestId('tsw-selection')).toHaveText('A6');
  await expect(cellAt(workspace, 5, 0)).toHaveText('10');
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

test('spills FILTER into an empty neighbor and keeps a saved cell comment', async ({ page }) => {
  const workspace = await openWorkspace(page);
  await gridCell(workspace, 'Paper').click();
  await workspace.locator('#tsw-note').fill('Keep this note');
  await workspace.getByRole('button', { name: 'Save note' }).click();
  await expect(cellAt(workspace, 1, 0)).toHaveAttribute('data-note', 'true');

  await workspace.getByTestId('tsw-goto-a1').fill('F2');
  await workspace.getByTestId('tsw-goto-apply').click();
  await workspace.locator('#tsw-formula').fill('=FILTER(A2:A3,B2:B3>=2)');
  await workspace.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(cellAt(workspace, 1, 5)).toHaveText('Paper');
  await expect(cellAt(workspace, 2, 5)).toHaveText('Ink');
  await expect(cellAt(workspace, 2, 5)).toHaveAttribute('data-spill', 'true');
});

test('creates a local PivotTable on a new sheet and reads GETPIVOTDATA', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const workspace = await openWorkspace(page);
  await workspace.getByTestId('tsw-pivot-source').fill('A1:B3');
  await workspace.getByTestId('tsw-pivot-role-0').selectOption('row');
  await workspace.getByTestId('tsw-pivot-role-1').selectOption('value');
  await workspace.getByTestId('tsw-pivot-create').click();
  const pivotTab = workspace.getByRole('tab', { name: 'Pivot1' });
  await expect(pivotTab).toBeVisible();
  await pivotTab.click();
  await expect(cellAt(workspace, 0, 0)).toHaveText('Item');
  await expect(cellAt(workspace, 1, 0)).toHaveText('Ink');
  await expect(cellAt(workspace, 1, 1)).toHaveText('2');
  await expect(cellAt(workspace, 2, 0)).toHaveText('Paper');
  await expect(cellAt(workspace, 2, 1)).toHaveText('4');
  await expect(cellAt(workspace, 3, 1)).toHaveText('6');

  await workspace.getByRole('tab', { name: 'Sheet1' }).click();
  await workspace.getByTestId('tsw-goto-a1').fill('F2');
  await workspace.getByTestId('tsw-goto-apply').click();
  await workspace.locator('#tsw-formula').fill('=GETPIVOTDATA("Qty",Pivot1!A1,"Item","Paper")');
  await workspace.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(cellAt(workspace, 1, 5)).toHaveText('4');

  await workspace.getByTestId('tsw-goto-a1').fill('B2');
  await workspace.getByTestId('tsw-goto-apply').click();
  await workspace.locator('#tsw-formula').fill('10');
  await workspace.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(cellAt(workspace, 1, 5)).toHaveText('10');
  await workspace.getByRole('tab', { name: 'Pivot1' }).click();
  await expect(cellAt(workspace, 2, 1)).toHaveText('10');
  await expect(cellAt(workspace, 3, 1)).toHaveText('12');
});

test('keeps pivot chrome usable at 320 CSS px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const workspace = await openWorkspace(page);
  const create = workspace.getByTestId('tsw-pivot-create');
  await create.scrollIntoViewIfNeeded();
  await expect(workspace.getByTestId('tsw-pivot-chrome')).toBeVisible();
  await expect(create).toBeVisible();
  await expect(workspace.getByTestId('tsw-pivot-refresh')).toBeVisible();
  await expect(workspace.getByTestId('tsw-pivot-role-0')).toBeVisible();
  const box = await workspace.getByTestId('tsw-pivot-chrome').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(321);
});

