import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const clickAt = async (page: Page, xRatio: number, yRatio: number) => {
  const canvas = page.getByTestId('floorplan-overlay');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Floor-plan overlay canvas is not visible.');
  await canvas.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
};

const dispatchTouch = async (
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  xRatio: number,
  yRatio: number,
  pointerId = 31,
  offsetX = 0,
  offsetY = 0,
) => {
  const canvas = page.getByTestId('floorplan-overlay');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Floor-plan overlay canvas is not visible.');
  await page.evaluate(({ eventType, clientX, clientY, id }) => {
    const overlay = document.querySelector('[data-testid="floorplan-overlay"]');
    if (!overlay) throw new Error('Floor-plan overlay canvas is not present.');
    overlay.dispatchEvent(new PointerEvent(eventType, {
      pointerId: id,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: eventType === 'pointerup' || eventType === 'pointercancel' ? 0 : 1,
    }));
  }, {
    eventType: type,
    clientX: box.x + box.width * xRatio + offsetX,
    clientY: box.y + box.height * yRatio + offsetY,
    id: pointerId,
  });
};

test('PlanCraft catalog link, exact alias, and generic route open the same local workspace', async ({ page }) => {
  await page.goto('./#/');
  const catalogLink = page.getByRole('link', { name: /PlanCraft Studio/ });
  await expect(catalogLink).toBeVisible();
  await expect(catalogLink).toHaveAttribute('href', '#/tools/floorplan-studio');
  await catalogLink.click();
  await expect(page.getByTestId('floorplan-studio')).toBeVisible();

  await page.goto('./#/floorplan-studio');
  await expect(page.getByTestId('suite-title')).toContainText('PlanCraft Studio');
  await expect(page.getByTestId('floorplan-studio')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuous Wall/ })).toBeVisible();
  await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);

  await page.goto('./#/tools/floorplan-studio');
  await expect(page.getByTestId('floorplan-studio')).toBeVisible();
});

test('drafts a room, hosts a door, stages a component, and supports undo/redo', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await page.getByRole('button', { name: /Continuous Wall/ }).click();
  await clickAt(page, 0.22, 0.25);
  await clickAt(page, 0.78, 0.25);
  await clickAt(page, 0.78, 0.72);
  await clickAt(page, 0.22, 0.72);
  await clickAt(page, 0.22, 0.25);

  await expect(page.getByTestId('wall-count')).toHaveText('4');
  await expect(page.getByTestId('floorplan-studio')).toHaveAttribute('data-analysis-state', 'current', { timeout: 20_000 });
  await expect(page.getByTestId('room-count')).toHaveText('1');

  const doorTool = page.getByRole('button', { name: /Parametric Door/ });
  await doorTool.click();
  await expect(doorTool).toHaveAttribute('aria-pressed', 'true');
  await clickAt(page, 0.5, 0.25);
  await expect(page.getByTestId('opening-count')).toHaveText('1');

  await page.getByRole('button', { name: '3-Seat Sofa' }).click();
  await clickAt(page, 0.5, 0.5);
  await expect(page.getByTestId('component-count')).toHaveText('1');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(page.getByTestId('component-count')).toHaveText('0');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+y' : 'Control+y');
  await expect(page.getByTestId('component-count')).toHaveText('1');
});

test('a touch tap selects while a touch drag pans without selecting', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await page.getByRole('button', { name: /Continuous Wall/ }).click();
  await clickAt(page, 0.25, 0.3);
  await clickAt(page, 0.7, 0.3);
  await expect(page.getByTestId('wall-count')).toHaveText('1');

  await page.getByRole('button', { name: /Select & Transform/ }).click();
  await clickAt(page, 0.9, 0.8);
  await expect(page.getByLabel('Project name')).toBeVisible();

  await dispatchTouch(page, 'pointerdown', 0.5, 0.3);
  await dispatchTouch(page, 'pointerup', 0.5, 0.3);
  await expect(page.getByLabel('Thickness (mm)')).toBeVisible();

  await clickAt(page, 0.9, 0.8);
  await expect(page.getByLabel('Project name')).toBeVisible();
  const wrap = page.locator('.plancraft-canvas-wrap');
  const before = Number(await wrap.getAttribute('data-pan-x'));

  await dispatchTouch(page, 'pointerdown', 0.75, 0.75, 44);
  await dispatchTouch(page, 'pointermove', 0.75, 0.75, 44, 48, 0);
  await dispatchTouch(page, 'pointerup', 0.75, 0.75, 44, 48, 0);

  await expect.poll(async () => Number(await wrap.getAttribute('data-pan-x'))).toBeGreaterThan(before);
  await expect(page.getByLabel('Project name')).toBeVisible();
});

test('an interrupted gesture does not wedge the drafting canvas', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await page.getByRole('button', { name: /Continuous Wall/ }).click();

  await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="floorplan-overlay"]');
    if (!overlay) throw new Error('Floor-plan overlay canvas is not present.');
    const rect = overlay.getBoundingClientRect();
    overlay.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 99, pointerType: 'touch', isPrimary: true, bubbles: true,
      clientX: rect.left + 10, clientY: rect.top + 10,
    }));
  });

  await page.keyboard.press('w');
  await clickAt(page, 0.25, 0.3);
  await clickAt(page, 0.7, 0.3);
  await expect(page.getByTestId('wall-count')).toHaveText('1');
});

test('single-pointer viewport controls remain usable at a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('./#/floorplan-studio');

  const controls = page.getByRole('group', { name: 'Viewport controls' });
  await expect(controls).toBeVisible();
  for (const name of ['Pan view left', 'Pan view up', 'Pan view down', 'Pan view right', 'Zoom view out', 'Zoom view in']) {
    const button = controls.getByRole('button', { name });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(44);
  }

  const wrap = page.locator('.plancraft-canvas-wrap');
  const scaleBefore = Number(await wrap.getAttribute('data-scale'));
  await controls.getByRole('button', { name: 'Zoom view in' }).click();
  await expect.poll(async () => Number(await wrap.getAttribute('data-scale'))).toBeGreaterThan(scaleBefore);

  const panBefore = Number(await wrap.getAttribute('data-pan-x'));
  await controls.getByRole('button', { name: 'Pan view left' }).click();
  await expect.poll(async () => Number(await wrap.getAttribute('data-pan-x'))).toBeGreaterThan(panBefore);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('autosaves locally and restores the drawing after reload', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await page.getByRole('button', { name: /Continuous Wall/ }).click();
  await clickAt(page, 0.25, 0.3);
  await clickAt(page, 0.7, 0.3);
  await expect(page.getByTestId('wall-count')).toHaveText('1');
  await page.waitForTimeout(2200);
  await page.reload();
  await expect(page.getByTestId('wall-count')).toHaveText('1');
});

test('exposes local export controls and has no serious or critical axe violations', async ({ page }) => {
  await page.goto('./#/floorplan-studio');
  await expect(page.getByRole('button', { name: 'Export SVG' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export DXF R12' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export DXF R2000' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Backup JSON' })).toBeVisible();

  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(severe).toEqual([]);
});
