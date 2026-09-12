import { expect, test, type Page } from '@playwright/test';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAACqElEQVR42u3VQQ0AMQwDwbVU/pj7OBQ9zTyWQeJVqzVVfa6nBTzqtO+CVfW9WmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpgsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGCywqlpgwAKrqgUGC6yqFhiwwKoW2AKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwwWWFUtMGCBVdUCgwVWVQsMWGBVtcBggVXVAgMWWNUCAxZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGBVtcCABVZVCwwWWFUtMGCBVS0wYIFV1QIDFljVAgMWWFUtMGCBVS0wYIFV1QKDBVZVCwxYYFW1wGCBVdUCAxZYVS0wWGBVtcCABVa1wIAFVlULDFhgVQsMWGBVtcCABVa1wIAFVlULDBZYVS0wYIFV1QKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwxYYFULDFhgVbXAYIFV1QIDFlhVLTBYYFW1wIAFVlULDBZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGALrGqBAQusqhYYLLCqWmDAAquqBQYLrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoHBAquqBQYssKpaYLDAqmqBAQusqhYYLLCqWmDAAqtaYMACq6oFBiywqgUGLLCqWmCwwD6ZqgUGLLCqWmCwwKpqgQELrKoWGCywqlpgwAKrWmDAAquqBQYssKoFBiywqlpgwAKrWmDAAquqBQYLrKoWGLDAqmqBwQKrqgUGLLCqWmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpg+I0LLVVQ6zZs79UAAAAASUVORK5CYII=',
  'base64',
);

async function openFixture(page: Page) {
  await page.goto('/inmotools/#/tools/photo-studio');
  const workspace = page.getByTestId('suite-workspace');
  await expect(workspace.getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await page.getByLabel('Exposure value').fill('1');
  await page.getByLabel('Exposure value').press('Enter');
  await page.getByRole('button', { name: 'Before/after' }).click();
}

test('split comparison has a draggable and keyboard-adjustable boundary', async ({ page }) => {
  await openFixture(page);

  const splitMode = page.getByRole('button', { name: 'Split' });
  await expect(splitMode).toBeVisible();
  await expect(splitMode).toHaveAttribute('aria-pressed', 'true');

  const slider = page.getByRole('slider', { name: 'Before/after split position' });
  await expect(slider).toBeVisible();
  await expect(slider).toHaveValue('50');
  await expect(page.getByTestId('photo-before-overlay')).toBeVisible();

  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('51');

  const box = await slider.boundingBox();
  if (!box) throw new Error('Comparison slider has no bounding box.');
  await page.mouse.move(box.x + box.width * 0.51, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  const value = Number(await slider.inputValue());
  expect(value).toBeGreaterThanOrEqual(70);
  expect(value).toBeLessThanOrEqual(80);
});

test('side-by-side comparison keeps before and after at the same zoom', async ({ page }) => {
  await openFixture(page);

  await page.getByRole('button', { name: 'Side by side' }).click();
  await expect(page.getByRole('button', { name: 'Side by side' })).toHaveAttribute('aria-pressed', 'true');
  const comparison = page.getByTestId('photo-compare-side-by-side');
  await expect(comparison).toBeVisible();

  const before = page.getByTestId('photo-compare-before-image');
  const after = page.getByTestId('photo-compare-after-image');
  const beforeInitial = await before.boundingBox();
  const afterInitial = await after.boundingBox();
  if (!beforeInitial || !afterInitial) throw new Error('Comparison images have no bounding boxes.');
  expect(Math.abs(beforeInitial.width - afterInitial.width)).toBeLessThan(1);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  const beforeZoomed = await before.boundingBox();
  const afterZoomed = await after.boundingBox();
  if (!beforeZoomed || !afterZoomed) throw new Error('Zoomed comparison images have no bounding boxes.');
  expect(beforeZoomed.width).toBeGreaterThan(beforeInitial.width);
  expect(Math.abs(beforeZoomed.width - afterZoomed.width)).toBeLessThan(1);
});
