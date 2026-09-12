import { expect, test, type Page } from '@playwright/test';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAACqElEQVR42u3VQQ0AMQwDwbVU/pj7OBQ9zTyWQeJVqzVVfa6nBTzqtO+CVfW9WmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpgsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGCywqlpgwAKrqgUGC6yqFhiwwKoW2AKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwwWWFUtMGCBVdUCgwVWVQsMWGBVtcBggVXVAgMWWNUCAxZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGBVtcCABVZVCwwWWFUtMGCBVS0wYIFV1QIDFljVAgMWWFUtMGCBVS0wYIFV1QKDBVZVCwxYYFW1wGCBVdUCAxZYVS0wWGBVtcCABVa1wIAFVlULDFhgVQsMWGBVtcCABVa1wIAFVlULDBZYVS0wYIFV1QKDBVZVCwxYYFULDFhgVbXAgAVWtcCABVZVCwxYYFULDFhgVbXAYIFV1QIDFlhVLTBYYFW1wIAFVlULDBZYVS0wYIFVLTBggVXVAgMWWNUCAxZYVS0wWGALrGqBAQusqhYYLLCqWmDAAquqBQYLrKoWGLDAqhYYsMCqaoEBC6xqgQELrKoWGLDAqhYYsMCqaoHBAquqBQYssKpaYLDAqmqBAQusqhYYLLCqWmDAAqtaYMACq6oFBiywqgUGLLCqWmCwwD6ZqgUGLLCqWmCwwKpqgQELrKoWGCywqlpgwAKrWmDAAquqBQYssKoFBiywqlpgwAKrWmDAAquqBQYLrKoWGLDAqmqBwQKrqgUGLLCqWmCwwKpqgQELrGqBAQusqhYYsMCqFhiwwKpqgcEC+2SqFhiwwKpqgcECq6oFBiywqlpg+I0LLVVQ6zZs79UAAAAASUVORK5CYII=',
  'base64',
);

async function openNamedFixture(page: Page, name: string) {
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name,
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('320 × 240');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
}

test('copies a complete edit recipe across photos and pastes it as one undo step', async ({ page }) => {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expect(page.getByTestId('suite-workspace').getByRole('heading', { name: 'Photo Studio', exact: true })).toBeVisible();

  const copy = page.getByRole('button', { name: 'Copy edits' });
  const paste = page.getByRole('button', { name: 'Paste edits' });
  await expect(copy).toBeDisabled();
  await expect(paste).toBeDisabled();

  await openNamedFixture(page, 'source-a.png');
  const exposure = page.getByLabel('Exposure value');
  await exposure.fill('1.25');
  await exposure.press('Enter');

  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  const cropWidth = page.getByRole('spinbutton', { name: 'Crop width percent value', exact: true });
  await cropWidth.fill('75');
  await cropWidth.press('Enter');

  await page.getByRole('button', { name: 'Local adjustments' }).click();
  await page.getByRole('button', { name: 'Add radial mask' }).click();
  await expect(page.getByText('Radial adjustment 1', { exact: true })).toBeVisible();

  await copy.click();
  await expect(page.getByRole('status')).toContainText('Edits copied');
  await expect(paste).toBeEnabled();

  // The clipboard must be a snapshot, not a live reference to the current recipe.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await exposure.fill('2');
  await exposure.press('Enter');

  await openNamedFixture(page, 'source-b.png');
  await expect(exposure).toHaveValue('0');
  await expect(paste).toBeEnabled();

  await paste.click();
  await expect(exposure).toHaveValue('1.25');
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Crop width percent value', exact: true })).toHaveValue('75');
  await page.getByRole('button', { name: 'Local adjustments' }).click();
  await expect(page.getByText('Radial adjustment 1', { exact: true })).toBeVisible();

  // One undo must remove the entire pasted recipe, including nested geometry/local state.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(exposure).toHaveValue('0');
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Crop width percent value', exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Local adjustments' }).click();
  await expect(page.getByTestId('photo-local-adjustment')).toHaveCount(0);
});
