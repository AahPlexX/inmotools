import { expect, test, type Page } from '@playwright/test';

// Matches GRID_SIZE in src/tools/logic/geometry.ts. The canvas starts at pan
// (0,0) and zoom 1, so a grid coordinate (gx, gy) sits at pixel (gx*GRID, gy*GRID)
// relative to the canvas element, and this suite places/wires components at
// exact multiples of GRID to land precisely on ports and pass through no drag.
const GRID = 24;

// On a narrow viewport the palette lives in a slide-over sheet toggled by the
// "Components" button; open it first so its buttons are actually reachable.
const ensurePaletteOpen = async (page: Page) => {
  const toggle = page.getByRole('button', { name: 'Components' });
  const palette = page.getByTestId('logic-palette');
  if ((await toggle.isVisible()) && !(await palette.evaluate((element) => element.classList.contains('sheet-open')))) {
    await toggle.click();
  }
};

const placeAt = async (page: Page, paletteLabel: string, gx: number, gy: number) => {
  await expect(page.getByTestId('logic-workspace')).toBeVisible();
  await ensurePaletteOpen(page);
  const palette = page.getByTestId('logic-palette');
  await palette.getByRole('button', { name: paletteLabel, exact: true }).click();
  await page.getByTestId('logic-canvas').click({ position: { x: gx * GRID, y: gy * GRID } });
  await page.keyboard.press('Escape');
};

const wire = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  const canvas = page.getByTestId('logic-canvas');
  await canvas.click({ position: from });
  await canvas.click({ position: to });
};

test('builds a two-switch AND circuit and verifies it through the truth table and electrical rule check', async ({ page }) => {
  await page.goto('./#/tools/digital-logic-workstation');
  await expect(page.getByTestId('suite-title')).toContainText('Digital Logic Workstation');
  await expect(page.getByTestId('logic-canvas')).toBeVisible();

  await placeAt(page, 'SWITCH', 1, 1);
  await placeAt(page, 'SWITCH', 1, 4);
  await placeAt(page, 'AND', 5, 2);
  await placeAt(page, 'LED', 9, 2);

  // Switch A (grid 1,1) output pin -> AND gate (grid 5,2) input A
  await wire(page, { x: (1 + 1) * GRID, y: 1 * GRID }, { x: 5 * GRID, y: 2 * GRID });
  // Switch B (grid 1,4) output pin -> AND gate input B
  await wire(page, { x: (1 + 1) * GRID, y: 4 * GRID }, { x: 5 * GRID, y: 3 * GRID });
  // AND gate output Y -> LED (grid 9,2) input. The 2-input AND's Y pin sits
  // at grid y = component.y + inputCount/2 = 2 + 1 = 3 (centered on the
  // gate's actual drawn tip, not the pre-fix (count-1)/2 = 2.5 offset).
  await wire(page, { x: (5 + 2) * GRID, y: 3 * GRID }, { x: 9 * GRID, y: 2 * GRID });

  await page.getByRole('button', { name: 'Check circuit (ERC)' }).click();
  const ercDock = page.getByTestId('logic-erc-dock');
  await expect(ercDock).toBeVisible();
  await expect(ercDock).toContainText('No floating inputs');

  await page.getByRole('button', { name: 'Truth table' }).click();
  const truthDock = page.getByTestId('logic-truth-table-dock');
  await expect(truthDock).toBeVisible();
  const rows = truthDock.locator('tbody tr');
  await expect(rows).toHaveCount(4);
  const rowTexts = await rows.allTextContents();
  const onlyTrueRow = rowTexts.filter((text) => text.trim().endsWith('1'));
  expect(onlyTrueRow).toHaveLength(1);
  expect(onlyTrueRow[0]!.trim()).toBe('111');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SVG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
});

test('undo removes the last placed component', async ({ page }) => {
  await page.goto('./#/tools/digital-logic-workstation');
  await placeAt(page, 'SWITCH', 2, 2);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
});

test('Escape cancels an in-progress wire instead of silently completing it on the next click', async ({ page }) => {
  await page.goto('./#/tools/digital-logic-workstation');
  await placeAt(page, 'SWITCH', 1, 1);
  await placeAt(page, 'LED', 5, 1);
  const canvas = page.getByTestId('logic-canvas');

  // Start a wire from the switch's output pin, then cancel it.
  await canvas.click({ position: { x: (1 + 1) * GRID, y: 1 * GRID } });
  await page.keyboard.press('Escape');
  // If Escape had not cancelled the draft, this click on the LED's input pin
  // would silently complete the switch -> LED wire it started.
  await canvas.click({ position: { x: 5 * GRID, y: 1 * GRID } });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Check circuit (ERC)' }).click();
  const ercDock = page.getByTestId('logic-erc-dock');
  await expect(ercDock).toContainText('floating');
});

test('opens a keyboard shortcuts reference panel listing the functional default bindings', async ({ page }) => {
  await page.goto('./#/tools/digital-logic-workstation');
  await expect(page.getByTestId('logic-shortcuts-dock')).toBeHidden();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const dock = page.getByTestId('logic-shortcuts-dock');
  await expect(dock).toBeVisible();
  await expect(dock).toContainText('Space');
  await expect(dock).toContainText('Play or pause the simulation');
  await expect(dock).toContainText('Escape');
  await expect(dock).toContainText('Right-click');
});

test('a right-click while placing a component cancels the drop instead of also placing one', async ({ page }) => {
  await page.goto('./#/tools/digital-logic-workstation');
  await expect(page.getByTestId('logic-workspace')).toBeVisible();
  await ensurePaletteOpen(page);
  await page.getByTestId('logic-palette').getByRole('button', { name: 'SWITCH', exact: true }).click();
  const canvas = page.getByTestId('logic-canvas');
  await canvas.click({ button: 'right', position: { x: 3 * GRID, y: 3 * GRID } });
  // A genuine placement always leaves the Undo button enabled; a right-click
  // that only opened (or no-opped, since nothing is under the cursor yet)
  // must not have committed a component-add to history.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('collapses the palette and inspector into slide-over sheets on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/tools/digital-logic-workstation');
  const componentsToggle = page.getByRole('button', { name: 'Components', exact: true });
  const inspectToggle = page.getByRole('button', { name: 'Inspect', exact: true });
  await expect(componentsToggle).toBeVisible();

  const palette = page.getByTestId('logic-palette');
  await expect(palette).not.toHaveClass(/sheet-open/);
  await componentsToggle.click();
  await expect(palette).toHaveClass(/sheet-open/);
  // The sheet's own header close button, not the full-screen backdrop: a
  // tall open sheet can cover most of the backdrop's bounding box, leaving
  // too little of it reliably tappable (or automatable) to dismiss by.
  await page.getByLabel('Close component palette').click();
  await expect(palette).not.toHaveClass(/sheet-open/);

  const inspector = page.locator('.logic-inspector-shell');
  await expect(inspector).not.toHaveClass(/sheet-open/);
  await inspectToggle.click();
  await expect(inspector).toHaveClass(/sheet-open/);
  await page.getByLabel('Close inspector').click();
  await expect(inspector).not.toHaveClass(/sheet-open/);
});
