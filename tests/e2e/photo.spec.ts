import { expect, test, type Download, type Page } from '@playwright/test';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAACqElEQVR42u3VQQ0AMQwDwbVU/pj7OBQ9zTyWQeJVqzVVfa6nBTzqtO+CVfW9WmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpgsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGCywqlpgwAKrqgUGC6yqFhiwwKoW2AKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwwWWFUtMGCBVdUCgwVWVQsMWGBVtcBggVXVAgMWWNUCAxZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGBVtcCABVZVCwwWWFUtMGCBVS0wYIFV1QIDFljVAgMWWFUtMGCBVS0wYIFV1QKDBVZVCwxYYFW1wGCBVdUCAxZYVS0wWGBVtcCABVa1wIAFVlULDFhgVQsMWGBVtcCABVa1wIAFVlULDBZYVS0wYIFV1QKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwxYYFULDFhgVbXAYIFV1QIDFlhVLTBYYFW1wIAFVlULDBZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGALrGqBAQusqhYYLLCqWmDAAquqBQYLrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoHBAquqBQYssKpaYLDAqmqBAQusqhYYLLCqWmDAAqtaYMACq6oFBiywqgUGLLCqWmCwwD6ZqgUGLLCqWmCwwKpqgQELrKoWGCywqlpgwAKrWmDAAquqBQYssKoFBiywqlpgwAKrWmDAAquqBQYLrKoWGLDAqmqBwQKrqgUGLLCqWmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpg+I0LLVVQ6zZs79UAAAAASUVORK5CYII=',
  'base64',
);

async function expectWorkspace(page: Page) {
  const workspace = page.getByTestId('suite-workspace');
  await expect(workspace.getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();
  return workspace;
}

async function openFixture(page: Page) {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expectWorkspace(page);
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
}

async function photoBox(page: Page) {
  const preview = page.getByTestId('photo-preview');
  await preview.scrollIntoViewIfNeeded();
  const box = await preview.boundingBox();
  if (!box) throw new Error('Rendered photo has no bounding box.');
  return box;
}

async function dragOnPhoto(page: Page, startX: number, startY: number, endX: number, endY: number) {
  const box = await photoBox(page);
  await page.mouse.move(box.x + box.width * startX, box.y + box.height * startY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endX, box.y + box.height * endY, { steps: 5 });
  await page.mouse.up();
}

async function clickPhoto(page: Page, x: number, y: number) {
  const box = await photoBox(page);
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('loads a local photo, edits, compares, undoes, and opens export', async ({ page }) => {
  await openFixture(page);
  const exposure = page.getByLabel('Exposure value');
  await exposure.fill('1');
  await exposure.press('Enter');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Before/after' }).click();
  await expect(page.getByTestId('photo-compare')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(exposure).toHaveValue('0');
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('dialog', { name: 'Export photo' })).toBeVisible();
  await expect(page.getByLabel('File format')).toBeVisible();
  await expect(page.getByLabel('File name')).toHaveValue('fixture-edited.jpg');
  await expect(page.getByLabel('Output sharpening')).toBeVisible();
});

test('RGB histogram, clipping warnings, and color sampler inspect the rendered preview', async ({ page }) => {
  await openFixture(page);
  const histogram = page.getByRole('img', { name: 'Live RGB and luminance histogram' });
  await expect(histogram).toBeVisible();
  await expect(histogram.locator('[data-histogram-channel]')).toHaveCount(4);
  await expect(histogram.locator('[data-histogram-channel="red"]')).toBeVisible();
  await expect(histogram.locator('[data-histogram-channel="green"]')).toBeVisible();
  await expect(histogram.locator('[data-histogram-channel="blue"]')).toBeVisible();

  await page.getByRole('button', { name: 'Clipping warnings' }).click();
  await expect(page.getByRole('button', { name: 'Clipping warnings' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('photo-clipping-overlay')).toBeVisible();

  await page.getByRole('button', { name: 'Color sampler' }).click();
  await expect(page.getByRole('button', { name: 'Color sampler' })).toHaveAttribute('aria-pressed', 'true');
  await clickPhoto(page, 0.5, 0.5);
  const readout = page.getByRole('status', { name: 'Sampled color readout' });
  await expect(readout).toContainText(/#[0-9A-F]{6}/);
  await expect(readout).toContainText(/RGB \d+, \d+, \d+/);
  await expect(readout).toContainText(/HSL \d+°, \d+%, \d+%/);
});

test('geometry, detail, and local tools produce reversible recipe state', async ({ page }) => {
  await openFixture(page);
  await page.getByText('Detail & noise', { exact: true }).click();
  await page.getByLabel('Texture value').fill('0.4');
  await page.getByLabel('Luminance denoise value').fill('0.3');

  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  const cropWidth = page.getByRole('spinbutton', { name: 'Crop width percent value', exact: true });
  await cropWidth.fill('75');
  await cropWidth.press('Enter');
  await page.getByLabel('Lens distortion value').fill('0.25');
  await page.getByLabel('Horizontal perspective value').fill('-0.2');
  await page.getByRole('button', { name: 'Rotate right' }).click();

  await page.getByRole('button', { name: 'Local adjustments' }).click();
  await page.getByRole('button', { name: 'Add radial mask' }).click();
  await expect(page.getByText('Radial adjustment 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('tone curve points are user-editable and reversible through normal history', async ({ page }) => {
  await openFixture(page);
  await page.locator('summary').filter({ hasText: 'Tone curve' }).click();
  await page.getByRole('button', { name: 'Add point' }).click();
  const output = page.getByLabel('Tone point 2 output percent');
  await expect(output).toHaveValue('50');
  await output.fill('70');
  await expect(output).toHaveValue('70');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(output).toHaveValue('50');
});

test('radial masks stay spatially accurate above 100% zoom and undo as one gesture', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: 'Actual size' })).toHaveText('125%');

  await page.getByRole('button', { name: 'Local adjustments' }).click();
  await page.getByRole('button', { name: 'Add radial mask' }).click();
  await expect(page.getByText(/Place Radial adjustment 1/)).toBeVisible();

  await dragOnPhoto(page, 0.25, 0.3, 0.65, 0.7);
  const mask = page.locator('[data-photo-mask="radial"]').first();
  await expect(mask).toBeVisible();
  const placed = await mask.evaluate((element) => ({
    cx: Number(element.getAttribute('cx')),
    cy: Number(element.getAttribute('cy')),
    rx: Number(element.getAttribute('rx')),
    ry: Number(element.getAttribute('ry')),
  }));
  expect(placed.cx).toBeGreaterThan(20);
  expect(placed.cx).toBeLessThan(30);
  expect(placed.cy).toBeGreaterThan(25);
  expect(placed.cy).toBeLessThan(35);
  expect(placed.rx).toBeGreaterThan(30);
  expect(placed.ry).toBeGreaterThan(30);

  await page.getByRole('button', { name: 'Undo' }).click();
  const restoredCx = Number(await mask.getAttribute('cx'));
  expect(restoredCx).toBeCloseTo(50, 0);
});

test('clone retouch supports explicit source then target placement on the photo', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Retouch' }).click();
  await page.getByRole('button', { name: 'Add clone spot' }).click();
  await expect(page.getByText(/Set source for clone spot/)).toBeVisible();

  await clickPhoto(page, 0.22, 0.35);
  await expect(page.getByText(/Set target for clone spot/)).toBeVisible();
  await clickPhoto(page, 0.72, 0.62);

  const overlay = page.locator('[data-photo-retouch="clone"]').first();
  await expect(overlay).toBeVisible();
  const circles = overlay.locator('circle');
  const sourceCx = Number(await circles.nth(0).getAttribute('cx'));
  const targetCx = Number(await circles.nth(1).getAttribute('cx'));
  expect(sourceCx).toBeGreaterThan(15);
  expect(sourceCx).toBeLessThan(30);
  expect(targetCx).toBeGreaterThan(65);
  expect(targetCx).toBeLessThan(80);
});

test('metadata editor creates a reviewed XMP sidecar', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export photo' });
  await dialog.getByLabel('Metadata policy').selectOption('custom');
  await dialog.getByLabel('Title').fill('A&B portrait');
  await dialog.getByLabel('Creator').fill('Example Photographer');
  await dialog.getByRole('textbox', { name: 'Keywords', exact: true }).fill('portrait, example');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download XMP sidecar' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('fixture-edited.xmp');
});

test('PNG export embeds reviewed XMP and honors safe custom filename plus output sharpening', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export photo' });
  await dialog.getByLabel('File format').selectOption('image/png');
  await dialog.getByLabel('File name').fill('reviewed portrait');
  await dialog.getByLabel('Output sharpening').selectOption('standard');
  await dialog.getByLabel('Metadata policy').selectOption('custom');
  await dialog.getByLabel('Title').fill('A&B portrait');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('reviewed portrait.png');
  const bytes = await downloadBytes(download);
  expect(bytes.includes(Buffer.from('XML:com.adobe.xmp'))).toBe(true);
  expect(bytes.includes(Buffer.from('A&amp;B portrait'))).toBe(true);
});

test('long and short edge sizing expose planned output and require an explicit safe choice for oversized export', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export photo' });
  const resize = dialog.getByLabel('Resize', { exact: true });
  const value = dialog.getByLabel('Resize value', { exact: true });

  await resize.selectOption('long-edge');
  await value.fill('200');
  await expect(dialog.getByText('Planned output · 200 × 150')).toBeVisible();

  await resize.selectOption('short-edge');
  await value.fill('120');
  await expect(dialog.getByText('Planned output · 160 × 120')).toBeVisible();

  await resize.selectOption('long-edge');
  await value.fill('10000');
  await expect(dialog.getByRole('alert')).toContainText('Planned output · 10000 × 7500');
  await expect(dialog.getByRole('button', { name: 'Choose safe size to export' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /Use verified safe size/ })).toBeVisible();
  await dialog.getByRole('button', { name: /Use verified safe size/ }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByText('Planned output · 4096 × 3072')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download photo' })).toBeEnabled();
});

test('batch export queues multiple local files and reports per-file completion', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export photo' });
  await dialog.locator('summary').filter({ hasText: 'Batch export current recipe' }).click();
  await dialog.locator('input[type="file"][multiple]').setInputFiles([
    { name: 'batch-a.png', mimeType: 'image/png', buffer: FIXTURE_PNG },
    { name: 'batch-b.png', mimeType: 'image/png', buffer: FIXTURE_PNG },
  ]);
  await expect(dialog.getByText('2 queued')).toBeVisible();
  await dialog.getByRole('button', { name: 'Export 2 photos' }).click();
  await expect(dialog.locator('.photo-batch-status li[data-status="completed"]')).toHaveCount(2, { timeout: 15_000 });
  await expect(dialog.getByText('batch-a.png', { exact: true })).toBeVisible();
  await expect(dialog.getByText('batch-b.png', { exact: true })).toBeVisible();
});

test('keyboard undo and redo work without pointer-only interaction', async ({ page }) => {
  await openFixture(page);
  const contrast = page.getByLabel('Contrast value');
  await contrast.fill('0.4');
  await contrast.press('Enter');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(contrast).toHaveValue('0');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z');
  await expect(contrast).toHaveValue('0.4');
});

test('reflows editor and export dialog without page-level horizontal overflow at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openFixture(page);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('dialog', { name: 'Export photo' })).toBeVisible();
  overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
