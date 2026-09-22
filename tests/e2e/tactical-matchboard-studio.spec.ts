import { expect, test, type Page } from '@playwright/test';

const board = (page: Page) => page.locator('.tactical-board');

async function clickBoard(page: Page, xRatio: number, yRatio: number) {
  const surface = board(page);
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (!box) throw new Error('Tactical board is not visible.');
  await surface.click({ position: { x: box.width * xRatio, y: box.height * yRatio } });
}

async function dispatchTouchPoint(page: Page, target: 'player' | 'board', xRatio = 0.5, yRatio = 0.5) {
  await page.evaluate(({ kind, xRatio: x, yRatio: y }) => {
    const surface = document.querySelector<HTMLElement>('.tactical-board');
    if (!surface) throw new Error('Tactical board is missing.');
    const target = kind === 'player'
      ? surface.querySelector<SVGGElement>('g[data-tactical-kind="player"]')
      : surface;
    if (!target) throw new Error('Touch target is missing.');
    const rect = surface.getBoundingClientRect();
    target.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 41,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: rect.left + rect.width * x,
      clientY: rect.top + rect.height * y,
    }));
  }, { kind: target, xRatio, yRatio });
}

test.beforeEach(async ({ page }) => {
  await page.goto('./#/tools/tactical-matchboard-studio');
  await expect(page.getByTestId('suite-workspace').getByRole('heading', { name: 'Tactical Matchboard Studio', exact: true })).toBeVisible();
});

test('catalog route exposes the local tactical workspace', async ({ page }) => {
  await page.goto('./#/');
  const link = page.getByTestId('tool-catalog').getByRole('link', { name: /Tactical Matchboard Studio/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '#/tools/tactical-matchboard-studio');
  await link.click();
  await expect(page.getByTestId('suite-workspace').getByRole('heading', { name: 'Tactical Matchboard Studio', exact: true })).toBeVisible();
  await expect(page.getByTestId('privacy-status')).toContainText(/browser|device/i);
  await expect(page.getByRole('button', { name: 'Export SVG' })).toBeVisible();
});

test('builds a formation and supports click, D-pad, and exact player movement', async ({ page }) => {
  await page.getByLabel('Formation').selectOption('ussf-4v4-1-2-1');
  await page.getByLabel('Pitch length (m)').fill('40');
  await page.getByLabel('Pitch width (m)').fill('30');
  await page.getByRole('button', { name: 'Build board' }).click();

  await expect(page.locator('.tactical-player-list button')).toHaveCount(4);
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(4);
  await expect(page.locator('.status-line')).toContainText('Built 4v4 board with 4 placed players');

  await page.locator('.tactical-player-list button').first().click();
  await clickBoard(page, 0.6, 0.4);
  const clickX = Number(await page.getByLabel('X %').inputValue());
  const clickY = Number(await page.getByLabel('Y %').inputValue());
  expect(clickX).toBeCloseTo(60, 0);
  expect(clickY).toBeCloseTo(40, 0);

  await page.getByRole('button', { name: 'Move player right' }).click();
  await expect.poll(async () => Number(await page.getByLabel('X %').inputValue())).toBeCloseTo(clickX + 2, 1);

  await page.getByLabel('X %').fill('25');
  await page.getByLabel('Y %').fill('75');
  await page.getByRole('button', { name: 'Set position' }).click();
  await expect(page.getByLabel('X %')).toHaveValue('25.0');
  await expect(page.getByLabel('Y %')).toHaveValue('75.0');
});

test('authors an arrow and supports undo and redo', async ({ page }) => {
  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await page.getByLabel('Arrow label').fill('Press');
  await clickBoard(page, 0.2, 0.4);
  await expect(page.locator('.status-line')).toContainText('Arrow start set');
  await clickBoard(page, 0.65, 0.3);

  await expect(page.locator('#arrow-1')).toHaveCount(1);
  await expect(page.locator('.status-line')).toContainText('Tactical arrow added');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#arrow-1')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('#arrow-1')).toHaveCount(1);
});

test('downloads the current board as SVG', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SVG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('training-board.svg');
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk.toString();
  expect(text).toContain('<svg');
  expect(text).toContain('data-tactical-kind="player"');
});

test('touch pointer selection and movement use the same non-drag workflow', async ({ page }) => {
  await dispatchTouchPoint(page, 'player');
  await expect(page.locator('.tactical-board')).toHaveAttribute('data-selected-token', 'token-1');
  await dispatchTouchPoint(page, 'board', 0.72, 0.28);
  await expect(page.getByLabel('X %')).toHaveValue('72.0');
  await expect(page.getByLabel('Y %')).toHaveValue('28.0');
});