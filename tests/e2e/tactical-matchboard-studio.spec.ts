import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const board = (page: Page) => page.locator('.tactical-board');
const setupPanel = (page: Page) => page.locator('.tactical-setup').first();
const coordinateInput = (page: Page, axis: 'X' | 'Y') => page.getByLabel(`${axis} %`, { exact: true });

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
  await setupPanel(page).getByRole('combobox', { name: /Formation/ }).selectOption('ussf-4v4-1-2-1');
  await setupPanel(page).getByLabel('Pitch length (m)').fill('40');
  await setupPanel(page).getByLabel('Pitch width (m)').fill('30');
  await page.getByRole('button', { name: 'Build board' }).click();

  await expect(page.locator('.tactical-player-list button')).toHaveCount(4);
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(4);
  await expect(page.locator('.status-line')).toContainText('Built 4v4 board with 4 placed players');

  await page.locator('.tactical-player-list button').first().click();
  await clickBoard(page, 0.6, 0.4);
  const clickX = Number(await coordinateInput(page, 'X').inputValue());
  const clickY = Number(await coordinateInput(page, 'Y').inputValue());
  expect(clickX).toBeCloseTo(60, 0);
  expect(clickY).toBeCloseTo(40, 0);

  await page.getByRole('button', { name: 'Move player right' }).click();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(clickX + 2, 1);

  await coordinateInput(page, 'X').fill('25');
  await coordinateInput(page, 'Y').fill('75');
  await page.getByRole('button', { name: 'Set position' }).click();
  await expect(coordinateInput(page, 'X')).toHaveValue('25.0');
  await expect(coordinateInput(page, 'Y')).toHaveValue('75.0');
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
  await expect(coordinateInput(page, 'X')).toHaveValue('72.0');
  await expect(coordinateInput(page, 'Y')).toHaveValue('28.0');
});

test('keyboard activation covers selection and precision movement without dragging', async ({ page }) => {
  const firstPlayer = page.locator('.tactical-player-list button').first();
  await firstPlayer.focus();
  await page.keyboard.press('Enter');
  await expect(firstPlayer).toHaveAttribute('aria-pressed', 'true');

  const initialX = Number(await coordinateInput(page, 'X').inputValue());
  const moveRight = page.getByRole('button', { name: 'Move player right' });
  await moveRight.focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(initialX + 2, 1);

  await coordinateInput(page, 'X').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('31');
  await coordinateInput(page, 'Y').focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('64');
  await page.keyboard.press('Enter');
  await expect(coordinateInput(page, 'X')).toHaveValue('31.0');
  await expect(coordinateInput(page, 'Y')).toHaveValue('64.0');
});

test('authors rules, formations, transforms, legality aids, and restart starters', async ({ page }) => {
  await page.getByText('Rules, formations & restarts', { exact: true }).click();

  await page.getByRole('combobox', { name: /Rules profile/ }).selectOption('ifab-11v11-international-2026-27');
  await page.getByRole('button', { name: 'Apply rules profile' }).click();
  await expect(page.locator('#ifab-left-penalty-area')).toHaveCount(1);
  await expect(page.locator('#ifab-right-penalty-area')).toHaveCount(1);

  await page.getByRole('combobox', { name: /Restart starter/ }).selectOption('tool-corner-left');
  await expect(page.getByText(/IFAB corner kicks place the ball within one metre/)).toBeVisible();

  await page.getByRole('combobox', { name: /Rules profile/ }).selectOption('ussf-pdi-7v7-2017');
  await page.getByRole('button', { name: 'Apply rules profile' }).click();
  await expect(page.locator('#ussf-left-build-out-line')).toHaveCount(1);
  await expect(page.locator('#ussf-right-build-out-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Load editable copy' }).click();
  await expect(page.getByLabel('Profile id')).toHaveValue('ussf-pdi-7v7-2017-local');

  const beforeMirror = Number(await coordinateInput(page, 'X').inputValue());
  await page.getByRole('button', { name: 'Mirror direction' }).click();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(100 - beforeMirror, 1);

  const beforeFlip = Number(await coordinateInput(page, 'Y').inputValue());
  await page.getByRole('button', { name: 'Flip vertical' }).click();
  await expect.poll(async () => Number(await coordinateInput(page, 'Y').inputValue())).toBeCloseTo(100 - beforeFlip, 1);

  await page.getByRole('button', { name: 'Apply restart starter' }).click();
  await expect(page.locator('[data-annotation-kind="restart-guide"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Author restart template' }).click();
  await expect(page.getByRole('combobox', { name: /Restart starter/ })).toHaveValue('academy-goal-kick');
  await page.getByRole('button', { name: 'Apply restart starter' }).click();
  await expect(page.locator('[data-annotation-kind="restart-guide"]')).toHaveCount(2);

  await page.getByRole('button', { name: 'Author formation' }).click();
  await expect(setupPanel(page).getByRole('combobox', { name: /Formation/ })).toHaveValue('academy-8v8');
  await page.getByRole('button', { name: 'Build board' }).click();
  await expect(page.locator('.tactical-player-list button')).toHaveCount(8);
  await expect(page.locator('.status-line').last()).toContainText('Built 8v8 board with 8 placed players');

  await page.getByRole('button', { name: 'Capture formation phase' }).click();
  await coordinateInput(page, 'X').fill('80');
  await coordinateInput(page, 'Y').fill('20');
  await page.getByRole('button', { name: 'Set position' }).click();
  await page.getByLabel('Phase label').fill('Pressing shape');
  await page.getByRole('button', { name: 'Capture formation phase' }).click();
  await expect(page.getByRole('combobox', { name: 'From phase' })).toHaveValue('phase-1');
  await expect(page.getByRole('combobox', { name: 'To phase' })).toHaveValue('phase-2');
  await page.getByRole('button', { name: 'Preview phase morph' }).click();
  await expect(coordinateInput(page, 'X')).toHaveValue('44.0');
  await expect(coordinateInput(page, 'Y')).toHaveValue('35.0');

  await page.getByRole('button', { name: 'Author and apply rules' }).click();
  await expect(page.locator('#custom-left-build-out-line')).toHaveCount(1);
  await expect(page.locator('#custom-right-build-out-line')).toHaveCount(1);
  await expect(page.locator('.status-line').last()).toContainText('Custom rules profile authored and applied locally');
});

test('has no serious or critical accessibility violations in the tactical workspace', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One focused Axe pass covers the shared workspace DOM.');
  await page.getByText('Rules, formations & restarts', { exact: true }).click();
  const results = await new AxeBuilder({ page })
    .include('[data-testid="suite-workspace"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});

test('reflows and preserves 44px essential targets across phone, tablet, laptop, and desktop widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'CSS-width coverage is deterministic in one Chromium project.');
  const viewports = [
    { name: 'phone portrait', width: 320, height: 740 },
    { name: 'phone landscape', width: 844, height: 390 },
    { name: 'tablet portrait', width: 768, height: 1024 },
    { name: 'laptop', width: 1024, height: 768 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#/tools/tactical-matchboard-studio');
    await expect(page.locator('.tactical-board')).toBeVisible();
    await page.getByText('Rules, formations & restarts', { exact: true }).click();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.name} document overflow`).toBeLessThanOrEqual(1);

    const undersizedTargets = await page.locator([
      '.tactical-setup > summary',
      '.tactical-command-bar button',
      '.tactical-player-list button',
      '.tactical-dpad button',
      '.tactical-coordinate-form button',
      '.tactical-authoring-grid input',
      '.tactical-authoring-grid select',
      '.tactical-authoring-grid textarea',
      '.tactical-authoring-grid button',
    ].join(', ')).evaluateAll((elements) => elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.textContent?.trim() || element.tagName}: ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`;
      }));
    expect(undersizedTargets, `${viewport.name} essential target size`).toEqual([]);
  }
});
