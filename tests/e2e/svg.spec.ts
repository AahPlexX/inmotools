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

  // Every compiled symbol gets light/dark image-context previews instead of
  // injecting uploaded SVG markup directly into the application DOM.
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

  await page.keyboard.press('ArrowRight');
  await expect(xInput).toHaveValue('121');
  await page.getByRole('button', { name: 'Align left' }).click();
  await page.getByRole('button', { name: 'Duplicate selection' }).click();
  await expect(page.getByTestId('vector-layer')).toHaveCount(2);
  await page.getByRole('button', { name: 'Send backward' }).click();

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
  await page.getByTestId('vector-layer').click();
  await page.getByRole('button', { name: 'Bring forward' }).click();
  await page.getByRole('button', { name: 'Bring to front' }).click();
  await expect(page.locator('#vector-artboard-width')).toHaveValue('640');
});
