import AxeBuilder from '@axe-core/playwright';
import JSZip from 'jszip';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import type { CDPSession, Locator, Page } from '@playwright/test';
import { buildBeginnerTacticalProject, placeMirroredOpposition } from '../../src/tools/tactics/workspace-engine';
import { exportTacticalProjectJson, importTacticalProjectJson } from '../../src/tools/tactics/project-io';
import { addTimelineSubstitutionEvent } from '../../src/tools/tactics/substitution-engine';
import type { TacticalSnapshotRecord } from '../../src/tools/tactics/persistence-engine';

const localReviewVideo = path.join(process.cwd(), 'tests/fixtures/tactical-review-sample.webm');

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
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
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

test('places an opposition, moves the ball, and removes a selected drawing', async ({ page }) => {
  await setupPanel(page).getByRole('combobox', { name: /Formation/ }).selectOption('ussf-4v4-1-2-1');
  await page.getByRole('button', { name: 'Build board' }).click();
  await expect(page.locator('#training-left-penalty-area')).toHaveCount(1);
  await expect(page.locator('#training-centre-circle')).toHaveCount(1);
  await page.locator('.tactical-player-list button').first().click();
  await expect(page.locator('.tactical-board-svg g[data-selected="true"]')).toHaveCount(1);

  await page.getByRole('combobox', { name: 'Opposition formation' }).selectOption('ussf-4v4-1-2-1');
  await page.getByRole('button', { name: 'Place opposition' }).click();
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(8);
  await expect(page.locator('.status-line').last()).toContainText('Opposition placed');

  await page.locator('#tactical-ball').click();
  await expect(page.locator('.status-line').last()).toContainText('Ball selected');
  await clickBoard(page, 0.3, 0.35);
  await expect(page.locator('.status-line').last()).toContainText('Ball moved');

  await page.getByRole('button', { name: 'Arrow', exact: true }).click();
  await clickBoard(page, 0.2, 0.25);
  await clickBoard(page, 0.4, 0.45);
  await page.locator('#arrow-1').evaluate((node) => {
    node.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      isPrimary: true,
      pointerId: 7,
      pointerType: 'mouse',
    }));
  });
  await page.getByRole('button', { name: 'Remove drawing' }).click();
  await expect(page.locator('#arrow-1')).toHaveCount(0);
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(8);
});

test('asks before build board replaces the board', async ({ page }) => {
  page.removeAllListeners('dialog');
  const players = page.locator('.tactical-board-svg g[data-tactical-kind="player"]');
  const before = await players.count();
  const message = new Promise<string>((resolve) => {
    page.once('dialog', (dialog) => {
      resolve(dialog.message());
      void dialog.dismiss();
    });
  });
  await page.getByRole('button', { name: 'Build board' }).click();
  await expect(message).resolves.toMatch(/replaces this board and clears undo/i);
  await expect(page.locator('.status-line').last()).toContainText('Build board cancelled');
  await expect(players).toHaveCount(before);
});

test('places a different opposition formation and draws a freehand stroke', async ({ page }) => {
  await setupPanel(page).getByRole('combobox', { name: /Formation/ }).selectOption('ussf-4v4-1-2-1');
  await page.getByRole('button', { name: 'Build board' }).click();
  await page.getByRole('combobox', { name: 'Opposition formation' }).selectOption('ussf-7v7-1-3-2-1');
  await page.getByRole('button', { name: 'Place opposition' }).click();
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(11);

  await page.getByRole('button', { name: 'Freehand', exact: true }).click();
  await page.getByRole('button', { name: 'Add freehand point' }).click();
  await page.getByRole('button', { name: 'Add freehand point' }).click();
  await expect(page.getByTestId('tactical-board-freehand-count')).toHaveText('2 freehand points');
  await page.getByRole('button', { name: 'Save freehand' }).click();
  await expect(page.locator('[data-annotation-kind="freehand"]')).toHaveCount(1);
  await expect(page.locator('.status-line').last()).toContainText('Freehand stroke added');
});

test('zooms and pans the tactical pitch', async ({ page }) => {
  const surface = board(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(surface).toHaveAttribute('data-pitch-zoom', '1.25');
  const afterZoom = await surface.getAttribute('data-pitch-pan-x');
  await page.getByRole('button', { name: 'Pan right' }).click();
  await expect(surface).not.toHaveAttribute('data-pitch-pan-x', afterZoom ?? '0');
  await page.getByRole('button', { name: 'Reset pitch view' }).click();
  await expect(surface).toHaveAttribute('data-pitch-zoom', '1');
  await expect(surface).toHaveAttribute('data-pitch-pan-x', '0');
});

test('shows a virtualized timeline track window and the session limit', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();
  await expect(page.getByTestId('timeline-track-window')).toContainText('Showing 0 of 0 tracks');
  await expect(page.getByTestId('timeline-track-window')).toContainText('Session limit 2048');
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
  await expect(page.locator('#ifab-left-goal-area')).toHaveCount(1);
  await expect(page.locator('#ifab-corner-top-left')).toHaveCount(1);

  await page.getByRole('combobox', { name: /Restart starter/ }).selectOption('tool-corner-left');
  await expect(page.getByText(/IFAB corner kicks place the ball within one metre/)).toBeVisible();

  await page.getByRole('combobox', { name: /Rules profile/ }).selectOption('fifa-futsal-2025-26');
  await page.getByRole('button', { name: 'Apply rules profile' }).click();
  await expect(page.locator('#futsal-left-second-penalty-mark')).toHaveCount(1);
  await expect(page.locator('#futsal-right-second-penalty-mark')).toHaveCount(1);
  await expect(page.locator('#futsal-left-penalty-area')).toHaveCount(1);
  await expect(page.locator('#futsal-right-penalty-area')).toHaveCount(1);
  await expect(page.locator('#futsal-left-substitution-near-marker')).toHaveCount(1);
  await expect(page.getByText(/Futsal Laws of the Game 2025-26/)).toBeVisible();

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

test('authors timeline markers and a curved player motion segment', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Playhead (ms)').fill('1200');
  await page.getByRole('button', { name: 'Set playhead' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Playhead set to 1200 ms');

  await page.getByLabel('Marker label').fill('Press trigger');
  await page.getByLabel('Marker time (ms)').fill('1200');
  await page.getByRole('button', { name: 'Add timeline marker' }).click();
  await expect(page.getByText(/1200 ms - Press trigger/)).toBeVisible();

  await page.getByLabel('Motion target').selectOption('token-1');
  await page.getByLabel('Motion start (ms)').fill('1200');
  await page.getByLabel('Motion end (ms)').fill('2200');
  await page.getByLabel('Motion end X %').fill('70');
  await page.getByLabel('Motion end Y %').fill('30');
  await page.getByLabel('Motion path').selectOption('quadratic-bezier');
  await page.getByLabel('Control 1 X %').fill('50');
  await page.getByLabel('Control 1 Y %').fill('10');
  await page.getByRole('button', { name: 'Author motion segment' }).click();

  await expect(page.getByText(/token-1.*2 keyframes/i)).toBeVisible();
  await expect(page.locator('.status-line').last()).toContainText('Motion segment authored');
});

test('authors coordinated actions, linked units, possession, and conflict review', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();

  await page.getByLabel('Action target A').selectOption('token-1');
  await page.getByLabel('Action target B').selectOption('token-2');
  await page.getByLabel('Action start (ms)').fill('0');
  await page.getByLabel('Action duration (ms)').fill('1000');
  await page.getByLabel('Action A end X %').fill('45');
  await page.getByLabel('Action A end Y %').fill('35');
  await page.getByLabel('Action B end X %').fill('55');
  await page.getByLabel('Action B end Y %').fill('65');
  await page.getByRole('button', { name: 'Apply coordinated action' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Coordinated action authored');

  await page.getByLabel('Linked member A').selectOption('token-1');
  await page.getByLabel('Linked member B').selectOption('token-2');
  await page.getByLabel('Unit start (ms)').fill('1500');
  await page.getByLabel('Unit duration (ms)').fill('1000');
  await page.getByLabel('Unit delta X %').fill('5');
  await page.getByLabel('Unit delta Y %').fill('0');
  await page.getByRole('button', { name: 'Translate linked unit' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Linked unit translated');

  await page.getByLabel('Possession holder').selectOption('token-1');
  await page.getByLabel('Possession time (ms)').fill('500');
  await page.getByRole('button', { name: 'Add possession event' }).click();
  await expect(page.getByText(/500 ms -> token-1/)).toBeVisible();

  await page.getByLabel('Conflict step (ms)').fill('500');
  await page.getByLabel('Conflict threshold (m)').fill('100');
  await page.getByRole('button', { name: 'Review path conflicts' }).click();
  await expect(page.getByText(/Potential conflicts found:/)).toBeVisible();
});

test('authors typed triggers, named action patterns, and linked-unit tactical adjustments', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();

  await page.getByLabel('Marker type').selectOption('press');
  await page.getByLabel('Marker label').fill('Press now');
  await page.getByLabel('Marker time (ms)').fill('250');
  await page.getByRole('button', { name: 'Add timeline marker' }).click();
  await expect(page.getByText(/250 ms - Press now \(press\)/)).toBeVisible();

  await page.getByLabel('Action pattern').selectOption('third-player');
  await page.getByLabel('Action target A').selectOption('token-1');
  await page.getByLabel('Action target B').selectOption('token-2');
  await page.getByLabel('Action target C').selectOption('token-3');
  await page.getByLabel('Action start (ms)').fill('1000');
  await page.getByLabel('Action duration (ms)').fill('500');
  await page.getByLabel('Action A end X %').fill('45');
  await page.getByLabel('Action A end Y %').fill('35');
  await page.getByLabel('Action B end X %').fill('55');
  await page.getByLabel('Action B end Y %').fill('65');
  await page.getByLabel('Action C end X %').fill('70');
  await page.getByLabel('Action C end Y %').fill('50');
  await page.getByRole('button', { name: 'Apply coordinated action' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Third-player run action authored');

  await page.getByLabel('Linked member A').selectOption('token-1');
  await page.getByLabel('Linked member B').selectOption('token-2');
  await page.getByLabel('Linked member C (optional)').selectOption('token-3');
  await page.getByLabel('Unit operation').selectOption('step');
  await page.getByLabel('Unit start (ms)').fill('2500');
  await page.getByLabel('Unit duration (ms)').fill('500');
  await page.getByLabel('Unit adjustment %').fill('5');
  await page.getByRole('button', { name: 'Apply linked unit adjustment' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Linked unit step authored');

  const actionOptions = await page.getByLabel('Action pattern').locator('option').evaluateAll(
    (options) => options.map((option) => (option as HTMLOptionElement).value),
  );
  expect(actionOptions).toEqual([
    'custom',
    'overlap',
    'underlap',
    'third-player',
    'wall-pass',
    'switch',
    'give-and-go',
    'decoy',
    'press',
    'recovery',
  ]);

  await page.getByLabel('Action pattern').selectOption('wall-pass');
  await expect(page.getByLabel('Action target C')).toHaveCount(0);
  await page.getByLabel('Action pattern').selectOption('third-player');
  await expect(page.getByLabel('Action target C')).toBeVisible();

  const unitOptions = await page.getByLabel('Unit operation').locator('option').evaluateAll(
    (options) => options.map((option) => (option as HTMLOptionElement).value),
  );
  expect(unitOptions).toEqual(['translation', 'line-shift', 'step', 'drop', 'width', 'depth']);
});

test('has no serious or critical accessibility violations in the tactical workspace', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One focused Axe pass covers the shared workspace DOM.');
  await page.getByText('Rules, formations & restarts', { exact: true }).click();
  await page.getByText('Project vault & interchange', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save to device' })).toBeVisible();
  const spatialSummary = page.getByText('Spatial analysis', { exact: true });
  await spatialSummary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Voronoi territory')).toBeVisible();
  const voronoiToggle = page.getByLabel('Voronoi territory');
  await voronoiToggle.focus();
  await page.keyboard.press('Space');
  await expect(voronoiToggle).toBeChecked();
  await page.getByRole('button', { name: 'Show layers' }).click();
  await expect(page.getByRole('button', { name: 'Solo Tactics' })).toBeVisible();
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('dialog', { name: 'Tactical Matchboard help' })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-testid="suite-workspace"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});

test('reflows and preserves 44px essential targets across phone, tablet, laptop, and desktop widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'CSS-width coverage is deterministic in one Chromium project.');
  const viewports: Array<{ name: string; width: number; height: number; enlarge?: boolean; zoom?: string }> = [
    { name: 'phone portrait', width: 320, height: 740 },
    { name: 'phone landscape', width: 844, height: 390 },
    { name: 'tablet portrait', width: 768, height: 1024 },
    { name: 'tablet landscape', width: 1080, height: 810 },
    { name: 'laptop', width: 1024, height: 768 },
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'large desktop', width: 1920, height: 1080 },
    { name: 'enlarged text', width: 1280, height: 800, enlarge: true },
    { name: 'page zoom', width: 1280, height: 900, zoom: '1.5' },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./#/tools/tactical-matchboard-studio');
    if (viewport.enlarge) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    }
    if (viewport.zoom) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = zoom; }, viewport.zoom);
    }
    await expect(page.locator('.tactical-board')).toBeVisible();
    await page.getByText('Rules, formations & restarts', { exact: true }).click();
    await page.getByText('Spatial analysis', { exact: true }).click();
    await page.getByText('Project vault & interchange', { exact: true }).click();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.name} document overflow`).toBeLessThanOrEqual(1);
    const workspaceOverflow = await page.locator('.tactical-matchboard-workspace').evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(workspaceOverflow, `${viewport.name} workspace overflow`).toBeLessThanOrEqual(1);

    const undersizedTargets = await page.locator([
      '.tactical-setup > summary',
      '.tactical-command-bar button',
      '.tactical-command-bar select',
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

    await page.getByRole('button', { name: 'Show layers' }).click();
    const layerTargets = await page.locator('.tactical-layer-panel button, .tactical-layer-panel .tactical-include').evaluateAll((elements) => elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.textContent?.trim() || element.tagName}: ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`;
      }));
    expect(layerTargets, `${viewport.name} layer target size`).toEqual([]);
  }
});


test('temporally hides a scene layer without deleting its players', async ({ page }) => {
  await setupPanel(page).getByRole('combobox', { name: /Formation/ }).selectOption('ussf-4v4-1-2-1');
  await page.getByRole('button', { name: 'Build board' }).click();
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(4);

  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Visibility target').selectOption('layer-1');
  await page.getByLabel('Visibility time (ms)').fill('500');
  await page.getByLabel('Visibility state').selectOption('hidden');
  await page.getByRole('button', { name: 'Add visibility change' }).click();

  await page.getByLabel('Playhead (ms)').fill('1000');
  await page.getByRole('button', { name: 'Set playhead' }).click();
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(0);

  await page.getByLabel('Playhead (ms)').fill('0');
  await page.getByRole('button', { name: 'Set playhead' }).click();
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(4);
});

test('authors scene sequencing, visibility, offsets, and grouped stagger timing', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();

  await page.getByLabel('Motion target').selectOption('token-1');
  await page.getByLabel('Motion start (ms)').fill('0');
  await page.getByLabel('Motion end (ms)').fill('1000');
  await page.getByRole('button', { name: 'Author motion segment' }).click();

  await page.getByLabel('Motion target').selectOption('token-2');
  await page.getByLabel('Motion start (ms)').fill('0');
  await page.getByLabel('Motion end (ms)').fill('1000');
  await page.getByRole('button', { name: 'Author motion segment' }).click();

  await page.getByRole('textbox', { name: 'Scene name', exact: true }).fill('Press phase');
  await page.getByLabel('Scene start (ms)').fill('1000');
  await page.getByLabel('Scene duration (ms)').fill('1500');
  await page.getByRole('button', { name: 'Add scene' }).click();
  await expect(page.getByText('1000-2500 ms - Press phase')).toBeVisible();
  await page.getByLabel('Scene view').selectOption('scene-2');
  await page.getByText('Rules, formations & restarts', { exact: true }).click();
  await expect(page.getByText('Placed-player, goalkeeper, roster-assignment, and profile counts agree.')).toBeVisible();
  await page.getByLabel('Scene view').selectOption('scene-1');

  await page.getByLabel('Visibility target').selectOption('token-1');
  await page.getByLabel('Visibility time (ms)').fill('750');
  await page.getByLabel('Visibility state').selectOption('hidden');
  await page.getByRole('button', { name: 'Add visibility change' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Visibility change added');

  await page.getByLabel('Offset target').selectOption('token-1');
  await page.getByLabel('Track offset (ms)').fill('200');
  await page.getByRole('button', { name: 'Offset track' }).click();
  await expect(page.getByText(/token-1: 3 keyframes.*200-1200 ms/i)).toBeVisible();

  await page.getByLabel('Group targets').selectOption(['token-1', 'token-2']);
  await page.getByLabel('Group base offset (ms)').fill('100');
  await page.getByLabel('Stagger step (ms)').fill('400');
  await page.getByRole('button', { name: 'Apply group timing' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Grouped timeline timing applied');
  await expect(page.getByText(/token-1: 3 keyframes.*300-1300 ms/i)).toBeVisible();
  await expect(page.getByText(/token-2: 2 keyframes.*500-1500 ms/i)).toBeVisible();
});

test('authors custom cubic-bezier timing easing for a motion segment', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Motion target').selectOption('token-1');
  await page.getByLabel('Motion start (ms)').fill('0');
  await page.getByLabel('Motion end (ms)').fill('1000');
  await page.getByLabel('Interpolation').selectOption('cubic-bezier');
  await page.getByLabel('Timing control X1').fill('0.25');
  await page.getByLabel('Timing control Y1').fill('0.1');
  await page.getByLabel('Timing control X2').fill('0.25');
  await page.getByLabel('Timing control Y2').fill('1');
  await page.getByRole('button', { name: 'Author motion segment' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Motion segment authored');
});

test('previews authored motion with deterministic timeline transport controls', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Motion target').selectOption('token-1');
  await page.getByLabel('Motion start (ms)').fill('0');
  await page.getByLabel('Motion end (ms)').fill('1000');
  await page.getByLabel('Motion end X %').fill('80');
  await page.getByLabel('Motion end Y %').fill('20');
  await page.getByRole('button', { name: 'Author motion segment' }).click();

  const token = page.locator('#token-1');
  const before = await token.getAttribute('transform');

  await page.getByLabel('Timeline scrubber').fill('500');
  await expect.poll(() => token.getAttribute('transform')).not.toBe(before);
  await expect(page.getByTestId('timeline-preview-time')).toHaveText('500 ms');

  await page.getByRole('button', { name: 'Next keyframe' }).click();
  await expect(page.getByTestId('timeline-preview-time')).toHaveText('1000 ms');
  await page.getByRole('button', { name: 'Previous keyframe' }).click();
  await expect(page.getByTestId('timeline-preview-time')).toHaveText('0 ms');

  await page.getByLabel('Frame rate').selectOption('60');
  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect(page.getByTestId('timeline-preview-time')).toHaveText('17 ms');

  await page.getByLabel('Playback speed').selectOption('2');
  await page.getByLabel('Loop playback').check();
  await page.getByRole('button', { name: 'Play timeline' }).click();
  await expect.poll(async () => Number((await page.getByTestId('timeline-preview-time').textContent())?.replace(' ms', ''))).toBeGreaterThan(17);
  await page.getByRole('button', { name: 'Pause timeline' }).click();
  await page.getByRole('button', { name: 'Stop timeline' }).click();
  await expect(page.getByTestId('timeline-preview-time')).toHaveText('0 ms');
});

test('renders authored ball possession, handoff, and release on the timeline preview', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();

  await page.getByLabel('Possession holder').selectOption('token-1');
  await page.getByLabel('Possession time (ms)').fill('0');
  await page.getByRole('button', { name: 'Add possession event' }).click();

  await page.getByLabel('Possession holder').selectOption('token-2');
  await page.getByLabel('Possession time (ms)').fill('1000');
  await page.getByRole('button', { name: 'Add possession event' }).click();

  await page.getByLabel('Possession holder').selectOption('');
  await page.getByLabel('Possession time (ms)').fill('2000');
  await page.getByRole('button', { name: 'Add possession event' }).click();

  const ball = page.locator('[data-tactical-kind="ball"]');
  await expect(ball).toHaveCount(1);

  await page.getByLabel('Timeline scrubber').fill('0');
  const atFirstHolder = await ball.getAttribute('transform');
  await page.getByLabel('Timeline scrubber').fill('1000');
  const atSecondHolder = await ball.getAttribute('transform');
  expect(atSecondHolder).not.toBe(atFirstHolder);

  await page.getByLabel('Timeline scrubber').fill('2000');
  const released = await ball.getAttribute('transform');
  expect(released).not.toBe(atSecondHolder);
  await expect(page.getByText(/2000 ms -> released/)).toBeVisible();
});

test('edits curved trajectory handles with keyboard and pointer input', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Motion target').selectOption('token-1');
  await page.getByLabel('Motion path').selectOption('cubic-bezier');

  const firstHandle = page.getByRole('button', { name: 'Control point 1' });
  const firstX = page.getByLabel('Control 1 X %');
  await expect(firstHandle).toBeVisible();
  await expect(firstX).toHaveValue('50');

  await firstHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(firstX).toHaveValue('51');

  const editor = page.getByLabel('Interactive trajectory path editor');
  await firstHandle.scrollIntoViewIfNeeded();
  const editorBox = await editor.boundingBox();
  const handleBox = await firstHandle.boundingBox();
  expect(editorBox).not.toBeNull();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    editorBox!.x + editorBox!.width * 0.7,
    editorBox!.y + editorBox!.height * 0.4,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect.poll(async () => Number(await firstX.inputValue())).toBeGreaterThan(60);

  await page.getByRole('button', { name: 'End trajectory node' }).focus();
  await page.keyboard.press('Shift+ArrowUp');
  await page.getByRole('button', { name: 'Author motion segment' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Motion segment authored');
});

test('splits, renames, and reorders non-overlapping tactical scenes', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();

  const originalRangeText = await page.getByText(/^\d+-\d+ ms - Scene 1$/).textContent();
  const rangeMatch = originalRangeText?.match(/^(\d+)-(\d+) ms/);
  expect(rangeMatch).not.toBeNull();
  const originalStart = Number(rangeMatch![1]);
  const originalEnd = Number(rangeMatch![2]);
  const splitMs = Number(await page.getByLabel('Split at (ms)').inputValue());
  expect(splitMs).toBeGreaterThan(originalStart);
  expect(splitMs).toBeLessThan(originalEnd);

  await page.getByLabel('New scene name').fill('Second half');
  await page.getByRole('button', { name: 'Split scene' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Timeline scene split');
  await expect(page.getByText(`${splitMs}-${originalEnd} ms - Second half`)).toBeVisible();

  await page.getByLabel('Scene view').selectOption('scene-2');
  await page.getByLabel('Rename scene to').fill('Press phase');
  await page.getByRole('button', { name: 'Rename scene' }).click();
  await expect(page.getByText(`${splitMs}-${originalEnd} ms - Press phase`)).toBeVisible();

  await page.getByRole('button', { name: 'Move scene earlier' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Timeline scene moved earlier');
  const rightDuration = originalEnd - splitMs;
  const leftDuration = splitMs - originalStart;
  await expect(page.getByText(`${originalStart}-${originalStart + rightDuration} ms - Press phase`)).toBeVisible();
  await expect(page.getByText(`${originalStart + rightDuration}-${originalStart + rightDuration + leftDuration} ms - Scene 1`)).toBeVisible();

  await page.getByRole('button', { name: 'Join with next scene' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Timeline scenes joined');
  await expect(page.getByText(`${originalStart}-${originalEnd} ms - Press phase`)).toBeVisible();
  await expect(page.getByLabel('Scene view').locator('option')).toHaveCount(1);
});


test('renders source-honest spatial analysis overlays with readable metric summaries', async ({ page }) => {
  await page.getByText('Spatial analysis', { exact: true }).click();

  await page.getByLabel('Voronoi territory').check();
  await page.getByLabel('Team hulls').check();
  await page.getByLabel('Passing lane to ball').check();
  await page.getByLabel('Orientation sector').check();
  await page.getByLabel('Positional grid').check();
  await page.getByLabel('Distance ring').check();
  await page.getByLabel('Tether to ball').check();

  const visiblePlayers = await page.locator('.tactical-board-svg g[data-tactical-kind="player"]').count();
  expect(visiblePlayers).toBeGreaterThan(0);
  await expect(page.locator('[data-analysis-kind="voronoi-cell"]')).toHaveCount(visiblePlayers);
  await expect(page.locator('[data-analysis-kind="team-hull"]')).toHaveCount(1);
  await expect(page.locator('[data-analysis-kind="passing-lane"]')).toHaveCount(1);
  await expect(page.locator('[data-analysis-kind="vision-sector"]')).toHaveCount(1);
  await expect(page.locator('[data-analysis-kind="grid-line"]')).toHaveCount(6);
  await expect(page.locator('[data-analysis-kind="distance-ring"]')).toHaveCount(1);
  await expect(page.locator('[data-analysis-kind="tether"]')).toHaveCount(1);

  await expect(page.getByTestId('team-geometry-summary')).toContainText(/width.*m/i);
  await expect(page.getByTestId('passing-lane-summary')).toContainText(/clearance.*m/i);
  await expect(page.getByText(/Geometric analysis only/i)).toBeVisible();

  await page.getByLabel('Body orientation (deg)').fill('135');
  await page.getByRole('button', { name: 'Set orientation' }).click();
  await expect(page.locator('.status-line').last()).toContainText('135°');

  await page.getByLabel('Tether target').selectOption('token-2');
  await page.getByLabel('Distance units').selectOption('imperial');
  await expect(page.getByText(/Player\/unit spacing: .* ft/i)).toBeVisible();
});


async function loadInterceptionProject(page: Page) {
  const base = buildBeginnerTacticalProject({
    title: 'R44 interception contract', teamName: 'Team', primaryColor: '#154c79', secondaryColor: '#ffffff',
    formationId: 'ussf-4v4-1-2-1', pitchDimensions: { lengthMeters: 100, widthMeters: 50 }, direction: 'left-to-right',
  });
  const scene = base.scenes[0]!;
  const project = placeMirroredOpposition(base, scene.id, scene.layers[0]!.id);
  project.playerTokens[0]!.position = { x: 0.1, y: 0.5 };
  project.ball.position = { x: 0.9, y: 0.5 };
  const opponents = project.playerTokens.filter(token => token.teamId !== project.playerTokens[0]!.teamId);
  opponents[0]!.position = { x: 0.5, y: 0.3 };
  project.teams.find(team => team.id === opponents[0]!.teamId)!.roster.find(player => player.id === opponents[0]!.playerId)!.role = 'goalkeeper';
  opponents[1]!.position = { x: 0.5, y: 0.9 };
  opponents[2]!.visible = false;
  project.teams.find(team => team.id === opponents[2]!.teamId)!.roster.find(player => player.id === opponents[2]!.playerId)!.status = 'substitute';
  project.scenes[0]!.layers.push({ id: 'hidden-defenders', name: 'Hidden defenders', visible: false, locked: false });
  opponents[3]!.layerId = 'hidden-defenders';
  project.timeline.tracks.push({ id: 'defender-motion', targetId: opponents[0]!.id, keyframes: [
    { id: 'defender-start', timeMs: 0, position: opponents[0]!.position, interpolation: 'linear' },
    { id: 'defender-end', timeMs: 1000, position: { x: 0.5, y: 0.5 }, interpolation: 'hold' },
  ] });
  const scheduled = addTimelineSubstitutionEvent(project, { id: 'r44-substitution', outgoingTargetId: opponents[0]!.id, incomingTargetId: opponents[2]!.id, timeMs: 2000 });
  await page.getByText('Project vault & interchange', { exact: true }).click();
  await page.getByLabel('Import project file').setInputFiles({
    name: 'r44-interception.json', mimeType: 'application/json', buffer: Buffer.from(exportTacticalProjectJson(scheduled)),
  });
  await expect(setupPanel(page).getByLabel('Project title')).toHaveValue('R44 interception contract');
  await page.getByText('Project vault & interchange', { exact: true }).click();
  await page.getByText('Spatial analysis', { exact: true }).click();
  return { defenderId: opponents[0]!.id, substituteId: opponents[2]!.id };
}

test('TMS-R44 displays configured defender reach and exact finite-lane coverage', async ({ page }) => {
  const { defenderId } = await loadInterceptionProject(page);
  const toggle = page.getByLabel('Defender interception cones', { exact: true });
  const cones = page.locator('[data-analysis-kind="interception-cone"]');
  const summary = page.getByTestId('interception-summary');
  await expect(cones).toHaveCount(0);
  await toggle.focus(); await toggle.press('Space');
  await expect(toggle).toBeChecked(); await expect(toggle).toBeFocused();
  await page.getByLabel('Defender radius (m)', { exact: true }).fill('12');
  await page.getByLabel('Interception cone angle (deg)', { exact: true }).fill('180');
  await expect(cones).toHaveCount(2);
  await expect(summary.getByRole('listitem')).toHaveCount(2);
  await expect(summary.getByRole('listitem').first()).toContainText('10.00 m to lane; 13.27 m of lane within reach');
  await expect(page.locator('[data-analysis-kind="interception-label"]')).toHaveText(['12.00 m', '12.00 m']);
  const reachableSpan = page.locator(`[data-analysis-kind="interception-span"][data-defender-id="${defenderId}"]`);
  expect(Number(await reachableSpan.getAttribute('x1'))).toBeCloseTo(433.6675, 2);
  expect(Number(await reachableSpan.getAttribute('x2'))).toBeCloseTo(566.3325, 2);
  await expect(reachableSpan).toHaveAttribute('y1', '500');

  await page.getByLabel('Interception cone angle (deg)', { exact: true }).fill('30');
  await expect(summary.getByRole('listitem').first()).toContainText('5.36 m of lane within reach');
  await page.getByLabel('Defender radius (m)', { exact: true }).fill('4');
  await expect(page.locator('[data-analysis-kind="interception-span"]')).toHaveCount(0);
  await expect(cones).toHaveCount(2);
  await expect(summary.getByRole('listitem').first()).toContainText('0.00 m of lane within reach (outside configured reach)');
  await page.getByLabel('Include goalkeepers in team geometry').uncheck();
  await expect(cones).toHaveCount(1);
  await page.getByLabel('Include goalkeepers in team geometry').check();
  await expect(cones).toHaveCount(2);
});

test('TMS-R44 follows sampled motion and timed substitution visibility', async ({ page }) => {
  const { defenderId, substituteId } = await loadInterceptionProject(page);
  const toggle = page.getByLabel('Defender interception cones', { exact: true });
  const cones = page.locator('[data-analysis-kind="interception-cone"]');
  const summary = page.getByTestId('interception-summary');
  await toggle.check();
  await page.getByLabel('Defender radius (m)', { exact: true }).fill('12');
  await page.getByLabel('Interception cone angle (deg)', { exact: true }).fill('180');
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Playhead (ms)').fill('500');
  await page.getByRole('button', { name: 'Set playhead', exact: true }).click();
  await expect(summary.getByRole('listitem').first()).toContainText('5.00 m to lane; 21.82 m of lane within reach');
  await toggle.uncheck(); await expect(cones).toHaveCount(0);
  await toggle.check(); await expect(cones).toHaveCount(2);
  await page.getByLabel('Playhead (ms)').fill('2000');
  await page.getByRole('button', { name: 'Set playhead', exact: true }).click();
  await expect(page.locator(`[data-analysis-kind="interception-cone"][data-defender-id="${defenderId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-analysis-kind="interception-cone"][data-defender-id="${substituteId}"]`)).toHaveCount(1);
  await expect(cones).toHaveCount(2);
});

test('TMS-R44 respects canonical undo and leaves display settings out of project JSON', async ({ page }) => {
  await loadInterceptionProject(page);
  const cones = page.locator('[data-analysis-kind="interception-cone"]');
  const summary = page.getByTestId('interception-summary');
  await page.getByLabel('Defender interception cones', { exact: true }).check();
  await page.getByLabel('Defender radius (m)', { exact: true }).fill('12');
  await page.getByLabel('Interception cone angle (deg)', { exact: true }).fill('180');
  await coordinateInput(page, 'X').fill('90'); await coordinateInput(page, 'Y').fill('50');
  await page.getByRole('button', { name: 'Set position', exact: true }).click();
  await expect(summary).toContainText('distinct lane endpoints'); await expect(cones).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cones).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(summary).toContainText('distinct lane endpoints');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cones).toHaveCount(2);
  await page.getByText('Project vault & interchange', { exact: true }).click();
  const download = await readDownload(page, 'Export project JSON');
  const exported = importTacticalProjectJson(download.bytes.toString('utf8'), download.filename);
  expect(exported.playerTokens[0]!.position).toEqual({ x: 0.1, y: 0.5 });
  expect(exported.analysisSettings.passingLaneRadiusMeters).toBe(1.5);
  expect('interceptionCones' in exported.analysisSettings).toBe(false);
  expect('interceptionAngleDeg' in exported.analysisSettings).toBe(false);
});

test('TMS-R44 keeps interception controls and summaries accessible at phone and tablet widths', async ({ page, isMobile }) => {
  await loadInterceptionProject(page);
  const toggle = page.getByLabel('Defender interception cones', { exact: true });
  if (isMobile) await toggle.tap(); else await toggle.check();
  await page.getByLabel('Defender radius (m)', { exact: true }).fill('12');
  const angle = page.getByLabel('Interception cone angle (deg)', { exact: true });
  await angle.fill('30'); await angle.press('ArrowUp');
  await expect(angle).toHaveValue('31'); await expect(angle).toBeFocused();
  await expect(page.getByText(/Instantaneous geometric reach/)).toBeVisible();
  const panel = page.locator('details').filter({ has: page.getByText('Spatial analysis', { exact: true }) });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await panel.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    for (const control of [toggle, angle, page.getByLabel('Defender radius (m)', { exact: true })]) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }
    await expect(page.getByTestId('interception-summary').getByRole('listitem')).toHaveCount(2);
  }
  const accessibility = await new AxeBuilder({ page }).include('.tactical-analysis-panel')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('derives occupancy and speed metrics only from authored trajectory samples', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Motion target').selectOption('token-1');
  await page.getByLabel('Motion start (ms)').fill('0');
  await page.getByLabel('Motion end (ms)').fill('1000');
  await page.getByLabel('Motion end X %').fill('80');
  await page.getByLabel('Motion end Y %').fill('20');
  await page.getByRole('button', { name: 'Author motion segment' }).click();

  await page.getByText('Spatial analysis', { exact: true }).click();
  await page.getByLabel('Occupancy heat map').check();

  await expect(page.locator('[data-analysis-kind="heat-cell"]')).not.toHaveCount(0);
  await expect(page.getByTestId('trajectory-metrics-summary')).toContainText(/authored trajectory/i);
  await expect(page.getByTestId('trajectory-metrics-summary')).toContainText(/distance.*m/i);
  await expect(page.getByTestId('trajectory-metrics-summary')).toContainText(/average speed.*m\/s/i);
  await expect(page.getByTestId('trajectory-metrics-summary')).toContainText(/duration 1000 ms/i);
});


test('edits a coaching session and restores a named local snapshot', async ({ page }) => {
  await page.getByText('Project vault & interchange', { exact: true }).click();

  await page.getByLabel('Session objective').fill('Create width and scan before receiving');
  await page.getByLabel('Session duration (minutes)').fill('25');
  await page.getByLabel('Coaching cues').fill('Scan first\nOpen body\nPlay forward');
  await page.getByRole('button', { name: 'Save session plan' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Session plan updated');

  const beforeX = Number(await coordinateInput(page, 'X').inputValue());
  await page.getByLabel('Snapshot label').fill('Before movement');
  await page.getByRole('button', { name: 'Create snapshot' }).click();
  await expect(page.getByText('Before movement', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Move player right' }).click();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeGreaterThan(beforeX);

  await page.getByRole('button', { name: 'Restore snapshot Before movement' }).click();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(beforeX, 1);
  await expect(page.getByLabel('Session objective')).toHaveValue('Create width and scan before receiving');

  await expect(page.getByRole('button', { name: 'Restore latest autosave' })).toBeEnabled();
  await expect(page.getByText(/Projects, autosaves, and snapshots are stored only in this browser/i)).toBeVisible();
});

test('round-trips a project ZIP and preserves the open project after corrupt JSON import', async ({ page }) => {
  await page.getByText('Project vault & interchange', { exact: true }).click();

  const originalTitle = await setupPanel(page).getByLabel('Project title').inputValue();
  const zipPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project ZIP' }).click();
  const zipDownload = await zipPromise;
  const zipPath = await zipDownload.path();
  expect(zipPath).not.toBeNull();

  await setupPanel(page).getByLabel('Project title').fill('Changed after export');
  await page.getByRole('button', { name: 'Build board' }).click();
  await expect(setupPanel(page).getByLabel('Project title')).toHaveValue('Changed after export');

  await page.getByLabel('Import project file').setInputFiles(zipPath!);
  await expect(page.locator('.status-line').last()).toContainText('Project ZIP imported');
  await expect(setupPanel(page).getByLabel('Project title')).toHaveValue(originalTitle);

  await page.getByLabel('Import project file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":2}'),
  });
  await expect(page.locator('.status-line').last()).toContainText(/invalid|missing|project/i);
  await expect(setupPanel(page).getByLabel('Project title')).toHaveValue(originalTitle);
});

test('round-trips authored trajectory CSV through the browser interchange controls', async ({ page }) => {
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Motion target').selectOption('token-1');
  await page.getByLabel('Motion start (ms)').fill('0');
  await page.getByLabel('Motion end (ms)').fill('1000');
  await page.getByLabel('Motion end X %').fill('80');
  await page.getByLabel('Motion end Y %').fill('20');
  await page.getByRole('button', { name: 'Author motion segment' }).click();

  await page.getByText('Project vault & interchange', { exact: true }).click();
  const csvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export trajectory CSV' }).click();
  const csvDownload = await csvPromise;
  const csvPath = await csvDownload.path();
  expect(csvPath).not.toBeNull();

  await page.getByRole('button', { name: 'Build board' }).click();
  await page.getByLabel('Import trajectory file').setInputFiles(csvPath!);
  await expect(page.locator('.status-line').last()).toContainText('Trajectory CSV imported');
  await expect(page.getByText(/token-1: 2 keyframes.*0-1000 ms/i)).toBeVisible();
});


test('lists, loads, and removes browser-local saved projects', async ({ page }) => {
  await page.getByText('Project vault & interchange', { exact: true }).click();

  await page.getByRole('button', { name: 'Save to device' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Project saved to this browser');
  await expect(page.getByLabel('Saved projects')).toContainText('Training board');

  await setupPanel(page).getByLabel('Project title').fill('Temporary unsaved title');
  await expect(setupPanel(page).getByLabel('Project title')).toHaveValue('Temporary unsaved title');

  await page.getByRole('button', { name: 'Load saved project Training board' }).click();
  await expect(setupPanel(page).getByLabel('Project title')).toHaveValue('Training board');

  await page.getByRole('button', { name: 'Remove saved project Training board' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Saved project and its snapshots removed');
  await expect(page.getByTestId('vault-autosave-state')).toContainText('Autosave is paused because this open project has no saved local copy');
  await page.waitForTimeout(750);
  await expect(page.getByLabel('Saved projects')).toContainText('No saved projects yet');

  await page.getByRole('button', { name: 'Save to device' }).click();
  await expect(page.getByTestId('vault-autosave-state')).toContainText('Crash-safe autosave is active');
  await expect(page.getByLabel('Saved projects')).toContainText('Training board');
});


test('preserves crash recovery across reload before starter autosave can overwrite it', async ({ page }) => {
  const before = Number(await coordinateInput(page, 'X').inputValue());
  await page.getByRole('button', { name: 'Move player right' }).click();
  const moved = Number(await coordinateInput(page, 'X').inputValue());
  expect(moved).toBeGreaterThan(before);

  await page.getByText('Project vault & interchange', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore latest autosave' })).toBeEnabled();

  // An earlier starter autosave can already enable Restore. Observe this edit's
  // committed recovery data before reload, rather than racing the debounce.
  const tokenId = await board(page).getAttribute('data-selected-token');
  await expect.poll(() => page.evaluate(async (selectedId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('inmotools-tactical-matchboard');
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
    });
    try {
      const records = await new Promise<TacticalSnapshotRecord[]>((resolve, reject) => {
        const request = database.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
        request.addEventListener('success', () => resolve(request.result as TacticalSnapshotRecord[]), { once: true });
        request.addEventListener('error', () => reject(request.error), { once: true });
      });
      const latest = records.filter(record => record.kind === 'autosave')
        .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id))[0];
      const x = latest?.project.playerTokens.find(token => token.id === selectedId)?.position.x;
      return x === undefined ? null : x * 100;
    } finally {
      database.close();
    }
  }, tokenId)).toBeCloseTo(moved, 1);

  await page.reload();
  await expect(page.getByTestId('suite-workspace').getByRole('heading', { name: 'Tactical Matchboard Studio', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(before, 1);

  await page.getByText('Project vault & interchange', { exact: true }).click();
  await expect(page.getByText('Recovery available', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore latest autosave' }).first().click();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(moved, 1);
});


async function loadPlayerCameraProject(page: Page) {
  const base = buildBeginnerTacticalProject({
    title: 'R52 player camera contract', teamName: 'Team', primaryColor: '#154c79', secondaryColor: '#ffffff',
    formationId: 'ussf-4v4-1-2-1', pitchDimensions: { lengthMeters: 100, widthMeters: 50 }, direction: 'left-to-right',
  });
  const viewer = base.playerTokens[0]!; const incoming = base.playerTokens[3]!;
  viewer.position = { x: 0.25, y: 0.75 }; viewer.rotationDeg = 0;
  base.playerTokens[1]!.position = { x: 0.1, y: 0.2 }; base.playerTokens[1]!.rotationDeg = 90;
  incoming.visible = false; incoming.rotationDeg = 180;
  base.teams[0]!.roster.find(player => player.id === incoming.playerId)!.status = 'substitute';
  base.timeline.tracks.push({ id: 'r52-viewer-motion', targetId: viewer.id, keyframes: [
    { id: 'r52-start', timeMs: 0, position: viewer.position, rotationDeg: 0, interpolation: 'linear' },
    { id: 'r52-end', timeMs: 1000, position: { x: 0.75, y: 0.25 }, rotationDeg: 90, interpolation: 'hold' },
  ] });
  base.timeline.tracks.push({ id: 'r52-layer-visibility', targetId: base.scenes[0]!.layers[0]!.id, keyframes: [
    { id: 'r52-layer-shown', timeMs: 0, visible: true, interpolation: 'hold' },
    { id: 'r52-layer-hidden', timeMs: 2500, visible: false, interpolation: 'hold' },
  ] });
  const project = addTimelineSubstitutionEvent(base, { id: 'r52-substitution', outgoingTargetId: viewer.id, incomingTargetId: incoming.id, timeMs: 2000 });
  await page.getByText('Project vault & interchange', { exact: true }).click();
  await page.getByLabel('Import project file').setInputFiles({
    name: 'r52-player-camera.json', mimeType: 'application/json', buffer: Buffer.from(exportTacticalProjectJson(project)),
  });
  await expect(setupPanel(page).getByLabel('Project title')).toHaveValue('R52 player camera contract');
  await page.getByText('Project vault & interchange', { exact: true }).click();
  await page.getByRole('button', { name: 'Show 3D view', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3D pitch view', exact: true })).toBeVisible();
  return { viewerId: viewer.id, incomingId: incoming.id };
}

async function seekPlayerCamera(page: Page, timeMs: number) {
  const timeline = page.getByText('Timeline & motion', { exact: true });
  if (!await page.getByLabel('Playhead (ms)', { exact: true }).isVisible()) await timeline.click();
  await page.getByLabel('Playhead (ms)', { exact: true }).fill(String(timeMs));
  await page.getByRole('button', { name: 'Set playhead', exact: true }).click();
}

test('TMS-R52 renders the sampled player eye and heading with locked orbit and preset exit', async ({ page }) => {
  const { viewerId } = await loadPlayerCameraProject(page);
  const toggle = page.getByRole('checkbox', { name: 'First-person player camera', exact: true });
  await expect(toggle).toBeVisible(); await expect(toggle).not.toBeChecked();
  const canvas = page.locator('#tactical-3d-panel canvas');
  await expect(canvas).toBeVisible();
  await toggle.check();
  const summary = page.getByTestId('tactical-player-camera-summary');
  await expect(summary).toContainText(viewerId);
  await expect(summary).toContainText('X -25.00 m; Y 1.70 m; Z 12.50 m');
  await expect(summary).toContainText('Heading 0.0°'); await expect(summary).toContainText('FOV 70.0°');
  const image = await canvas.screenshot(); const box = await canvas.boundingBox();
  if (!box) throw new Error('WebGL player camera is not visible.');
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 5 }); await page.mouse.up();
  expect((await canvas.screenshot()).equals(image)).toBe(true);
  await seekPlayerCamera(page, 500);
  await expect(summary).toContainText('X 0.00 m; Y 1.70 m; Z 0.00 m'); await expect(summary).toContainText('Heading 45.0°');
  expect((await canvas.screenshot()).equals(image)).toBe(false);
  await page.getByRole('combobox', { name: 'Camera preset', exact: true }).selectOption('broadcast');
  await expect(toggle).not.toBeChecked(); await expect(summary).toContainText(/orbit.*authored/i);
  await expect(page.locator('#tactical-3d-panel .notice')).toHaveCount(0);
});

test('TMS-R52 follows sampled visibility and substitutions without switching the selected player', async ({ page }) => {
  const { incomingId } = await loadPlayerCameraProject(page);
  await page.getByRole('checkbox', { name: 'First-person player camera', exact: true }).check();
  const summary = page.getByTestId('tactical-player-camera-summary');
  await seekPlayerCamera(page, 1999); await expect(summary).toContainText('Heading 90.0°');
  await seekPlayerCamera(page, 2000); await expect(summary).toContainText(/unavailable.*visible/i);
  await expect(page.getByRole('button', { name: 'Capture camera at playhead', exact: true })).toBeDisabled();
  await page.locator('.tactical-player-list button').nth(3).click();
  await expect(summary).toContainText(incomingId); await expect(summary).toContainText('Heading 180.0°');
  await seekPlayerCamera(page, 2500); await expect(summary).toContainText(/unavailable.*visible/i);
  await seekPlayerCamera(page, 1999); await expect(summary).toContainText(/unavailable.*visible/i);
  await page.locator('.tactical-player-list button').first().click(); await expect(summary).toContainText('Heading 90.0°');
  await page.locator('#tactical-ball').click(); await expect(summary).toContainText(/unavailable.*visible/i);
});

test('TMS-R52 keeps edits and explicit camera captures canonical through undo redo and JSON', async ({ page }) => {
  await loadPlayerCameraProject(page);
  await page.locator('.tactical-player-list button').nth(1).click();
  const toggle = page.getByRole('checkbox', { name: 'First-person player camera', exact: true });
  await toggle.check(); const summary = page.getByTestId('tactical-player-camera-summary');
  await expect(summary).toContainText('X -40.00 m');
  await page.getByRole('button', { name: 'Move player right', exact: true }).click(); await expect(summary).toContainText('X -38.00 m');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(summary).toContainText('X -40.00 m');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(summary).toContainText('X -38.00 m');
  await page.getByLabel('Player eye height (m)', { exact: true }).fill('1.2');
  await page.getByLabel('Player field of view (deg)', { exact: true }).fill('90');
  await page.getByRole('button', { name: 'Capture camera at playhead', exact: true }).click();
  await expect(page.getByText('1 camera keyframe', { exact: true })).toBeVisible();
  await seekPlayerCamera(page, 500);
  await page.getByRole('button', { name: 'Capture camera at playhead', exact: true }).click();
  await expect(page.getByText('2 camera keyframes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.getByText('1 camera keyframe', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(page.getByText('2 camera keyframes', { exact: true })).toBeVisible();
  await page.getByText('Project vault & interchange', { exact: true }).click();
  const download = await readDownload(page, 'Export project JSON');
  const exported = importTacticalProjectJson(download.bytes.toString('utf8'), download.filename);
  expect(exported.playerTokens[1]!.position.x).toBeCloseTo(0.12, 10);
  expect(exported.cameraStates.map(camera => camera.timeMs)).toEqual([0, 500]);
  for (const camera of exported.cameraStates) {
    expect(camera.position).toEqual({ x: -38, y: 1.2, z: -15 }); expect(camera.fieldOfViewDeg).toBe(90);
    expect(camera.target.x).toBeCloseTo(-38, 10); expect(camera.target.y).toBe(1.2); expect(camera.target.z).toBeCloseTo(-5, 10);
    expect(Object.keys(camera).sort()).toEqual(['fieldOfViewDeg', 'id', 'position', 'target', 'timeMs']);
  }
  expect(download.bytes.toString('utf8')).not.toMatch(/playerView|eyeHeightMeters|firstPerson/);
  await page.getByLabel('Import project file').setInputFiles({ name: 'r52-captured.json', mimeType: 'application/json', buffer: download.bytes });
  await expect(toggle).not.toBeChecked(); await expect(page.getByLabel('Player eye height (m)', { exact: true })).toHaveValue('1.7');
  await expect(page.getByLabel('Player field of view (deg)', { exact: true })).toHaveValue('70');
  await expect(page.getByText('2 camera keyframes', { exact: true })).toBeVisible();
});

test('TMS-R52 restores a captured level player camera without an orbit-clamp tilt', async ({ page }) => {
  await loadPlayerCameraProject(page); await page.locator('.tactical-player-list button').nth(1).click();
  const toggle = page.getByRole('checkbox', { name: 'First-person player camera', exact: true }); await toggle.check();
  await page.getByLabel('Player eye height (m)', { exact: true }).fill('1.2');
  await page.getByLabel('Player field of view (deg)', { exact: true }).fill('90');
  await page.getByRole('button', { name: 'Capture camera at playhead', exact: true }).click();
  const canvas = page.locator('#tactical-3d-panel canvas'); const captured = await canvas.screenshot();
  await toggle.uncheck();
  await expect(page.getByTestId('tactical-player-camera-summary')).toContainText(/orbit.*authored/i);
  const restored = await canvas.screenshot();
  await test.info().attach('captured-player-camera', { body: captured, contentType: 'image/png' });
  await test.info().attach('restored-player-camera', { body: restored, contentType: 'image/png' });
  expect(restored.equals(captured)).toBe(true);
});

test('TMS-R52 explains invalid draft settings without capturing or losing the project', async ({ page }) => {
  await loadPlayerCameraProject(page);
  await page.getByRole('checkbox', { name: 'First-person player camera', exact: true }).check();
  const height = page.getByLabel('Player eye height (m)', { exact: true }); const fov = page.getByLabel('Player field of view (deg)', { exact: true });
  const capture = page.getByRole('button', { name: 'Capture camera at playhead', exact: true }); const summary = page.getByTestId('tactical-player-camera-summary');
  for (const value of ['', '0', '3.1']) {
    await height.fill(value); await expect(height).toHaveValue(value); await expect(height).toHaveAttribute('aria-invalid', 'true');
    await expect(summary).toContainText(/eye height/i); await expect(capture).toBeDisabled();
  }
  await height.fill('1.2'); await fov.fill('121'); await expect(fov).toHaveAttribute('aria-invalid', 'true');
  await expect(summary).toContainText(/field of view/i); await expect(capture).toBeDisabled();
  await fov.fill('90'); await expect(summary).toContainText('Y 1.20 m'); await expect(summary).toContainText('FOV 90.0°'); await expect(capture).toBeEnabled();
  await expect(page.getByText('0 camera keyframes', { exact: true })).toBeVisible();
  await height.fill('1.75'); expect(await height.evaluate(input => (input as HTMLInputElement).validity.valid)).toBe(true);
  await fov.fill('73.5'); expect(await fov.evaluate(input => (input as HTMLInputElement).validity.valid)).toBe(true);
  await expect(summary).toContainText('Y 1.75 m'); await expect(summary).toContainText('FOV 73.5°');
});

test('TMS-R52 has keyboard touch and accessible reflowing player camera controls', async ({ page, isMobile }) => {
  await loadPlayerCameraProject(page);
  const toggle = page.getByRole('checkbox', { name: 'First-person player camera', exact: true });
  await toggle.focus(); await toggle.press('Space'); await expect(toggle).toBeChecked();
  const height = page.getByLabel('Player eye height (m)', { exact: true }); const fov = page.getByLabel('Player field of view (deg)', { exact: true });
  await height.fill('1.8'); await height.press('ArrowUp'); await expect(height).toHaveValue('1.9');
  await fov.focus(); await fov.press('ArrowDown'); await expect(fov).toHaveValue('65');
  if (isMobile) { await toggle.tap(); await expect(toggle).not.toBeChecked(); await toggle.tap(); await expect(toggle).toBeChecked(); }
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.locator('#tactical-3d-panel').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    for (const target of [toggle.locator('..'), height, fov]) expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const results = await new AxeBuilder({ page }).include('#tactical-3d-panel').analyze();
  expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
});

test('TMS-R52 preserves the 2D editor and camera description when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original: unknown = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')?.value;
    if (typeof original !== 'function') throw new Error('Canvas context method is unavailable.');
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, context: string, options?: unknown) {
      if (context === 'webgl' || context === 'webgl2' || context === 'experimental-webgl') return null;
      return Reflect.apply(original, this, [context, options]) as RenderingContext | null;
    } as HTMLCanvasElement['getContext'];
  });
  await page.reload(); await loadPlayerCameraProject(page);
  await page.locator('.tactical-player-list button').nth(1).click();
  await page.getByRole('checkbox', { name: 'First-person player camera', exact: true }).check();
  await expect(page.locator('#tactical-3d-panel .notice')).toContainText(/webgl/i);
  await expect(page.locator('#tactical-3d-panel canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Move player right', exact: true }).click();
  await expect(coordinateInput(page, 'X')).toHaveValue('12.0');
  await expect(page.getByTestId('tactical-player-camera-summary')).toContainText('X -38.00 m');
  await expect(page.locator('.tactical-board-svg')).toBeVisible();
});

test('synchronizes the lazy 3D pitch, canonical player editing, and authored camera keyframes', async ({ page }) => {
  await page.getByRole('button', { name: 'Show 3D view' }).click();
  await expect(page.getByRole('heading', { name: '3D pitch view' })).toBeVisible();
  await expect(page.getByTestId('tactical-3d-canvas')).toBeVisible();

  await page.locator('.tactical-player-list button').first().click();
  const beforeX = Number(await coordinateInput(page, 'X').inputValue());
  await expect(page.getByTestId('tactical-3d-summary')).toContainText(/Selected token-1/i);

  await page.getByRole('button', { name: 'Move player right' }).click();
  const afterX = Number(await coordinateInput(page, 'X').inputValue());
  expect(afterX).toBeGreaterThan(beforeX);
  await expect(page.getByTestId('tactical-3d-summary')).toContainText(afterX.toFixed(1) + '% X');

  await page.getByLabel('Camera preset').selectOption('broadcast');
  await page.getByRole('button', { name: 'Capture camera at playhead' }).click();
  await expect(page.getByText('1 camera keyframe', { exact: true })).toBeVisible();
  await expect(page.locator('.status-line').last()).toContainText(/camera keyframe captured/i);

  await page.getByLabel('Camera preset').selectOption('goal-line');
  await page.getByRole('button', { name: 'Capture camera at playhead' }).click();
  await expect(page.getByText('1 camera keyframe', { exact: true })).toBeVisible();

  const controls = page.locator('.tactical-3d-controls').locator('button, select');
  for (let index = 0; index < await controls.count(); index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const panelOverflow = await page.locator('#tactical-3d-panel').evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(panelOverflow).toBeLessThanOrEqual(1);

  const results = await new AxeBuilder({ page }).include('#tactical-3d-panel').analyze();
  const severe = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
  expect(severe, severe.map((item) => item.id + ': ' + item.help).join('\n')).toEqual([]);
});

test('reports local video files that cannot be reviewed', async ({ page }) => {
  await page.getByText('Local video review', { exact: true }).click();
  await page.getByLabel('Open local match video').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a video'),
  });
  await expect(page.getByRole('alert')).toContainText(/supported local video/i);
  await expect(page.getByTestId('tactical-video-duration')).toHaveText('Duration unavailable');

  await page.getByLabel('Open local match video').setInputFiles({
    name: 'broken.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('this is not a playable mp4'),
  });
  await expect(page.getByRole('alert')).toContainText(/decoded|cannot play|could not be reviewed|could not be read/i);
  await expect(page.getByTestId('tactical-review-video')).toBeVisible();
});

test('reviews local video with telestration, tracking, events, clips, and manual angle sync', async ({ page }) => {
  await page.getByText('Local video review', { exact: true }).click();
  await page.getByLabel('Open local match video').setInputFiles(localReviewVideo);
  await expect(page.getByTestId('tactical-video-duration')).not.toHaveText('Duration unavailable');
  const duration = Number((await page.getByTestId('tactical-video-duration').innerText()).replace(/[^\d]/g, ''));
  expect(duration).toBeGreaterThan(200);

  await page.getByRole('button', { name: 'Step forward one frame' }).click();
  await expect(page.getByTestId('tactical-video-time')).not.toHaveText('Review time 0 ms');
  await page.getByLabel('Review time (ms)').fill('0');
  await page.getByRole('button', { name: 'Set review time' }).click();
  await expect(page.getByTestId('tactical-video-time')).toHaveText('Review time 0 ms');

  await page.getByLabel('Telestration end (ms)').fill('200');
  await page.getByRole('button', { name: 'Add telestration' }).click();
  await expect(page.getByTestId('tactical-telestration-list')).toContainText(/arrow/i);
  await expect(page.locator('.status-line').last()).toContainText(/telestration/i);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('tactical-telestration-list')).not.toContainText(/arrow/i);
  await expect(page.getByTestId('tactical-video-duration')).not.toHaveText('Duration unavailable');
  await page.getByRole('button', { name: 'Add telestration' }).click();
  await expect(page.getByTestId('tactical-video-overlay').locator('line')).toBeVisible();

  await page.getByLabel('Track end (ms)').fill(String(duration));
  await page.getByRole('button', { name: 'Add overlay track' }).click();
  await page.getByRole('button', { name: 'Add track anchor' }).click();
  await expect(page.getByTestId('tactical-track-sample')).toContainText('Tracked position 40% , 50%');
  await expect(page.getByTestId('tactical-track-marker')).toBeVisible();

  await page.getByRole('button', { name: 'Add match event' }).click();
  await expect(page.getByTestId('tactical-event-list')).toContainText('Near-post goal at 0 ms');

  await page.getByLabel('Clip label').fill('Press');
  await page.getByLabel('Clip start (ms)').fill('0');
  await page.getByLabel('Clip end (ms)').fill('200');
  await page.getByRole('button', { name: 'Add clip' }).click();
  await page.getByLabel('Clip label').fill('Shot');
  await page.getByLabel('Clip start (ms)').fill('200');
  await page.getByLabel('Clip end (ms)').fill(String(duration));
  await page.getByRole('button', { name: 'Add clip' }).click();
  await page.getByRole('button', { name: 'Create playlist' }).click();
  await page.getByRole('button', { name: 'Move Shot earlier' }).click();
  await expect(page.getByTestId('tactical-playlist-order').locator('li').first()).toContainText('Shot');
  await page.getByRole('button', { name: 'Play playlist' }).click();
  await expect.poll(async () => page.getByTestId('tactical-review-video').evaluate((element) => (
    element instanceof HTMLVideoElement ? element.currentTime : 0
  ))).toBeGreaterThan(0.15);
  await expect(page.getByRole('button', { name: 'Pause review' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause review' }).click();

  await page.getByLabel('Open comparison angle').setInputFiles(localReviewVideo);
  await expect(page.getByTestId('tactical-comparison-video')).toBeVisible();
  await expect(page.getByTestId('tactical-comparison-duration')).not.toHaveText('Duration unavailable');
  await expect(page.getByTestId('tactical-angle-offset')).toHaveText('Angle offset Not set');
  await page.getByLabel('Review time (ms)').fill('0');
  await page.getByRole('button', { name: 'Set review time' }).click();
  await page.getByLabel('Sync shared time (ms)').fill('0');
  await page.getByLabel('Sync angle time (ms)').fill('200');
  await page.getByRole('button', { name: 'Set sync anchor' }).click();
  await expect(page.getByTestId('tactical-angle-offset')).toHaveText('Angle offset 200 ms');
  await expect.poll(async () => page.getByTestId('tactical-comparison-video').evaluate((element) => (
    element instanceof HTMLVideoElement ? element.currentTime : 0
  ))).toBeGreaterThan(0.15);

  const controls = page.locator('#tactical-video-panel').locator('button, select');
  for (let index = 0; index < await controls.count(); index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box?.height ?? 0, `video control ${index}`).toBeGreaterThanOrEqual(44);
  }
  const panelOverflow = await page.locator('#tactical-video-panel').evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(panelOverflow).toBeLessThanOrEqual(1);
  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(documentOverflow).toBeLessThanOrEqual(1);

  const results = await new AxeBuilder({ page }).include('#tactical-video-panel').analyze();
  const severe = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''));
  expect(severe, severe.map((item) => item.id + ': ' + item.help).join('\n')).toEqual([]);
});

async function readDownload(page: Page, name: string) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { filename: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

test('authors chapter fades and morphs with matching preview and standalone export', async ({ page }) => {
  test.setTimeout(120_000);
  const scenePicker = page.getByRole('combobox', { name: 'Scene view', exact: true });
  const firstScene = await scenePicker.inputValue();
  await coordinateInput(page, 'X').fill('20');
  await coordinateInput(page, 'Y').fill('50');
  await page.getByRole('button', { name: 'Set position', exact: true }).click();
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Split at (ms)').fill('1000');
  await page.getByLabel('New scene name', { exact: true }).fill('Arrival');
  await page.getByRole('button', { name: 'Split scene', exact: true }).click();
  await expect(page.locator('.status-line').last()).toContainText('Timeline scene split.');
  await scenePicker.selectOption({ label: 'Arrival' });
  await coordinateInput(page, 'X').fill('80');
  await page.getByRole('button', { name: 'Set position', exact: true }).click();
  await scenePicker.selectOption(firstScene);
  await page.getByLabel('Exit transition').selectOption('fade');
  await page.getByLabel('Transition duration (ms)').fill('500');
  await page.getByRole('button', { name: 'Save chapter transition', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.status-line').last()).toContainText('Chapter transition saved.');
  await expect(page.getByRole('button', { name: 'Save chapter transition', exact: true })).toBeFocused();
  const svg = page.locator('.tactical-board-svg > svg');
  const seek = async (time: string) => {
    await page.getByLabel('Playhead (ms)').fill(time);
    await page.getByRole('button', { name: 'Set playhead', exact: true }).click();
  };
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Exit transition')).toHaveValue('none');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByLabel('Exit transition')).toHaveValue('fade');
  await seek('625');
  await expect(svg).toHaveAttribute('opacity', '0.5');
  await page.getByRole('button', { name: 'Show 3D view', exact: true }).click();
  await expect(page.getByTestId('tactical-3d-canvas')).toHaveCSS('opacity', '0.5');
  await page.getByRole('button', { name: 'Hide 3D view', exact: true }).click();
  await seek('750');
  await expect(svg).toHaveAttribute('opacity', '0');
  await seek('875');
  await expect(svg).toHaveAttribute('opacity', '0.5');
  await seek('1000');
  await expect(svg).not.toHaveAttribute('opacity');
  await expect(scenePicker.locator('option:checked')).toHaveText('Arrival');
  await page.getByText('Professional export', { exact: true }).click();
  const html = await readDownload(page, 'Download standalone HTML');
  const data = /id="tactical-playback-data">([\s\S]*?)<\/script>/.exec(html.bytes.toString('utf8'));
  expect(data).not.toBeNull();
  const payload = JSON.parse(data![1]!) as { frames: Array<{ timeMs: number; svg: string }> };
  expect(payload.frames.find(frame => frame.timeMs === 625)?.svg).toContain('opacity="0.5"');
  expect(payload.frames.find(frame => frame.timeMs === 875)?.svg).toContain('opacity="0.5"');
  const playback = await page.context().newPage();
  const stepFrame = await playback.evaluateHandle(() => {
    const pending: FrameRequestCallback[] = [];
    window.requestAnimationFrame = callback => { pending.push(callback); return pending.length; };
    return (timeMs: number) => pending.splice(0).forEach(callback => callback(timeMs));
  });
  await playback.setContent(html.bytes.toString('utf8'));
  await playback.getByRole('button', { name: 'Play', exact: true }).dispatchEvent('click');
  await stepFrame.evaluate(step => step(1));
  await stepFrame.evaluate(step => step(651));
  await expect(playback.locator('#tactical-playback-clock')).toHaveText('625 ms');
  await stepFrame.evaluate(step => step(901));
  await expect(playback.locator('#tactical-playback-clock')).toHaveText('875 ms');
  await stepFrame.dispose();
  await playback.close();
  await scenePicker.selectOption(firstScene);
  await page.getByLabel('Exit transition').selectOption('morph');
  await page.getByRole('button', { name: 'Save chapter transition', exact: true }).click();
  await seek('750');
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]').first()).toHaveAttribute('transform', /translate\(500 /);
  await expect(svg).not.toHaveAttribute('opacity');
  await scenePicker.selectOption(firstScene);
  await page.getByLabel('Transition duration (ms)').fill('1001');
  await page.getByRole('button', { name: 'Save chapter transition', exact: true }).click();
  await expect(page.locator('.status-line').last()).toContainText('transition kind or duration is invalid');
  const form = page.getByRole('form', { name: 'Chapter transition', exact: true });
  for (const control of await form.locator('input, select, button').all()) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page }).include('form[aria-label="Chapter transition"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('exports metadata, analytics, playback, and a capability-checked video fallback', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByText('Professional export', { exact: true }).click();
  await page.getByLabel('Export title').fill('Pressing shape');
  await page.getByLabel('Export notes').fill('Keep the press. José Αθήνα Иванов');
  await page.getByRole('button', { name: 'Save export metadata' }).click();
  await expect(page.locator('.status-line')).toContainText('Export metadata saved.');

  const analytics = await readDownload(page, 'Download analytics JSON');
  expect(analytics.filename).toBe('pressing-shape-analytics.json');
  const report = JSON.parse(analytics.bytes.toString('utf8')) as { honesty: string; rows: Array<{ metric: string }> };
  expect(report.honesty).toMatch(/not a gps reading/i);
  expect(report.honesty).toMatch(/officiating decision/i);
  expect(JSON.stringify(report)).not.toMatch(/expected goals|win probability|gps latitude/i);
  expect(report.rows.some((row) => row.metric === 'length_meters')).toBe(true);

  const html = await readDownload(page, 'Download standalone HTML');
  expect(html.filename).toBe('pressing-shape-playback.html');
  const htmlText = html.bytes.toString('utf8');
  expect(htmlText.startsWith('<!DOCTYPE html>')).toBe(true);
  expect(htmlText).toContain('Pressing shape');
  expect(htmlText).not.toContain('<script src');

  const social = await readDownload(page, 'Download social card');
  expect(social.filename).toBe('pressing-shape-landscape.svg');
  expect(social.bytes.toString('utf8')).toContain('width="1920"');
  expect(social.bytes.toString('utf8')).toContain('Pressing shape');

  const pdf = await readDownload(page, 'Download PDF package');
  expect(pdf.filename).toBe('pressing-shape-coaching.zip');
  expect(Array.from(pdf.bytes.subarray(0, 2))).toEqual([0x50, 0x4b]);
  const pdfZip = await JSZip.loadAsync(pdf.bytes);
  const coachingPdf = await pdfZip.file('coaching.pdf')?.async('nodebuffer');
  expect(coachingPdf?.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  const sidecar = JSON.parse(await pdfZip.file('metadata.json')?.async('string') ?? '{}') as { metadata: { notes: string }; teams: Array<{ name: string; players: string[] }> };
  expect(sidecar.metadata.notes).toContain('José Αθήνα Иванов');
  expect(Array.isArray(sidecar.teams)).toBe(true);
  let inflated = '';
  const source = coachingPdf ?? Buffer.alloc(0);
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('stream\n', cursor);
    if (start < 0) break;
    const dataStart = start + 'stream\n'.length;
    const end = source.indexOf('\nendstream', dataStart);
    if (end < 0) break;
    const chunk = source.subarray(dataStart, end);
    try {
      inflated += inflateSync(chunk).toString('latin1');
    } catch {
      inflated += chunk.toString('latin1');
    }
    cursor = end + '\nendstream'.length;
  }
  expect(inflated).toContain('/Encoding /Identity-H');
  expect(inflated).toMatch(/\/BaseFont \/NotoSans/);
  expect(inflated).toContain('/FontFile2');
  const cmap = inflated.split('beginbfchar').slice(1).join('\n');
  expect(cmap).toContain('<00E9>');
  expect(cmap).toContain('<0391>');
  expect(cmap).toContain('<0418>');

  const frames = await readDownload(page, 'Download frame-sequence ZIP');
  expect(frames.filename).toBe('pressing-shape-frames.zip');
  expect(Array.from(frames.bytes.subarray(0, 2))).toEqual([0x50, 0x4b]);

  await expect(page.getByTestId('tactical-raster-capability')).not.toContainText('Checking');
  if (await page.getByRole('button', { name: 'Download PNG' }).count()) {
    const png = await readDownload(page, 'Download PNG');
    expect(Array.from(png.bytes.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  await expect(page.getByTestId('tactical-video-capability')).not.toContainText('Checking');
  const videoStatus = await page.getByTestId('tactical-video-capability').innerText();
  test.info().annotations.push({ type: 'video-capability', description: videoStatus });
  const negotiated = page.getByTestId('negotiated-video-export');
  if (await negotiated.count()) {
    const downloadPromise = page.waitForEvent('download');
    await negotiated.first().click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const filename = download.suggestedFilename();
    expect(filename.endsWith('.mp4') || filename.endsWith('.webm')).toBe(true);
    const isMp4 = bytes.subarray(4, 8).toString('ascii') === 'ftyp';
    const isWebm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    expect(isMp4 || isWebm).toBe(true);
    const duration = await page.evaluate(async ({ encoded, mime }) => {
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const video = document.createElement('video');
      try {
        return await new Promise<number>((resolve, reject) => {
          video.onloadedmetadata = () => resolve(video.duration);
          video.onerror = () => reject(new Error('Encoded video metadata could not be read.'));
          video.preload = 'metadata';
          video.src = url;
        });
      } finally {
        video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
      }
    }, { encoded: bytes.toString('base64'), mime: isMp4 ? 'video/mp4' : 'video/webm' });
    const data = /id="tactical-playback-data">([\s\S]*?)<\/script>/.exec(html.bytes.toString('utf8'));
    const payload = JSON.parse(data![1]!) as { frames: Array<{ timeMs: number }> };
    const expectedDuration = payload.frames.at(-1)!.timeMs / 1000;
    expect(duration).toBeGreaterThanOrEqual(expectedDuration);
    expect(duration).toBeLessThan(expectedDuration + 1);
    await test.info().attach('encoded-video-duration', {
      body: JSON.stringify({ durationSeconds: duration, authoredDurationSeconds: expectedDuration }),
      contentType: 'application/json',
    });
  }

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Export title')).toHaveValue('Training board');
});

test('help, shortcuts, and tooltips stay available without taking over text fields', async ({ page }) => {
  await page.getByRole('button', { name: 'Help' }).click();
  const help = page.getByRole('dialog', { name: 'Tactical Matchboard help' });
  await expect(help).toBeVisible();
  await expect(help).toContainText('Shift+F10');
  await expect(help).toContainText('Players sheet');
  await expect(help.getByRole('button', { name: 'Close help' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await expect(page.locator('.status-line').last()).toContainText('Help reference closed.');

  await page.locator('#tactical-board-heading').click();
  await page.keyboard.press('Shift+A');
  await expect(page.locator('.tactical-board')).toHaveAttribute('data-interaction-mode', 'arrow');
  await page.getByLabel('Arrow label').focus();
  await page.keyboard.press('m');
  await expect(page.locator('.tactical-board')).toHaveAttribute('data-interaction-mode', 'arrow');
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('dialog', { name: 'Player actions' })).toHaveCount(0);

  await page.locator('#tactical-board-heading').click();
  await page.keyboard.press('m');
  await expect(page.locator('.tactical-board')).toHaveAttribute('data-interaction-mode', 'move');
  await page.keyboard.press('k');
  await expect(page.locator('.status-line').last()).toContainText(/Timeline playback started|Reduced motion stepped/i);

  await page.getByRole('button', { name: 'Help' }).focus();
  const tipBox = await page.getByRole('tooltip').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(tipBox.width).toBeGreaterThan(0);
  expect(tipBox.height).toBeGreaterThan(0);
  expect(tipBox.x).toBeGreaterThanOrEqual(-1);
  expect(tipBox.y).toBeGreaterThanOrEqual(-1);
  expect(tipBox.right).toBeLessThanOrEqual(tipBox.viewportWidth + 1);
  expect(tipBox.bottom).toBeLessThanOrEqual(tipBox.viewportHeight + 1);
});

async function beginTacticalTouch(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded(); await target.click({ trial: true });
  const box = await target.boundingBox(); if (!box) throw new Error('Touch target is unavailable.');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const session: CDPSession = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 7, ...point }] });
  let ended = false;
  return {
    point, session,
    async end(cancel = false) {
      if (ended) return; ended = true;
      await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      await session.detach();
    },
  };
}

function beginPlayerTouch(page: Page, tokenId = 'token-2') { return beginTacticalTouch(page, page.locator(`.tactical-board-svg #${tokenId}`)); }

const radialActions = (page: Page) => page.getByTestId('tactical-radial-actions');
const actionNames = ['Lock selected player', 'Move tool', 'Arrow tool', 'Move player up from actions', 'Move player left from actions', 'Move player right from actions', 'Move player down from actions', 'Close player actions'].sort();

test('TMS-R78 real touch holds a nonselected player through SVG updates without release edits', async ({ page }) => {
  const touch = await beginPlayerTouch(page);
  try {
    await expect(board(page)).toHaveAttribute('data-selected-token', 'token-2');
    const x = await coordinateInput(page, 'X').inputValue(); const y = await coordinateInput(page, 'Y').inputValue();
    const menu = radialActions(page); await expect(menu).toBeVisible(); await expect(menu).toHaveAttribute('data-layout', 'radial');
    await touch.end();
    await expect(coordinateInput(page, 'X')).toHaveValue(x); await expect(coordinateInput(page, 'Y')).toHaveValue(y);
    await expect(menu.getByRole('button', { name: 'Lock selected player', exact: true })).toBeVisible();
    const names = await menu.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '').sort());
    expect(names).toEqual(actionNames);
    await page.locator('.tactical-board').dispatchEvent('contextmenu', { pointerType: 'touch', button: 2 });
    await expect(menu).toBeVisible(); await expect(page.getByRole('dialog', { name: 'Player actions', exact: true })).toHaveCount(1);
    await menu.getByRole('button', { name: 'Close player actions', exact: true }).click();
    await expect(board(page)).toBeFocused();
    await page.getByRole('button', { name: 'Player actions', exact: true }).click();
    const legacy = page.getByRole('dialog', { name: 'Player actions', exact: true });
    expect(await legacy.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '').sort())).toEqual(actionNames);
    await expect(radialActions(page)).toHaveCount(0); await page.keyboard.press('Escape');
    const labelTouch = await beginTacticalTouch(page, page.locator('.tactical-board-svg [data-token-id="token-2"]'));
    await expect(menu).toBeVisible(); await labelTouch.end(); await page.keyboard.press('Escape');
  } finally { await touch.end(); }
});

test('TMS-R78 preserves quick taps and cancels motion extra contacts and pointer cancellation', async ({ page }) => {
  await page.clock.install(); const menu = radialActions(page);
  let touch = await beginPlayerTouch(page); await page.clock.runFor(100); await touch.end(); await page.clock.runFor(650); await expect(menu).toHaveCount(0);
  const surface = await board(page).boundingBox(); if (!surface) throw new Error('Board unavailable.');
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 9, x: surface.x + surface.width * 0.72, y: surface.y + surface.height * 0.68 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
  await expect(coordinateInput(page, 'X')).toHaveValue('72.0'); await expect(coordinateInput(page, 'Y')).toHaveValue('68.0');
  touch = await beginPlayerTouch(page);
  await touch.session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 7, x: touch.point.x + 16, y: touch.point.y }] });
  await page.clock.runFor(650); await expect(menu).toHaveCount(0); await touch.end();
  await expect(coordinateInput(page, 'X')).toHaveValue('72.0'); await expect(coordinateInput(page, 'Y')).toHaveValue('68.0');
  touch = await beginPlayerTouch(page);
  await touch.session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 7, ...touch.point }, { id: 8, x: touch.point.x + 30, y: touch.point.y + 20 }] });
  await page.clock.runFor(650); await expect(menu).toHaveCount(0); await touch.end();
  touch = await beginPlayerTouch(page); await touch.end(true); await page.clock.runFor(650); await expect(menu).toHaveCount(0);
});

test('TMS-R78 retains native page scrolling and mobile pinch without arming actions', async ({ page, isMobile }) => {
  const target = page.locator('.tactical-board-svg #token-2');
  // Read the target's coordinates before contact: traced locator reads can take
  // longer than a legitimate 500 ms hold. Reset selection to cover SVG updates.
  await target.click();
  const x = await coordinateInput(page, 'X').inputValue(); const y = await coordinateInput(page, 'Y').inputValue();
  await page.locator('.tactical-board-svg #token-1').click();
  await target.scrollIntoViewIfNeeded(); await target.click({ trial: true });
  const session = await page.context().newCDPSession(page);
  let contactActive = false;
  try {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    const before = await page.evaluate(() => scrollY);
    const box = await target.boundingBox(); if (!box) throw new Error('Touch target is unavailable.');
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 7, ...point }] }); contactActive = true;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 7, x: point.x, y: point.y - 30 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 7, x: point.x, y: point.y - 100 }] });
    await expect.poll(async () => page.evaluate(() => scrollY)).toBeGreaterThan(before);
    // Wait for native scroll completion, including fling, before aiming another
    // contact at a token. No fixed sleep or altered page scrolling behavior.
    const finished = await page.evaluateHandle(() => {
      const state = { complete: false };
      globalThis.addEventListener('scrollend', () => { state.complete = true; }, { once: true, capture: true });
      return state;
    });
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); contactActive = false;
      await expect.poll(() => finished.evaluate(state => state.complete)).toBe(true);
    } finally { await finished.dispose(); }
  } finally {
    if (contactActive) await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await session.detach();
  }
  if (isMobile) {
    const scale = await page.evaluate(() => visualViewport?.scale ?? 1);
    const pinch = await beginPlayerTouch(page);
    try {
      await pinch.session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 7, ...pinch.point }, { id: 8, x: pinch.point.x + 60, y: pinch.point.y }] });
      for (const distance of [15, 35]) await pinch.session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 7, x: pinch.point.x - distance, y: pinch.point.y }, { id: 8, x: pinch.point.x + 60 + distance, y: pinch.point.y }] });
      await expect.poll(async () => page.evaluate(() => visualViewport?.scale ?? 1)).toBeGreaterThan(scale);
    } finally { await pinch.end(); }
  }
  await expect(radialActions(page)).toHaveCount(0);
  await expect(coordinateInput(page, 'X')).toHaveValue(x); await expect(coordinateInput(page, 'Y')).toHaveValue(y);
});

test('TMS-R78 cancels interrupted and unmounted holds without stale menu callbacks', async ({ page }) => {
  await page.clock.install(); const menu = radialActions(page);
  for (const type of ['scroll', 'resize', 'blur']) {
    const touch = await beginPlayerTouch(page); await page.evaluate(type => globalThis.dispatchEvent(new Event(type)), type);
    await page.clock.runFor(650); await expect(menu).toHaveCount(0); await touch.end();
  }
  let touch = await beginPlayerTouch(page); await page.keyboard.press('Shift+A'); await expect(board(page)).toHaveAttribute('data-interaction-mode', 'arrow'); await page.clock.runFor(650); await expect(menu).toHaveCount(0); await touch.end();
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  touch = await beginPlayerTouch(page); await page.goto('./#/'); await touch.end(); await page.clock.runFor(650); await expect(menu).toHaveCount(0);
  await page.goto('./#/tools/tactical-matchboard-studio');
  touch = await beginPlayerTouch(page); await page.clock.runFor(500); await expect(menu).toBeVisible(); await touch.end();
  await expect(page.getByRole('dialog', { name: 'Player actions', exact: true })).toHaveCount(1); await page.keyboard.press('Escape');
});

test('TMS-R78 shares canonical nudges locks tools undo redo and JSON without gesture fields', async ({ page }) => {
  let touch = await beginPlayerTouch(page); const menu = radialActions(page); await expect(menu).toBeVisible(); await touch.end();
  const x = Number(await coordinateInput(page, 'X').inputValue());
  await menu.getByRole('button', { name: 'Move player right from actions', exact: true }).click();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(x + 2, 1);
  const lockTouch = await beginTacticalTouch(page, menu.getByRole('button', { name: 'Lock selected player', exact: true })); await lockTouch.end();
  await expect(menu.getByRole('button', { name: 'Unlock selected player', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Close player actions', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(x, 1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.getByRole('button', { name: 'Redo', exact: true }).click();
  touch = await beginPlayerTouch(page); await expect(menu).toBeVisible(); await touch.end();
  await menu.getByRole('button', { name: 'Move player right from actions', exact: true }).click(); await expect(page.locator('.status-line').last()).toContainText(/locked/i);
  await menu.getByRole('button', { name: 'Unlock selected player', exact: true }).click();
  await menu.getByRole('button', { name: 'Arrow tool', exact: true }).click(); await expect(board(page)).toHaveAttribute('data-interaction-mode', 'arrow');
  await menu.getByRole('button', { name: 'Move tool', exact: true }).click(); await expect(board(page)).toHaveAttribute('data-interaction-mode', 'move');
  await menu.getByRole('button', { name: 'Arrow tool', exact: true }).click(); await menu.getByRole('button', { name: 'Close player actions', exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-interaction-mode', 'arrow');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByText('Project vault & interchange', { exact: true }).click(); const download = await readDownload(page, 'Export project JSON');
  const restored = importTacticalProjectJson(download.bytes.toString('utf8'), download.filename);
  expect(restored.playerTokens[1]!.locked).toBe(false); expect(restored.playerTokens[1]!.position.x * 100).toBeCloseTo(x + 2, 1);
  expect(download.bytes.toString('utf8')).not.toMatch(/longPress|radialAnchor|actionsAnchor/);
});

test('TMS-R78 disables unavailable sampled targets and dismisses actions on project replacement', async ({ page }) => {
  const base = buildBeginnerTacticalProject({
    title: 'R78 availability contract', teamName: 'Team', primaryColor: '#154c79', secondaryColor: '#ffffff',
    formationId: 'ussf-4v4-1-2-1', pitchDimensions: { lengthMeters: 100, widthMeters: 50 }, direction: 'left-to-right',
  });
  const outgoing = base.playerTokens[1]!; const incoming = base.playerTokens[3]!; incoming.visible = false;
  base.teams[0]!.roster.find(player => player.id === incoming.playerId)!.status = 'substitute';
  const project = addTimelineSubstitutionEvent(base, { id: 'r78-swap', outgoingTargetId: outgoing.id, incomingTargetId: incoming.id, timeMs: 1000 });
  await page.getByText('Project vault & interchange', { exact: true }).click();
  const file = page.getByLabel('Import project file');
  await file.setInputFiles({ name: 'r78-visibility.json', mimeType: 'application/json', buffer: Buffer.from(exportTacticalProjectJson(project)) });
  await expect(setupPanel(page).getByLabel('Project title')).toHaveValue('R78 availability contract');
  await page.getByText('Timeline & motion', { exact: true }).click();
  const playhead = page.locator('form[aria-label="Timeline playhead"]');
  async function sampleAt(timeMs: number) {
    await playhead.evaluate((form, timeMs) => {
      if (!(form instanceof HTMLFormElement)) throw new Error('Playhead form unavailable.');
      const input = form.elements.namedItem('playheadMs'); if (!(input instanceof HTMLInputElement)) throw new Error('Playhead input unavailable.');
      input.value = String(timeMs); form.requestSubmit();
    }, timeMs);
  }
  await page.clock.install(); const menu = radialActions(page);
  let touch = await beginPlayerTouch(page); await sampleAt(1000); await page.clock.runFor(650); await touch.end(); await expect(menu).toHaveCount(0);
  await sampleAt(0); touch = await beginPlayerTouch(page); await page.clock.runFor(500); await expect(menu).toBeVisible(); await touch.end();
  await sampleAt(1000); await expect(menu).toContainText('This player is unavailable.');
  const actions = menu.locator('button[data-player-action]:not([data-player-action="close"])'); await expect(actions).toHaveCount(7);
  for (const button of await actions.all()) await expect(button).toBeDisabled();
  await expect(menu.getByRole('button', { name: 'Close player actions', exact: true })).toBeEnabled();
  await expect(menu.getByRole('button', { name: 'Close player actions', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 380 });
  for (const size of [{ root: 16, body: 20 }, ...[16, 17, 18, 19, 20].map(value => ({ root: value, body: value }))]) {
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size.root}px`; document.body.style.fontSize = `${size.body}px`; }, size);
    await expect.poll(async () => menu.evaluate(element => element.dataset.layout === 'compact' || element.scrollHeight - element.clientHeight <= 1), `${size.root}px root / ${size.body}px body: radial must fit or use compact controls`).toBe(true);
  }
  await expect.poll(async () => menu.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  base.metadata.title = 'R78 replacement contract';
  await file.setInputFiles({ name: 'r78-replacement.json', mimeType: 'application/json', buffer: Buffer.from(exportTacticalProjectJson(base)) });
  await expect(menu).toHaveCount(0); await expect(setupPanel(page).getByLabel('Project title')).toHaveValue('R78 replacement contract');
  await expect(board(page)).toHaveAttribute('data-selected-token', 'token-1');
});

test('TMS-R78 radial controls reflow at edges zoom large text and dark theme with focus return', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('inmotools.theme.v1', 'dark')); await page.reload();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const touch = await beginPlayerTouch(page); const menu = radialActions(page); await expect(menu).toBeVisible(); await touch.end();
  await expect(menu.getByRole('button', { name: 'Lock selected player', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(menu.getByRole('button', { name: 'Close player actions', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(menu.getByRole('button', { name: 'Lock selected player', exact: true })).toBeFocused();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(async () => menu.evaluate(element => {
      const r = element.getBoundingClientRect(); return r.left >= 7 && r.top >= 7 && r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7;
    })).toBe(true);
    const boxes = await menu.getByRole('button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }));
    for (const box of boxes) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!; const b = boxes[j]!; expect(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; }); await expect(menu).toHaveAttribute('data-layout', 'compact');
  await expect.poll(async () => menu.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.documentElement.style.zoom = '1.5'; });
  await expect.poll(async () => menu.evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 7 && r.top >= 7 && r.right <= innerWidth - 7 && r.bottom <= innerHeight - 7; })).toBe(true);
  const results = await new AxeBuilder({ page }).include('[data-testid="tactical-radial-actions"]').analyze();
  expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(board(page)).toBeFocused();
});

test('TMS-R78 excludes mouse drawing and pan gestures and retains Shift F10 actions', async ({ page }) => {
  await page.clock.install(); const target = page.locator('.tactical-board-svg #token-2'); await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox(); if (!box) throw new Error('Player unavailable.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.clock.runFor(650); await page.mouse.up(); await expect(radialActions(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Arrow', exact: true }).click(); let touch = await beginPlayerTouch(page); await page.clock.runFor(650); await touch.end(); await expect(radialActions(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Freehand', exact: true }).click(); touch = await beginPlayerTouch(page); await page.clock.runFor(650); await touch.end(); await expect(radialActions(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Move', exact: true }).click(); await page.getByRole('button', { name: 'Drag to pan', exact: true }).click();
  touch = await beginPlayerTouch(page); await page.clock.runFor(650); await touch.end(); await expect(radialActions(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Drag to pan', exact: true }).click();
  await page.locator('.tactical-player-list button').nth(1).focus(); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('dialog', { name: 'Player actions', exact: true })).toBeVisible(); await expect(radialActions(page)).toHaveCount(0); await page.keyboard.press('Escape');
});

test('player actions from right-click and the touch button lock the same player', async ({ page }) => {
  await page.locator('.tactical-board-svg g[data-tactical-kind="player"]').first().click({ button: 'right' });
  const dialog = page.getByRole('dialog', { name: 'Player actions' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Lock selected player' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Selected player locked.');
  await dialog.getByRole('button', { name: 'Close player actions' }).click();
  await page.getByRole('button', { name: 'Move player right' }).click();
  await expect(page.locator('.status-line').last()).toContainText(/locked/i);

  await page.getByRole('button', { name: 'Unlock selected player' }).click();
  await page.getByRole('button', { name: 'Player actions' }).click();
  await expect(page.getByRole('dialog', { name: 'Player actions' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Player actions' })).toHaveCount(0);
});

test('groups, reorders, solos, and focuses scene layers', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Include Goalkeeper 1 in group' }).check();
  await page.getByRole('checkbox', { name: 'Include Player 2 in group' }).check();
  await page.getByLabel('Group layer name').fill('Pressing unit');
  await page.getByRole('button', { name: 'Group checked players' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Grouped 2 players on Pressing unit.');
  await expect(page.getByRole('button', { name: 'Solo Pressing unit' })).toBeVisible();

  await page.getByRole('button', { name: 'Move Pressing unit up' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Layer moved up.');
  await page.getByRole('button', { name: 'Solo Pressing unit' }).click();
  await expect(page.locator('.tactical-board-svg g[data-tactical-kind="player"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Focus Pressing unit' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Focused layer Pressing unit.');
  await expect(page.locator('.tactical-board')).toHaveAttribute('data-selected-token', 'token-1');

  await page.getByRole('button', { name: 'Show players' }).click();
  await page.locator('.tactical-player-list button', { hasText: 'Player 3' }).click();
  await page.getByRole('button', { name: 'Show layers' }).click();
  await page.getByRole('checkbox', { name: 'Lock Tactics' }).check();
  await page.getByRole('button', { name: 'Show players' }).click();
  await page.getByRole('button', { name: 'Move player right' }).click();
  await expect(page.locator('.status-line').last()).toContainText(/locked/i);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Undid the last board edit.');
});

test('narrow sheets keep the pitch first and return focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const boardBox = await page.locator('.tactical-board').boundingBox();
  const setupBox = await page.locator('.tactical-setup').first().boundingBox();
  expect(boardBox && setupBox && boardBox.y < setupBox.y).toBe(true);

  await page.getByRole('button', { name: 'Players sheet' }).click();
  await expect(page.locator('.tactical-matchboard-workspace')).toHaveAttribute('data-inspector-sheet', 'open');
  await expect(page.getByRole('button', { name: 'Close players sheet' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tactical-matchboard-workspace')).toHaveAttribute('data-inspector-sheet', 'closed');
  await expect(page.getByRole('button', { name: 'Players sheet' })).toBeFocused();

  await page.getByRole('button', { name: 'Timeline sheet' }).click();
  await expect(page.locator('.tactical-timeline-panel')).toHaveClass(/tactical-sheet-active/);
  await expect(page.getByRole('button', { name: 'Close timeline sheet' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Play timeline' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tactical-matchboard-workspace')).toHaveAttribute('data-timeline-sheet', 'closed');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('reduced motion steps playback instead of animating it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.tactical-matchboard-workspace')).toHaveAttribute('data-reduced-motion', 'reduce');
  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Motion target').selectOption('token-1');
  await page.getByLabel('Motion start (ms)').fill('0');
  await page.getByLabel('Motion end (ms)').fill('1000');
  await page.getByLabel('Motion end X %').fill('80');
  await page.getByLabel('Motion end Y %').fill('20');
  await page.getByRole('button', { name: 'Author motion segment' }).click();
  await page.getByRole('button', { name: 'Play timeline' }).click();
  await expect(page.getByTestId('timeline-preview-time')).toHaveText('1000 ms');
  await expect(page.locator('.status-line').last()).toContainText('Reduced motion stepped to the next keyframe.');
  await expect(page.getByRole('button', { name: 'Play timeline' })).toBeEnabled();
});

test('scales a squad and authors tokens, props, elevation, spotlight, ghosts, and scenario comparison', async ({ page }) => {
  const stage = page.locator('.tactical-stage-panel');
  await stage.locator('summary').click();
  await expect(page.getByTestId('squad-summary')).toContainText('7 active');

  await stage.getByLabel('Active players').fill('9');
  await stage.getByRole('button', { name: 'Scale squad' }).click();
  await expect(page.getByTestId('squad-summary')).toContainText('9 active');
  await expect(page.locator('.tactical-player-list button')).toHaveCount(9);

  await stage.getByLabel('Role').fill('Pivot');
  await stage.getByLabel('Developmental token').fill('first-year');
  await stage.getByLabel('Status').selectOption('neutral');
  await stage.getByRole('button', { name: 'Save token' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Roster token updated.');
  await expect(page.getByTestId('squad-summary')).toContainText('1 neutral');

  await stage.getByLabel('Coordinate target').selectOption('ball');
  await stage.getByLabel('Entry').selectOption('meters');
  await stage.getByLabel('Coordinate X').fill('30');
  await stage.getByLabel('Coordinate Y').fill('20');
  await stage.getByRole('button', { name: 'Apply coordinates' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Canonical coordinates applied.');

  await stage.getByRole('button', { name: 'Place Cone' }).click();
  await expect(page.locator('[data-equipment-kind="cone"]')).toHaveCount(1);
  await stage.getByLabel('Rotation').fill('45');
  await stage.getByLabel('Prop scale').fill('1.5');
  await stage.getByRole('button', { name: 'Apply prop transform' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Training prop transformed.');

  await stage.getByLabel('Elevation time (ms)').fill('0');
  await stage.getByLabel('Elevation (m)').fill('0');
  await stage.getByRole('button', { name: 'Author elevation' }).click();
  await stage.getByLabel('Elevation time (ms)').fill('1000');
  await stage.getByLabel('Elevation (m)').fill('8');
  await stage.getByRole('button', { name: 'Author elevation' }).click();
  await expect(page.locator('[data-tactical-kind="elevation-trajectory"]')).toHaveCount(1);

  await stage.getByRole('button', { name: 'Add spotlight' }).click();
  await expect(page.locator('[data-annotation-kind="spotlight"]')).toHaveCount(1);

  await stage.getByRole('button', { name: 'Record onion-skin positions' }).click();
  await page.getByRole('button', { name: 'Move player right' }).click();
  await stage.getByRole('button', { name: 'Capture scenario' }).click();
  await expect(page.locator('.status-line').last()).toContainText('Base shape captured');
  await stage.getByLabel('Scenario label').fill('Press');
  await page.getByRole('button', { name: 'Move player right' }).click();
  await stage.getByRole('button', { name: 'Capture scenario' }).click();
  await expect(page.getByTestId('scenario-comparison')).toContainText(/moved/i);
  await expect(page.getByTestId('scenario-comparison')).toContainText('m');

  await page.getByText('Timeline & motion', { exact: true }).click();
  await page.getByLabel('Playhead (ms)').fill('1000');
  await page.getByRole('button', { name: 'Set playhead' }).click();
  await stage.getByRole('button', { name: 'Record onion-skin positions' }).click();
  await page.getByLabel('Playhead (ms)').fill('500');
  await page.getByRole('button', { name: 'Set playhead' }).click();
  await stage.getByLabel('Show onion skin').check();
  await expect(page.locator('[data-tactical-kind="ghost"]').first()).toBeAttached();

  await stage.getByLabel('Snap movement').check();
  await page.locator('.tactical-player-list button').nth(1).click();
  await clickBoard(page, 0.51, 0.05);
  await expect(page.locator('.status-line').last()).toContainText('Player snapped to a tactical guide.');
});
