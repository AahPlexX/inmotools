import { expect, test, type Page } from '@playwright/test';

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
