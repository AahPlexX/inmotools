import { expect, test, type Page } from '@playwright/test';
import { photoSrgbProfileBytes } from '../fixtures/photo-srgb-profile';

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

test('automatic tone and white balance write visible numeric recipe values and undo as one step', async ({ page }) => {
  await openFixture(page);
  const toneValues = [
    page.getByLabel('Exposure value'),
    page.getByLabel('Contrast value'),
    page.getByLabel('Highlights value'),
    page.getByLabel('Shadows value'),
    page.getByLabel('White point value'),
    page.getByLabel('Black point value'),
  ];

  await page.getByRole('button', { name: 'Suggest automatic tone', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Auto tone applied' })).toBeVisible();
  expect((await Promise.all(toneValues.map((control) => control.inputValue()))).some((value) => value !== '0')).toBe(true);
  await page.getByRole('button', { name: 'Undo' }).click();
  for (const control of toneValues) await expect(control).toHaveValue('0');

  const temperature = page.getByLabel('Temperature value');
  const tint = page.getByLabel('Tint value');
  await page.getByRole('button', { name: 'Suggest automatic white balance', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Auto white balance applied' })).toBeVisible();
  expect([await temperature.inputValue(), await tint.inputValue()]).not.toEqual(['0', '0']);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(temperature).toHaveValue('0');
  await expect(tint).toHaveValue('0');
});

test('3D Cube LUT import, strength, faithful export, errors, and history stay explicit', async ({ page }) => {
  await openFixture(page);
  await page.locator('summary').filter({ hasText: '3D LUT' }).click();
  const invertCube = `TITLE "Browser invert"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n`;

  await page.setInputFiles('[data-testid="photo-lut-input"]', {
    name: 'browser-invert.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from(invertCube),
  });
  await expect(page.getByTestId('photo-active-lut')).toContainText('Browser invert · 2³ grid · browser-invert.cube');
  await expect(page.getByLabel('LUT strength value')).toHaveValue('1');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('photo-active-lut')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('photo-active-lut')).toBeVisible();

  const strength = page.getByLabel('LUT strength value');
  await strength.fill('0.5');
  await strength.press('Enter');
  await expect(strength).toHaveValue('0.5');

  await page.setInputFiles('[data-testid="photo-lut-input"]', {
    name: 'broken.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from('LUT_3D_SIZE 2\n0 0 0\n'),
  });
  await expect(page.getByRole('status').filter({ hasText: 'LUT import failed' })).toBeVisible();
  await expect(page.getByTestId('photo-active-lut')).toContainText('Browser invert');
  await expect(strength).toHaveValue('0.5');

  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export active LUT', exact: true }).click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toBe('browser-invert-50pct.cube');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks).toString('utf8');
  expect(exported).toContain('TITLE "Browser invert (50% strength)"');
  expect(exported).toContain('LUT_3D_SIZE 2');
});

test('ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct', async ({ page, isMobile }) => {
  await openFixture(page);
  await page.locator('summary').filter({ hasText: 'ICC color management' }).click();
  const profile = {
    name: 'browser-srgb.icc',
    mimeType: 'application/vnd.iccprofile',
    buffer: Buffer.from(photoSrgbProfileBytes()),
  };

  await page.setInputFiles('[data-testid="photo-assigned-profile-input"]', profile);
  await expect(page.getByTestId('photo-assigned-profile')).toContainText('assigned before edits');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('photo-assigned-profile')).toContainText('No source profile assigned');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();

  await page.setInputFiles('[data-testid="photo-output-profile-input"]', profile);
  await expect(page.getByTestId('photo-output-profile')).toContainText('converted and embedded during export');
  await page.getByLabel('ICC rendering intent').selectOption('perceptual');
  await page.getByLabel('Black-point compensation').uncheck();

  await page.setInputFiles('[data-testid="photo-proof-profile-input"]', profile);
  await expect(page.getByLabel('Soft proof')).toBeChecked();
  await page.getByLabel('ICC proof intent').selectOption('absolute-colorimetric');
  await page.getByLabel('Output gamut warning').check();
  await expect(page.getByTestId('photo-proof-base')).toBeAttached({ timeout: 15_000 });
  await expect.poll(() => page.getByTestId('photo-proof-base').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await page.setInputFiles('[data-testid="photo-proof-profile-input"]', {
    name: 'broken.icc', mimeType: 'application/vnd.iccprofile', buffer: Buffer.from('not a profile'),
  });
  await expect(page.getByRole('status').filter({ hasText: 'ICC profile import failed' })).toBeVisible();
  await expect(page.getByLabel('Soft proof')).toBeChecked();

  await page.getByRole('button', { name: 'Color sampler', exact: true }).click();
  const image = page.getByTestId('photo-preview');
  const box = (await image.boundingBox())!;
  if (isMobile) await image.tap({ position: { x: box.width / 2, y: box.height / 2 } });
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByLabel('Sampled color readout')).toContainText('Before proof');
  await expect(page.getByLabel('Sampled color readout')).toContainText('After proof RGB');
  await expect(page.getByLabel('Sampled color readout')).toContainText('Lab D65');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByTestId('photo-export-profile')).toContainText('convert to and embed');
  await dialog.getByLabel('File format').selectOption('image/png');
  const downloadStarted = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download photo', exact: true }).click();
  const download = await downloadStarted;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('latin1')).toContain('iCCP');
});

test('inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview', async ({ page, isMobile }) => {
  await openFixture(page);

  await page.getByRole('button', { name: 'Scopes', exact: true }).click();
  await expect(page.getByTestId('photo-scopes')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Luminance waveform scope' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'RGB parade scope' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'YCbCr vectorscope' })).toBeVisible();
  await expect(page.getByLabel('Exposure zone distribution')).toContainText('0 EV');

  await page.getByRole('button', { name: 'Focus map', exact: true }).click();
  await expect(page.getByTestId('photo-focus-overlay')).toBeAttached();
  await expect.poll(() => page.getByTestId('photo-focus-overlay').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Exposure zones', exact: true }).click();
  await expect(page.getByTestId('photo-focus-overlay')).toHaveCount(0);
  await expect(page.getByTestId('photo-exposure-zones-overlay')).toBeAttached();

  await page.getByLabel('Canvas background').selectOption('light');
  await expect(page.locator('[data-photo-canvas]')).toHaveClass(/photo-canvas-background-light/);

  await page.getByRole('button', { name: 'Color sampler', exact: true }).click();
  const image = page.getByTestId('photo-preview');
  const box = (await image.boundingBox())!;
  const first = { x: box.width * 0.25, y: box.height * 0.35 };
  const second = { x: box.width * 0.75, y: box.height * 0.65 };
  if (isMobile) {
    await image.tap({ position: first });
    await image.tap({ position: second });
  } else {
    await image.click({ position: first });
    await image.click({ position: second });
  }
  await expect(page.getByLabel('Sampled color readout')).toContainText('2 pinned samples');
  await expect(page.getByLabel('Sampled color readout')).toContainText('pixel');
  await expect(page.getByLabel('Remove pinned sample 2')).toBeVisible();
  const samplesBeforeEdit = await page.getByLabel('Sampled color readout').textContent();
  const exposure = page.getByLabel('Exposure value');
  await exposure.fill('1');
  await exposure.press('Enter');
  await expect(page.getByLabel('Sampled color readout')).toContainText('2 pinned samples');
  await expect.poll(() => page.getByLabel('Sampled color readout').textContent()).not.toBe(samplesBeforeEdit);

  await page.getByRole('button', { name: 'Actual size' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: 'Navigator minimap' })).toBeVisible();
});
