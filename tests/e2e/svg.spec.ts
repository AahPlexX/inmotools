import { expect, test } from '@playwright/test';

test('compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  const input = page.locator('#svg-files');
  await input.setInputFiles([
    { name: 'foo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop offset="1"/></linearGradient></defs><rect fill="url(#paint)" width="10" height="10"/></svg>') },
    { name: 'foo-2.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10" fill="red"><path d="M0 0h10v10z"/></svg>') },
    { name: 'foo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10"><path stroke="blue" d="M0 0h10"/></svg>') },
    { name: 'relative.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg width="2em" height="100%"><path d="M0 0h10v10z"/></svg>') },
    { name: 'broken.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('not svg') },
  ]);

  await page.getByRole('button', { name: 'Compile sprite' }).click();
  await expect(page.getByTestId('svg-errors')).toContainText('broken.svg');
  await expect(page.getByTestId('svg-warnings')).toContainText('relative.svg');
  await expect(page.getByTestId('svg-warnings')).toContainText(/viewBox/i);

  const source = page.getByLabel('Compiled SVG sprite source');
  await expect(source).toContainText('id="foo"');
  await expect(source).toContainText('id="foo-2"');
  await expect(source).toContainText('id="foo-3"');
  const text = await source.textContent();
  const internal = /id="(foo--[^"]+)"/.exec(text ?? '')?.[1];
  expect(internal).toBeTruthy();
  expect(text).toContain(`url(#${internal})`);

  await expect(page.getByRole('img', { name: /preview/i })).toHaveCount(8);

  await page.getByRole('checkbox', { name: /Normalize literal/ }).uncheck();
  await expect(source).toHaveCount(0);
  await expect(page.locator('.workspace-body .status-line[role="status"]')).toContainText(/Recompile/);
});

test('strips executable SVG content before output and never runs it in preview', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { __svgExecuted: number }).__svgExecuted = 0; });
  await page.goto('./#/tools/svg-sprite-compiler');
  await page.locator('#svg-files').setInputFiles({
    name: 'unsafe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg viewBox="0 0 10 10" onload="window.__svgExecuted=1"><script>window.__svgExecuted=2</script><rect onclick="window.__svgExecuted=3" width="10" height="10"/></svg>'),
  });
  await page.getByRole('button', { name: 'Compile sprite' }).click();

  const source = page.getByLabel('Compiled SVG sprite source');
  await expect(source).not.toContainText(/<script\b/i);
  await expect(source).not.toContainText(/on(?:load|click)=/i);
  await expect(page.getByRole('img', { name: /unsafe.*preview/i })).toHaveCount(2);
  expect(await page.evaluate(() => (window as unknown as { __svgExecuted: number }).__svgExecuted)).toBe(0);
});

test('allows the same SVG filename to be selected again after recompiling', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  const input = page.locator('#svg-files');

  await input.setInputFiles({ name: 'same.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10" class="first"><path d="M0 0h10v10z"/></svg>') });
  await page.getByRole('button', { name: 'Compile sprite' }).click();
  await expect(page.getByLabel('Compiled SVG sprite source')).toContainText('class="first"');

  await input.setInputFiles({ name: 'same.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 10 10" class="second"><path d="M0 0h5v5z"/></svg>') });
  await expect(page.getByLabel('Compiled SVG sprite source')).toHaveCount(0);
  await page.getByRole('button', { name: 'Compile sprite' }).click();
  await expect(page.getByLabel('Compiled SVG sprite source')).toContainText('class="second"');
  await expect(page.getByLabel('Compiled SVG sprite source')).not.toContainText('class="first"');
});

test('Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  await expect(page.getByRole('heading', { name: 'Vector Studio' })).toBeVisible();

  await page.getByRole('button', { name: 'Rectangle tool' }).click();
  const canvas = page.getByTestId('vector-canvas');
  await canvas.click({ position: { x: 260, y: 190 } });
  await expect(page.getByTestId('vector-layer')).toHaveCount(1);

  const xInput = page.locator('#vector-x');
  await xInput.fill('120');
  await xInput.press('Enter');
  await expect(xInput).toHaveValue('120');

  await page.getByRole('button', { name: 'Select tool' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(xInput).toHaveValue('121');
  await page.getByRole('button', { name: 'Align left' }).click();
  await page.getByRole('button', { name: 'Duplicate selection' }).click();
  await expect(page.getByTestId('vector-layer')).toHaveCount(2);
  await page.getByRole('button', { name: 'Send backward' }).click();

  await page.getByRole('tab', { name: 'Export' }).click();
  await page.locator('#vector-export-title').fill('Launch mark');
  await page.locator('#vector-export-tags').fill('brand, launch, web');
  await page.getByRole('button', { name: 'Preview SVG source' }).click();
  const source = page.getByLabel('Vector SVG export source');
  await expect(source).toContainText('<title>Launch mark</title>');
  await expect(source).toContainText('<inmo:tag>brand</inmo:tag>');

  await page.setViewportSize({ width: 360, height: 760 });
  await expect(page.getByRole('button', { name: 'Rectangle tool' })).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflows).toBe(false);
});

test('Vector Studio mirrors the live artboard with the same axis transform used by export', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  await page.getByRole('button', { name: 'Rectangle tool' }).click();
  await page.getByTestId('vector-canvas').click({ position: { x: 260, y: 190 } });
  await page.getByRole('button', { name: 'Mirror H' }).click();

  const liveShape = page.locator('[data-vector-element]').first().locator('rect').first();
  await expect(liveShape).toHaveAttribute('transform', /scale\(-1 1\)/);

  await page.getByRole('tab', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Preview SVG source' }).click();
  await expect(page.getByLabel('Vector SVG export source')).toContainText('scale(-1 1)');
});

test('Vector Studio pan tool moves the artboard viewport rather than acting as a decorative control', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('./#/tools/svg-sprite-compiler');
  await page.getByRole('button', { name: 'Zoom to 100 percent' }).click();
  await page.getByRole('button', { name: 'Pan tool' }).click();

  const scroller = page.locator('.vector-canvas-scroll');
  const canvas = page.getByTestId('vector-canvas');
  await scroller.scrollIntoViewIfNeeded();
  const before = await scroller.evaluate((element) => {
    const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollLeft = Math.min(320, maxLeft);
    element.scrollTop = Math.min(220, maxTop);
    return { left: element.scrollLeft, top: element.scrollTop, maxLeft, maxTop };
  });
  expect(before.maxLeft > 0 || before.maxTop > 0).toBe(true);
  expect(before.left > 0 || before.top > 0).toBe(true);

  const [scrollerBox, canvasBox] = await Promise.all([scroller.boundingBox(), canvas.boundingBox()]);
  const viewport = page.viewportSize();
  if (!scrollerBox || !canvasBox || !viewport) throw new Error('Vector artboard has no visible viewport geometry.');

  const visibleLeft = Math.max(scrollerBox.x, canvasBox.x, 0);
  const visibleTop = Math.max(scrollerBox.y, canvasBox.y, 0);
  const visibleRight = Math.min(scrollerBox.x + scrollerBox.width, canvasBox.x + canvasBox.width, viewport.width);
  const visibleBottom = Math.min(scrollerBox.y + scrollerBox.height, canvasBox.y + canvasBox.height, viewport.height);
  if (visibleRight - visibleLeft < 120 || visibleBottom - visibleTop < 100) {
    throw new Error('Vector artboard does not expose enough visible area to exercise pan.');
  }

  const startX = visibleLeft + 24;
  const startY = visibleTop + 24;
  const endX = Math.min(startX + 80, visibleRight - 8);
  const endY = Math.min(startY + 60, visibleBottom - 8);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 4 });
  await page.mouse.up();

  const after = await scroller.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
  const movedLeft = before.left > 0 && after.left < before.left;
  const movedTop = before.top > 0 && after.top < before.top;
  expect(movedLeft || movedTop).toBe(true);
  if (before.left > 0) expect(after.left).toBeLessThan(before.left);
  if (before.top > 0) expect(after.top).toBeLessThan(before.top);
});

test('Vector Studio imports project JSON and offers accessible non-drag layer ordering', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  const project = {
    format: 'inmotools-vector', version: 1, id: 'fixture', name: 'Fixture',
    artboard: { width: 640, height: 480, background: '#fff', exportBackground: false, gridVisible: true, gridSize: 20, snapToGrid: true, snapToObjects: true },
    metadata: { title: '', description: '', creator: '', rights: '', license: '', language: 'en', tags: [], custom: '' },
    symbols: [], swatches: ['#111827', '#ffffff', '#7c3aed', '#2563eb', '#06b6d4', '#f59e0b'],
    elements: [{ id: 'fixture-rect', type: 'rect', name: 'Imported rectangle', x: 20, y: 20, width: 100, height: 80, rotation: 0, opacity: 1, visible: true, locked: false, fill: { kind: 'solid', color: '#7c3aed' }, stroke: { color: '#111827', width: 0, linecap: 'round', linejoin: 'round', dash: '' }, blendMode: 'normal', cornerRadius: 12, title: '', description: '' }],
  };
  await page.locator('#vector-project-import').setInputFiles({ name: 'fixture.inmovector.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.getByTestId('vector-layer')).toContainText('Imported rectangle');
  await page.getByRole('tab', { name: 'Layers' }).click();
  await page.getByTestId('vector-layer').click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: 'Bring forward' }).click();
  await page.getByRole('button', { name: 'Bring to front' }).click();
  await expect(page.locator('#vector-artboard-width')).toHaveValue('640');
});

test('Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 820 });
  await page.goto('./#/tools/svg-sprite-compiler');
  const canvas = page.getByTestId('vector-canvas');

  await page.getByRole('button', { name: 'Polygon tool' }).click();
  const polygonSides = page.getByLabel('Polygon sides');
  await expect(polygonSides).toBeVisible();
  await polygonSides.fill('8');
  await canvas.click({ position: { x: 260, y: 190 } });
  const polygonPath = await page.locator('[data-vector-element]').last().locator('path').getAttribute('d');
  expect((polygonPath?.match(/ L /g)?.length ?? 0) + 1).toBe(8);

  await page.getByRole('button', { name: 'Star tool' }).click();
  await page.getByLabel('Star points').fill('7');
  await page.getByLabel('Star inner ratio').fill('0.35');
  await canvas.click({ position: { x: 420, y: 260 } });
  const starPath = await page.locator('[data-vector-element]').last().locator('path').getAttribute('d');
  expect((starPath?.match(/ L /g)?.length ?? 0) + 1).toBe(14);

  await page.getByRole('button', { name: 'Pencil tool' }).click();
  await expect(page.getByLabel('Pencil smoothing')).toBeVisible();
  await expect(page.getByLabel('Artboard ruler origin')).toBeVisible();

  const swatchesBefore = await page.getByRole('button', { name: /^Apply .* fill$/ }).count();
  await page.getByLabel('New swatch color').fill('#123456');
  await page.getByRole('button', { name: 'Save swatch' }).click();
  await expect(page.getByRole('button', { name: 'Apply #123456 fill' })).toBeVisible();
  expect(await page.getByRole('button', { name: /^Apply .* fill$/ }).count()).toBe(swatchesBefore + 1);

  await page.getByRole('tab', { name: 'Layers' }).click();
  await page.locator('#vector-artboard-width').fill('3000');
  await page.locator('#vector-artboard-width').press('Enter');
  await page.getByRole('button', { name: 'Fit artboard' }).click();
  await expect(page.getByTestId('vector-zoom-readout')).not.toHaveText('70%');
  await expect(page.getByRole('button', { name: 'Fit selection' })).toBeEnabled();
  await page.getByRole('button', { name: 'Fit selection' }).click();
});

test('Vector Studio exposes non-destructive clip, difference, and symmetry duplicate workflows', async ({ page }) => {
  await page.goto('./#/tools/svg-sprite-compiler');
  const canvas = page.getByTestId('vector-canvas');
  await page.getByRole('button', { name: 'Rectangle tool' }).click();
  await canvas.click({ position: { x: 240, y: 190 } });
  await canvas.click({ position: { x: 380, y: 260 } });
  await expect(page.getByTestId('vector-layer')).toHaveCount(2);

  await page.getByRole('button', { name: 'Select tool' }).click();
  const shapes = page.locator('[data-vector-element] > rect, [data-vector-element] > g > rect');
  await shapes.nth(0).click();
  await shapes.nth(1).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Clip selection' }).click();
  await expect(page.getByTestId('vector-layer')).toHaveCount(1);
  await expect(canvas.locator('clipPath')).toHaveCount(1);
  await expect(canvas.locator('g[clip-path]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Ungroup' }).click();
  await expect(page.getByTestId('vector-layer')).toHaveCount(2);
  const released = page.locator('[data-vector-element] > rect, [data-vector-element] > g > rect');
  await released.nth(0).click();
  await released.nth(1).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Difference selection' }).click();
  await expect(canvas.locator('mask')).toHaveCount(1);
  await expect(canvas.locator('g[mask]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Ungroup' }).click();
  await released.nth(0).click();
  await page.getByRole('button', { name: 'Symmetry duplicate horizontal' }).click();
  await expect(page.getByTestId('vector-layer')).toHaveCount(3);
});
