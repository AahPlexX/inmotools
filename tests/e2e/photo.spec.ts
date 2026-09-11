import { expect, test, type Page } from '@playwright/test';

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

async function dragOnPhoto(page: Page, startX: number, startY: number, endX: number, endY: number) {
  const frame = page.getByTestId('photo-image-frame');
  const box = await frame.boundingBox();
  if (!box) throw new Error('Photo frame has no bounding box.');
  await page.mouse.move(box.x + box.width * startX, box.y + box.height * startY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * endX, box.y + box.height * endY, { steps: 5 });
  await page.mouse.up();
}

async function clickPhoto(page: Page, x: number, y: number) {
  const frame = page.getByTestId('photo-image-frame');
  const box = await frame.boundingBox();
  if (!box) throw new Error('Photo frame has no bounding box.');
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
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
  await expect(page.getByText('Radial adjustment 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('radial masks can be placed directly on the photo as one undoable gesture', async ({ page }) => {
  await openFixture(page);
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

test('reflows without page-level horizontal overflow at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/inmotools/#/tools/photo-studio');
  await expectWorkspace(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});