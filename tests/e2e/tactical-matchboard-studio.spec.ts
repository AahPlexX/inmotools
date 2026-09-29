import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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
    await page.getByText('Spatial analysis', { exact: true }).click();
    await page.getByText('Project vault & interchange', { exact: true }).click();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${viewport.name} document overflow`).toBeLessThanOrEqual(1);

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

  await page.reload();
  await expect(page.getByTestId('suite-workspace').getByRole('heading', { name: 'Tactical Matchboard Studio', exact: true })).toBeVisible();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(before, 1);

  await page.getByText('Project vault & interchange', { exact: true }).click();
  await expect(page.getByText('Recovery available', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore latest autosave' }).first().click();
  await expect.poll(async () => Number(await coordinateInput(page, 'X').inputValue())).toBeCloseTo(moved, 1);
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

test('exports metadata, analytics, playback, and a capability-checked video fallback', async ({ page }) => {
  test.setTimeout(120_000);
  await page.getByText('Professional export', { exact: true }).click();
  await page.getByLabel('Export title').fill('Pressing shape');
  await page.getByLabel('Export notes').fill('Keep the press.');
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
  }

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Export title')).toHaveValue('Training board');
});
