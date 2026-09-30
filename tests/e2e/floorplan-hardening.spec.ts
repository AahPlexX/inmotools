import { expect, test, type Page } from '@playwright/test';

// A fresh plan opens at 0.1 px/mm with the origin 120 px from the canvas corner,
// so plan millimeters map to canvas pixels as px = mm * 0.1 + 120.
const toCanvas = (mm: number) => mm * 0.1 + 120;
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const canvas = (page: Page) => page.getByTestId('floorplan-overlay');

const clickPlan = async (page: Page, x: number, y: number) => {
  await canvas(page).click({ position: { x: toCanvas(x), y: toCanvas(y) } });
};

const dragPlan = async (page: Page, from: readonly [number, number], to: readonly [number, number]) => {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('Drawing canvas is not visible.');
  await page.mouse.move(box.x + toCanvas(from[0]), box.y + toCanvas(from[1]));
  await page.mouse.down();
  await page.mouse.move(box.x + toCanvas((from[0] + to[0]) / 2), box.y + toCanvas((from[1] + to[1]) / 2), { steps: 4 });
  await page.mouse.move(box.x + toCanvas(to[0]), box.y + toCanvas(to[1]), { steps: 4 });
  await page.mouse.up();
};

const drawWalls = async (page: Page, points: readonly (readonly [number, number])[]) => {
  await page.getByRole('button', { name: /Continuous Wall/ }).click();
  for (const [x, y] of points) await clickPlan(page, x, y);
};

test.beforeEach(async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await expect(page.getByTestId('floorplan-studio')).toBeVisible();
});

test('a partition drawn wall-to-wall splits one room into two', async ({ page }) => {
  // Coordinates stay within 2000 mm so every point is on a 360 px phone canvas.
  await drawWalls(page, [[0, 0], [2000, 0], [2000, 1800], [0, 1800], [0, 0]]);
  await expect(page.getByTestId('wall-count')).toHaveText('4');
  // Closing the outline ends the run, so the next two clicks draw a fresh partition.
  await clickPlan(page, 1000, 0);
  await clickPlan(page, 1000, 1800);
  await expect(page.getByTestId('wall-count')).toHaveText('7');
  await expect(page.getByTestId('floorplan-studio')).toHaveAttribute('data-analysis-state', 'current', { timeout: 20_000 });
  await expect(page.getByTestId('room-count')).toHaveText('2');
});

test('Escape stops a run of walls without leaving the wall tool', async ({ page }) => {
  await drawWalls(page, [[0, 0], [1000, 0]]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Continuous Wall/ })).toHaveAttribute('aria-pressed', 'true');
  await clickPlan(page, 0, 1000);
  await clickPlan(page, 1000, 1000);
  await expect(page.getByTestId('wall-count')).toHaveText('2');
});

test('the mouse wheel zooms the plan without scrolling the page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'Mouse wheel input is a desktop interaction.');
  await canvas(page).scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const wrap = page.locator('.plancraft-canvas-wrap');
  const scaleBefore = Number(await wrap.getAttribute('data-scale'));
  const box = await canvas(page).boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number(await wrap.getAttribute('data-scale'))).toBeGreaterThan(scaleBefore);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test('Space still presses a focused button', async ({ page }) => {
  const wallTool = page.getByRole('button', { name: /Continuous Wall/ });
  await wallTool.focus();
  await page.keyboard.press('Space');
  await expect(wallTool).toHaveAttribute('aria-pressed', 'true');
});

test('furniture can be dragged, nudged with arrow keys, and each move undoes in one step', async ({ page }) => {
  await page.getByRole('button', { name: '3-Seat Sofa' }).click();
  await clickPlan(page, 1200, 1000);
  await page.keyboard.press('v');
  await dragPlan(page, [1200, 1000], [1600, 1000]);
  const x = page.getByLabel('X (mm)');
  await expect(x).toHaveValue('1600');
  await page.keyboard.press(`${modifier}+z`);
  await expect(x).toHaveValue('1200');
  await canvas(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect(x).toHaveValue('1300');
});

test('a door stays selectable after clicking away, and its properties open', async ({ page }) => {
  await drawWalls(page, [[0, 0], [2000, 0]]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await clickPlan(page, 1000, 0);
  await expect(page.getByTestId('opening-count')).toHaveText('1');
  await page.keyboard.press('v');
  await clickPlan(page, 1000, 1500);
  await expect(page.getByLabel('Project name')).toBeVisible();
  await clickPlan(page, 1000, 30);
  await expect(page.getByRole('button', { name: /Swing other way/ })).toBeVisible();
});

test('property fields ignore half-typed values and commit once', async ({ page }) => {
  await drawWalls(page, [[0, 0], [2000, 0]]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await clickPlan(page, 1000, 0);
  const thickness = page.getByLabel('Thickness (mm)');
  await thickness.fill('');
  await thickness.press('Tab');
  await expect(thickness).toHaveValue('150');
  await thickness.fill('200');
  await thickness.press('Enter');
  await expect(thickness).toHaveValue('200');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(thickness).toHaveValue('150');
});

test('feet-and-inches units apply to lengths and inputs', async ({ page }) => {
  await page.getByLabel('Units').selectOption('imperial');
  await drawWalls(page, [[0, 0], [1828.8, 0]]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await clickPlan(page, 900, 0);
  const length = page.getByLabel('Length (ft-in)');
  await expect(length).toHaveValue(`6'-0"`);
  await length.fill(`8'6"`);
  await length.press('Enter');
  await expect(length).toHaveValue(`8'-6"`);
});

test('a dimension can be selected and deleted', async ({ page }) => {
  await page.keyboard.press('m');
  await clickPlan(page, 0, 0);
  await clickPlan(page, 1500, 0);
  const remove = page.getByRole('button', { name: 'Delete dimension' });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(page.getByLabel('Project name')).toBeVisible();
});

test('a PDF that cannot fit at scale explains why, and Fit to page downloads', async ({ page }) => {
  await drawWalls(page, [[0, 0], [2000, 0]]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await clickPlan(page, 1000, 0);
  const length = page.getByLabel('Length (mm)');
  await length.fill('20000');
  await length.press('Enter');
  await page.getByLabel('PDF sheet').selectOption('letter');
  await page.getByLabel('PDF scale').selectOption('drawing');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page.getByRole('status').filter({ hasText: /larger than/ })).toBeVisible();
  await page.getByLabel('PDF scale').selectOption('fit');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect((await download).suggestedFilename()).toBe('untitled-plan-letter.pdf');
});

test('the tab title names the tool while it is open', async ({ page }) => {
  await expect(page).toHaveTitle(/PlanCraft Studio/);
  await page.goto('./#/');
  await expect(page).not.toHaveTitle(/PlanCraft Studio/);
});

test('on a phone the drafting tools sit above the drawing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tools = await page.getByRole('region', { name: 'Drafting tools' }).boundingBox();
  const drawing = await canvas(page).boundingBox();
  expect(tools!.y + tools!.height).toBeLessThanOrEqual(drawing!.y + 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
