import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { makePhotoDng } from '../fixtures/photo-dng';
import { encodePng, texturedScenePng } from '../fixtures/photo-png';

test.use({ serviceWorkers: 'block' });

const SCENE = texturedScenePng(320, 240, { seed: 11 });

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set([...rgb, 255], offset);
  return encodePng(width, height, rgba);
}

async function openPhoto(page: Page, name = 'scene.png', buffer = SCENE, mimeType = 'image/png') {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expect(page.getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();
  await page.setInputFiles('[data-testid="photo-file-input"]', { name, mimeType, buffer });
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await settled(page);
}

async function settled(page: Page) {
  await expect(page.locator('.photo-render-badge')).toHaveCount(0);
}

async function tab(page: Page, name: string) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
}

async function setSlider(scope: Locator | Page, label: string, value: number) {
  const input = scope.getByLabel(`${label} value`, { exact: true });
  await input.fill(String(value));
  await input.press('Enter');
}

/** Mean RGBA of the preview (or a region of it) read back from the rendered image. */
async function previewMean(page: Page, region?: { x: number; y: number; width: number; height: number }) {
  return page.getByTestId('photo-preview').evaluate(async (image, area) => {
    const element = image as HTMLImageElement;
    await element.decode();
    const canvas = document.createElement('canvas');
    canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(element, 0, 0);
    const box = area
      ? { x: Math.round(area.x * canvas.width), y: Math.round(area.y * canvas.height), width: Math.max(1, Math.round(area.width * canvas.width)), height: Math.max(1, Math.round(area.height * canvas.height)) }
      : { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const data = context.getImageData(box.x, box.y, box.width, box.height).data;
    const sum = [0, 0, 0, 0];
    for (let offset = 0; offset < data.length; offset += 4) for (let channel = 0; channel < 4; channel += 1) sum[channel] += data[offset + channel];
    return sum.map((value) => value / (data.length / 4));
  }, region);
}

async function exportPng(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export photo' });
  await dialog.getByLabel('File format').selectOption('image/png');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo' }).click();
  const bytes = await readFile((await (await downloading).path())!);
  await dialog.getByRole('button', { name: 'Close' }).first().click().catch(() => undefined);
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(data)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
    return { width: canvas.width, height: canvas.height, left: pixel(5, Math.floor(canvas.height / 2)), centre: pixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)), right: pixel(canvas.width - 2, Math.floor(canvas.height / 2)) };
  }, [...bytes]);
}

test('canvas size adds a transparent or coloured border to the export and trimming removes uncovered edges', async ({ page }) => {
  await openPhoto(page);
  await tab(page, 'Crop & geometry');
  const canvasSize = page.getByTestId('photo-canvas-size');
  await canvasSize.locator('summary').click();
  await setSlider(canvasSize, 'Add to left %', 50);
  await expect(page.getByTestId('photo-canvas-size-readout')).toContainText('canvas 480 × 240 px');
  await settled(page);
  let exported = await exportPng(page);
  expect([exported.width, exported.height]).toEqual([480, 240]);
  expect(exported.left[3]).toBe(0);
  expect(exported.centre[3]).toBe(255);

  await canvasSize.getByLabel('Added canvas fill').selectOption('color');
  await canvasSize.getByLabel('Canvas color').fill('#ff0000');
  await settled(page);
  exported = await exportPng(page);
  expect(exported.left).toEqual([255, 0, 0, 255]);

  await canvasSize.getByRole('button', { name: 'Reset canvas size' }).click();
  const transform = page.getByTestId('photo-free-transform');
  await transform.locator('summary').click();
  await setSlider(transform, 'Width scale %', 50);
  await expect(transform.getByLabel('Height scale % value', { exact: true })).toHaveValue('50');
  await canvasSize.getByRole('button', { name: 'Trim transparent edges' }).click();
  await expect(canvasSize.getByRole('status')).toContainText(/Trimmed to 16[0-2] × 12[0-2] px/);
  await settled(page);
  exported = await exportPng(page);
  expect(exported.width).toBeGreaterThanOrEqual(160);
  expect(exported.width).toBeLessThanOrEqual(162);
  expect(exported.centre[3]).toBe(255);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('photo-canvas-size-readout')).toContainText('Canvas matches the photo: 320 × 240 px');
});

test('corner perspective pins corners and uncovers transparency on the side pulled in', async ({ page }) => {
  await openPhoto(page);
  await tab(page, 'Crop & geometry');
  const corners = page.getByTestId('photo-corner-perspective');
  await corners.locator('summary').click();
  await setSlider(corners, 'Top-right corner horizontal %', -30);
  await setSlider(corners, 'Bottom-right corner horizontal %', -30);
  await settled(page);
  const exported = await exportPng(page);
  expect([exported.width, exported.height]).toEqual([320, 240]);
  expect(exported.right[3]).toBe(0);
  expect(exported.left[3]).toBe(255);
  await corners.getByRole('button', { name: 'Reset corners' }).click();
  await expect(corners.getByLabel('Top-right corner horizontal % value', { exact: true })).toHaveValue('0');
});

test('selective color changes only the chosen family and survives a method switch', async ({ page }) => {
  // Left half pure-ish red, right half blue.
  const width = 64; const height = 32;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rgba.set(x < width / 2 ? [200, 40, 40, 255] : [40, 60, 200, 255], (y * width + x) * 4);
  await openPhoto(page, 'two-colors.png', encodePng(width, height, rgba));
  const before = { reds: await previewMean(page, { x: 0.05, y: 0.1, width: 0.35, height: 0.8 }), blues: await previewMean(page, { x: 0.6, y: 0.1, width: 0.35, height: 0.8 }) };
  const section = page.getByTestId('photo-selective-color');
  await section.locator('summary').click();
  await section.getByLabel('Absolute (adds or removes a fixed amount)').check();
  await section.getByLabel('Selective color family').selectOption('reds');
  await setSlider(section, 'Cyan %', 40);
  await expect(section.getByLabel('Absolute (adds or removes a fixed amount)')).toBeChecked();
  await expect.poll(async () => (await previewMean(page, { x: 0.05, y: 0.1, width: 0.35, height: 0.8 }))[0]).toBeLessThan(before.reds[0] - 20);
  await settled(page);
  const after = { reds: await previewMean(page, { x: 0.05, y: 0.1, width: 0.35, height: 0.8 }), blues: await previewMean(page, { x: 0.6, y: 0.1, width: 0.35, height: 0.8 }) };
  expect(after.reds[0]).toBeLessThan(before.reds[0] - 20);
  expect(Math.abs(after.blues[0] - before.blues[0])).toBeLessThan(1);
  expect(Math.abs(after.blues[2] - before.blues[2])).toBeLessThan(1);
  await expect(section.getByLabel('Selective color family').locator('option', { hasText: 'Reds •' })).toHaveCount(1);
});

test('the white-balance eyedropper neutralizes a picked gray', async ({ page }) => {
  await openPhoto(page, 'cool-card.png', solidPng(80, 60, [130, 128, 142]));
  await page.getByRole('button', { name: 'Pick neutral point' }).click();
  await expect(page.locator('.photo-tool-hint')).toContainText('neutral gray or white');
  // Arming the tool brings the photo into view on narrow screens.
  await expect(page.getByTestId('photo-preview')).toBeInViewport();
  await page.getByTestId('photo-preview').click();
  await expect(page.locator('.photo-status-message')).toContainText('White balance set from the picked neutral');
  await expect(page.getByLabel('Temperature value', { exact: true })).not.toHaveValue('0');
  await expect.poll(async () => {
    const [r, g, b] = await previewMean(page);
    return Math.max(Math.abs(r - b), Math.abs(r - g), Math.abs(g - b));
  }).toBeLessThan(3);
});

test('layer groups hide and fade their members together', async ({ page }) => {
  await openPhoto(page);
  const original = await previewMean(page);
  await tab(page, 'Layers');
  await page.getByRole('button', { name: 'Add rectangle' }).click();
  await expect.poll(async () => JSON.stringify(await previewMean(page))).not.toBe(JSON.stringify(original));
  await settled(page);
  const withShape = await previewMean(page);
  const groups = page.getByTestId('photo-layer-groups');
  await groups.getByText('Layer groups (0)').click();
  await groups.getByRole('button', { name: 'New group' }).click();
  const layer = page.getByTestId('photo-layer').first();
  const layerName = (await layer.locator('header strong').textContent())!;
  await layer.getByLabel(`${layerName} group`).selectOption({ label: 'Group 1' });
  await expect(groups.getByTestId('photo-layer-group')).toContainText('1 layer');
  await groups.getByTestId('photo-layer-group').getByLabel('Visible').uncheck();
  await expect.poll(async () => JSON.stringify(await previewMean(page))).toBe(JSON.stringify(original));
  await groups.getByRole('button', { name: 'Ungroup' }).click();
  await expect.poll(async () => JSON.stringify(await previewMean(page))).toBe(JSON.stringify(withShape));
});

test('rulers and guides are a view-only aid labelled in output pixels', async ({ page }) => {
  await openPhoto(page);
  await page.getByRole('button', { name: 'Rulers & guides' }).click();
  const layer = page.getByTestId('photo-guide-layer');
  await expect(layer).toBeVisible();
  await expect(layer.locator('.photo-ruler-top')).toContainText('64');
  const controls = page.getByTestId('photo-guide-controls');
  await controls.getByRole('button', { name: 'Add vertical guide' }).click();
  await controls.getByLabel('Vertical guide 1 position %').fill('25');
  await expect(layer.getByTestId('photo-guide')).toHaveAttribute('style', /left: 25%/);
  await controls.getByRole('button', { name: 'Remove vertical guide 1' }).click();
  await expect(layer.getByTestId('photo-guide')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rulers & guides' }).click();
  await expect(layer).toHaveCount(0);
});

test('holding backslash or the button shows the original, and the 100% view renders actual pixels', async ({ page }) => {
  await openPhoto(page);
  await setSlider(page, 'Exposure', 1);
  await settled(page);
  await page.getByTestId('photo-preview').click();
  await page.keyboard.down('Backslash');
  await expect(page.getByTestId('photo-before-overlay')).toBeVisible();
  await page.keyboard.up('Backslash');
  await expect(page.getByTestId('photo-before-overlay')).toHaveCount(0);
  const hold = page.getByRole('button', { name: 'Hold for original' });
  await hold.scrollIntoViewIfNeeded();
  const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(hold).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.up();
  await expect(hold).toHaveAttribute('aria-pressed', 'false');

  await page.getByText('Detail & noise', { exact: true }).click();
  await page.getByRole('button', { name: 'Check at 100%' }).first().click();
  const loupe = page.getByTestId('photo-loupe-image');
  await expect(loupe).toBeVisible();
  expect(await loupe.evaluate((image) => [(image as HTMLImageElement).naturalWidth, (image as HTMLImageElement).naturalHeight])).toEqual([320, 240]);
});

test('original file details and the duplicate prompt use the source itself', async ({ page }) => {
  await openPhoto(page, 'first.png');
  await expect(page.getByTestId('photo-project-save-state')).toContainText('Saved locally');
  await tab(page, 'Inspect & workflow');
  const details = page.getByTestId('photo-source-details');
  await details.locator('summary').click();
  await expect(details).toContainText('no camera, location, or colour-profile information');
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'same-bytes.png', mimeType: 'image/png', buffer: SCENE });
  const prompt = page.getByTestId('photo-duplicate-prompt');
  await expect(prompt).toContainText('You already have this photo');
  await prompt.getByRole('button', { name: 'Keep this copy' }).click();
  await expect(prompt).toHaveCount(0);
});

test('RAW exposure brightens before demosaic and is reset independently', async ({ page }) => {
  await openPhoto(page, 'exposure.dng', Buffer.from(makePhotoDng()), 'image/x-adobe-dng');
  const raw = page.getByTestId('photo-raw-controls');
  const base = await previewMean(page);
  const exposure = raw.getByLabel('RAW exposure (EV)', { exact: true });
  await exposure.fill('1');
  await exposure.press('Enter');
  await expect(raw.getByLabel('RAW highlight protection', { exact: true })).toBeVisible();
  await settled(page);
  await expect.poll(async () => (await previewMean(page))[1]).toBeGreaterThan(base[1] + 10);
  await raw.getByRole('button', { name: 'Reset RAW exposure' }).click();
  await expect(raw.getByLabel('RAW highlight protection', { exact: true })).toHaveCount(0);
});

test('every open-source notice linked from Photo Studio is served', async ({ page, request }) => {
  await page.goto('/inmotools/#/tools/photo-studio');
  await page.getByRole('navigation').getByRole('button', { name: 'Inspect & workflow', exact: true }).click();
  const notices = page.getByTestId('photo-notices');
  await notices.locator('summary').click();
  const links = notices.getByRole('link');
  await expect(links).toHaveCount(5);
  for (const href of await links.evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href))) {
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    expect(await response.text()).toMatch(/notices/i);
  }
});
