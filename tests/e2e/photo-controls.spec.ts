import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAACqElEQVR42u3VQQ0AMQwDwbVU/pj7OBQ9zTyWQeJVqzVVfa6nBTzqtO+CVfW9WmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpgsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGCywqlpgwAKrqgUGC6yqFhiwwKoW2AKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwwWWFUtMGCBVdUCgwVWVQsMWGBVtcBggVXVAgMWWNUCAxZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGBVtcCABVZVCwwWWFUtMGCBVS0wYIFV1QIDFljVAgMWWFUtMGCBVS0wYIFV1QKDBVZVCwxYYFW1wGCBVdUCAxZYVS0wWGBVtcCABVa1wIAFVlULDFhgVQsMWGBVtcCABVa1wIAFVlULDBZYVS0wYIFV1QKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwxYYFULDFhgVbXAYIFV1QIDFlhVLTBYYFW1wIAFVlULDBZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGALrGqBAQusqhYYLLCqWmDAAquqBQYLrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoHBAquqBQYssKpaYLDAqmqBAQusqhYYLLCqWmDAAqtaYMACq6oFBiywqgUGLLCqWmCwwD6ZqgUGLLCqWmCwwKpqgQELrKoWGCywqlpgwAKrWmDAAquqBQYssKoFBiywqlpgwAKrWmDAAquqBQYLrKoWGLDAqmqBwQKrqgUGLLCqWmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpg+I0LLVVQ6zZs79UAAAAASUVORK5CYII=',
  'base64',
);

async function openFixture(page: Page) {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expect(page.getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.getByTestId('photo-preview')).toBeVisible();
}

test('direct crop resize and movement use source coordinates at zoom and commit one undo step', async ({ page, isMobile }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const surface = page.getByTestId('photo-crop-overlay');
  await surface.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Crop bottom right corner', exact: true }).scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  const corner = (await page.getByRole('button', { name: 'Crop bottom right corner', exact: true }).boundingBox())!;
  const start = { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 };
  const end = { x: start.x - box.width / 4, y: start.y - box.height / 4 };
  const touch = isMobile ? await page.context().newCDPSession(page) : null;
  if (touch) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
  } else {
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 });
  }
  await expect(page.getByLabel('Crop width percent value')).toHaveValue('100');
  if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  await expect(page.getByLabel('Crop width percent value')).toHaveValue('75');
  await expect(page.getByLabel('Crop height percent value')).toHaveValue('75');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Crop width percent value')).toHaveValue('100');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const move = page.getByRole('button', { name: 'Move crop frame', exact: true });
  await move.scrollIntoViewIfNeeded();
  const moveBox = (await move.boundingBox())!;
  const sourceBox = (await surface.boundingBox())!;
  const moveStart = { x: moveBox.x + moveBox.width / 2, y: moveBox.y + moveBox.height / 2 };
  const moveEnd = { x: moveStart.x + sourceBox.width / 10, y: moveStart.y + sourceBox.height / 10 };
  if (touch) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moveStart] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moveEnd] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach();
  } else {
    await page.mouse.move(moveStart.x, moveStart.y); await page.mouse.down();
    await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 5 }); await page.mouse.up();
  }
  await expect(page.getByLabel('Crop left percent value')).toHaveValue('10');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Crop left percent value')).toHaveValue('0');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await move.press('ArrowRight');
  await expect(move).toBeFocused();
  await move.press('ArrowDown');
  await expect(page.getByLabel('Crop left percent value')).toHaveValue('11');
  await expect(page.getByLabel('Crop top percent value')).toHaveValue('11');
  await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByText('Edited frame 240 × 180')).toBeVisible();
});

test('crop pointer cancellation and source replacement cannot commit a stale crop', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
  const corner = page.getByRole('button', { name: 'Crop bottom right corner', exact: true });
  await corner.scrollIntoViewIfNeeded();
  const box = (await corner.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 40, box.y - 30);
  await corner.evaluate((element) => element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
  await page.mouse.up();
  await expect(page.getByLabel('Crop width percent value')).toHaveValue('100');
  await corner.press('ArrowLeft');
  await expect(page.getByLabel('Crop width percent value')).toHaveValue('99');
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'replacement.png', mimeType: 'image/png', buffer: FIXTURE_PNG });
  await expect(page.getByTestId('photo-preview')).toHaveAttribute('alt', 'Edited preview of replacement.png');
  await expect(page.getByLabel('Crop width percent value')).toHaveValue('100');
  await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
  await expect(page.getByTestId('photo-geometry-reference')).toHaveAttribute('alt', 'Geometry reference for replacement.png');
  await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
  await expect(page.getByText('Edited frame 320 × 240')).toBeVisible();
});

test('direct crop keyboard edits survive recovery and select the same source pixels for preview and export', async ({ page }) => {
  await openFixture(page);
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgb(200,0,0)'; ctx.fillRect(0, 0, 80, 240);
    ctx.fillStyle = 'rgb(0,200,0)'; ctx.fillRect(80, 0, 160, 240);
    ctx.fillStyle = 'rgb(0,0,200)'; ctx.fillRect(240, 0, 80, 240);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('[data-testid="photo-file-input"]', { name: 'stripes.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') });
  await expect(page.locator('.photo-status-strip')).toContainText('stripes.png');
  await expect(page.getByTestId('photo-source-dimensions')).toHaveText('320 × 240');
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
  const left = page.getByRole('button', { name: 'Crop left edge', exact: true });
  for (let index = 0; index < 6; index++) await left.press('Shift+ArrowRight');
  const right = page.getByRole('button', { name: 'Crop right edge', exact: true });
  await right.press('Shift+ArrowLeft'); await right.press('Shift+ArrowLeft');
  await expect(page.getByLabel('Crop left percent value')).toHaveValue('30');
  await expect(page.getByLabel('Crop width percent value')).toHaveValue('60');
  await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
  await expect(page.getByText('Edited frame 192 × 240')).toBeVisible();
  await expect(page.getByTestId('photo-project-save-state')).toContainText('Saved locally');
  await page.reload();
  await page.getByRole('button', { name: 'Recover project', exact: true }).click();
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByTestId('photo-preview')).toHaveJSProperty('naturalWidth', 192);
  await expect(page.getByTestId('photo-source-dimensions')).toHaveText('320 × 240');
  const previewPixels = await page.getByTestId('photo-preview').evaluate((element) => {
    const image = element as HTMLImageElement;
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, first: [...ctx.getImageData(0, 0, 1, 1).data], last: [...ctx.getImageData(canvas.width - 1, 0, 1, 1).data] };
  });
  expect(previewPixels).toEqual({ width: 192, height: 240, first: [0, 200, 0, 255], last: [0, 0, 200, 255] });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('File format').selectOption('image/png');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo', exact: true }).click();
  const stream = await (await downloading).createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exportedPixels = await page.evaluate(async (base64) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); image.close();
    return { width: canvas.width, height: canvas.height, first: [...ctx.getImageData(0, 0, 1, 1).data], last: [...ctx.getImageData(canvas.width - 1, 0, 1, 1).data] };
  }, Buffer.concat(chunks).toString('base64'));
  expect(exportedPixels).toEqual({ width: 192, height: 240, first: [0, 200, 0, 255], last: [0, 0, 200, 255] });
});

for (const [mode, vertical, horizontal] of [['Rule of thirds', 2, 2], ['Golden ratio', 2, 2], ['Diagonal', 0, 0], ['Grid', 3, 3]] as const) {
  test(`composition ${mode} stays registered and never alters edited pixels`, async ({ page }) => {
    await openFixture(page);
    const originalPreview = await page.getByTestId('photo-preview').getAttribute('src');
    await page.getByRole('button', { name: 'Crop & geometry' }).click();
    await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
    await page.getByLabel('Composition overlay', { exact: true }).selectOption({ label: mode });
    const guides = page.getByRole('img', { name: `${mode} composition guides`, exact: true });
    await expect(guides).toBeVisible();
    await expect(guides.locator('[data-guide="vertical"]')).toHaveCount(vertical);
    await expect(guides.locator('[data-guide="horizontal"]')).toHaveCount(horizontal);
    if (mode === 'Grid') {
      await page.getByLabel('Grid divisions', { exact: true }).selectOption('6');
      await expect(guides.locator('[data-guide="vertical"]')).toHaveCount(5);
    }
    if (mode === 'Diagonal') await expect(guides.locator('line')).toHaveCount(2);
    const imageBox = (await page.getByTestId('photo-geometry-reference').boundingBox())!;
    const overlayBox = (await page.getByTestId('photo-crop-overlay').boundingBox())!;
    const guideBox = (await guides.boundingBox())!;
    expect(overlayBox.width).toBeCloseTo(imageBox.width, 0);
    expect(overlayBox.height).toBeCloseTo(imageBox.height, 0);
    expect(overlayBox.x).toBeCloseTo(imageBox.x, 0);
    expect(overlayBox.y).toBeCloseTo(imageBox.y, 0);
    expect(Math.abs(guideBox.width - imageBox.width)).toBeLessThanOrEqual(4);
    expect(Math.abs(guideBox.height - imageBox.height)).toBeLessThanOrEqual(4);
    expect(Math.abs(guideBox.x - imageBox.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(guideBox.y - imageBox.y)).toBeLessThanOrEqual(2);
    if (mode === 'Rule of thirds' || mode === 'Golden ratio') {
      expect(Number(await guides.locator('[data-guide="vertical"]').first().getAttribute('x1'))).toBeCloseTo(mode === 'Rule of thirds' ? 33.333333333 : 38.196601125, 6);
    }
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByLabel('Composition overlay', { exact: true }).selectOption('none');
    await expect(guides).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit crop on photo', exact: true }).click();
    await expect(page.getByTestId('photo-preview')).toHaveAttribute('src', originalPreview!);
  });
}

test('geometry scalar reset restores its own default without changing a neighboring correction', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  const cropWidth = page.getByLabel('Crop width percent value');
  const lens = page.getByLabel('Lens distortion value');
  await cropWidth.fill('75');
  await cropWidth.press('Enter');
  await lens.fill('0.25');
  await lens.press('Enter');

  await page.getByRole('button', { name: 'Reset Crop width percent' }).click();
  await expect(cropWidth).toHaveValue('100');
  await expect(lens).toHaveValue('0.25');
});

test('custom crop ratio applies a centered 5:4 frame to a 4:3 photo', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  const ratioWidth = page.getByLabel('Custom ratio width');
  const applyRatio = page.getByRole('button', { name: 'Apply custom ratio' });
  await ratioWidth.fill('0');
  await expect(ratioWidth).toHaveAttribute('aria-invalid', 'true');
  await expect(applyRatio).toBeDisabled();
  await ratioWidth.fill('5');
  await page.getByLabel('Custom ratio height').fill('4');
  await applyRatio.click();

  await expect(page.getByLabel('Crop left percent value')).toHaveValue('3.13');
  await expect(page.getByLabel('Crop top percent value')).toHaveValue('0');
  await expect(page.getByLabel('Crop width percent value')).toHaveValue('93.75');
  await expect(page.getByLabel('Crop height percent value')).toHaveValue('100');
  await expect(page.getByText('Edited frame 300 × 240')).toBeVisible();
});

test('range and local scalar resets use meaningful neutral or operation defaults', async ({ page }) => {
  await openFixture(page);
  await page.locator('summary').filter({ hasText: 'Color ranges' }).click();
  const redSaturation = page.getByLabel('Red saturation value');
  await redSaturation.fill('0.5');
  await redSaturation.press('Enter');
  await page.getByRole('button', { name: 'Reset Red saturation' }).click();
  await expect(redSaturation).toHaveValue('0');

  await page.getByRole('button', { name: 'Local adjustments' }).click();
  await page.getByRole('button', { name: 'Add radial mask' }).click();
  const localExposure = page.getByLabel('Radial adjustment 1 exposure value');
  const localOpacity = page.getByLabel('Radial adjustment 1 opacity value');
  await localExposure.fill('1.5');
  await localExposure.press('Enter');
  await localOpacity.fill('0.3');
  await localOpacity.press('Enter');
  await page.getByRole('button', { name: 'Reset Radial adjustment 1 exposure' }).click();
  await expect(localExposure).toHaveValue('0');
  await expect(localOpacity).toHaveValue('0.3');
});

test('retouch scalar reset restores the operation default without disturbing its other values', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Retouch' }).click();
  await page.getByRole('button', { name: 'Add red-eye correction' }).click();
  const radius = page.getByLabel('Red-eye 1 radius value');
  const strength = page.getByLabel('Red-eye 1 strength value');
  await radius.fill('0.1');
  await radius.press('Enter');
  await strength.fill('0.2');
  await strength.press('Enter');

  await page.getByRole('button', { name: 'Reset Red-eye 1 radius' }).click();
  await expect(radius).toHaveValue('0.04');
  await expect(strength).toHaveValue('0.2');
});

test('per-channel curves and levels use ordinary undoable recipe state', async ({ page }) => {
  await openFixture(page);
  await page.locator('summary').filter({ hasText: 'Tone curve' }).click();
  await page.getByLabel('Curve channel').selectOption('red');
  await page.getByRole('button', { name: 'Add point' }).click();
  const redOutput = page.getByLabel('Red curve point 2 output percent');
  await redOutput.fill('30');
  await expect(redOutput).toHaveValue('30');

  await page.locator('summary').filter({ hasText: 'Levels' }).click();
  const gamma = page.getByLabel('Levels gamma value');
  await gamma.fill('2');
  await gamma.press('Enter');
  await expect(gamma).toHaveValue('2');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(gamma).toHaveValue('1');
  await expect(redOutput).toHaveValue('30');
});

test('channel mixer exposes each output channel and remains reversible', async ({ page }) => {
  await openFixture(page);
  await page.locator('summary').filter({ hasText: 'Channel mixer' }).click();
  await page.getByLabel('Mixer output channel').selectOption('red');
  const greenSource = page.getByLabel('Red output green source value');
  await greenSource.fill('0.5');
  await greenSource.press('Enter');
  await expect(greenSource).toHaveValue('0.5');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(greenSource).toHaveValue('0');
});
