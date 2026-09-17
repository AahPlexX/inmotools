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
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
}

async function dragFromTo(page: Page, start: { x: number; y: number }, end: { x: number; y: number }) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

test('direct crop handles commit one undoable crop change and expose composition guides', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Edit crop on photo' }).click();

  const overlay = page.getByTestId('photo-crop-overlay');
  await expect(overlay).toBeVisible();
  await page.getByLabel('Composition overlay').selectOption('golden');
  await expect(overlay).toHaveAttribute('data-composition-overlay', 'golden');

  const overlayBox = await overlay.boundingBox();
  const rightHandle = page.getByRole('button', { name: 'Crop right edge' });
  const handleBox = await rightHandle.boundingBox();
  if (!overlayBox || !handleBox) throw new Error('Crop overlay did not expose measurable direct controls.');

  await dragFromTo(
    page,
    { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 },
    { x: overlayBox.x + overlayBox.width * 0.75, y: handleBox.y + handleBox.height / 2 },
  );

  const cropWidth = page.getByLabel('Crop width percent value');
  const cropped = Number(await cropWidth.inputValue());
  expect(cropped).toBeGreaterThan(73);
  expect(cropped).toBeLessThan(77);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(cropWidth).toHaveValue('100');
});

test('on-image straighten traces a reference line and commits one undoable correction', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Straighten on photo' }).click();

  const reference = page.getByTestId('photo-geometry-reference');
  await expect(reference).toBeVisible();
  const box = await reference.boundingBox();
  if (!box) throw new Error('Straighten reference did not expose a measurable photo surface.');

  await dragFromTo(
    page,
    { x: box.x + box.width * 0.2, y: box.y + box.height * 0.4 },
    { x: box.x + box.width * 0.8, y: box.y + box.height * 0.5 },
  );

  const straighten = page.getByLabel('Straighten degrees value');
  const correction = Number(await straighten.inputValue());
  expect(correction).toBeLessThan(-6);
  expect(correction).toBeGreaterThan(-9);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(straighten).toHaveValue('0');
});
