import { expect, test, type Page } from '@playwright/test';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAF0lEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEBbKPLWQAAAABJRU5ErkJggg==',
  'base64',
);

async function openFixture(page: Page) {
  await page.goto('/inmotools/#/tools/photo-studio');
  await expect(page.getByRole('heading', { name: /Photo Studio/i })).toBeVisible();
  await page.setInputFiles('[data-testid="photo-file-input"]', {
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: FIXTURE_PNG,
  });
  await expect(page.getByTestId('photo-source-dimensions')).toContainText('4 × 4');
  await expect(page.getByTestId('photo-preview')).toBeVisible();
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

test('geometry and local tools produce reversible recipe state', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Crop & geometry' }).click();
  await page.getByLabel('Crop width percent').fill('75');
  await page.getByLabel('Crop width percent').press('Enter');
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await page.getByRole('button', { name: 'Local adjustments' }).click();
  await page.getByRole('button', { name: 'Add radial mask' }).click();
  await expect(page.getByText('Radial adjustment 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('metadata editor creates a reviewed XMP sidecar', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export photo' });
  await dialog.getByLabel('Metadata policy').selectOption('custom');
  await dialog.getByLabel('Title').fill('A&B portrait');
  await dialog.getByLabel('Creator').fill('Example Photographer');
  await dialog.getByLabel('Keywords').fill('portrait, example');
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
  await expect(page.getByRole('heading', { name: /Photo Studio/i })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
