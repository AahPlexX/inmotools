import { expect, test } from '@playwright/test';

test('opens Crystal Lattice Studio through the catalog and keeps the engine local', async ({ page }) => {
  await page.goto('./#/');
  const link = page.getByRole('link', { name: /Crystal Lattice Studio/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '#/tools/crystal-lattice-studio');
  await link.click();

  await expect(page.getByTestId('suite-title')).toContainText('Crystal Lattice Studio');
  await expect(page.getByTestId('privacy-status')).toContainText(/local|browser|device/i);
  await expect(page.getByTestId('crystal-workspace')).toBeVisible();
});

test('renders an interactive crystal viewport for the selected starter', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('nacl');

  await expect(page.getByRole('img', { name: /interactive crystal structure/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fit structure' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '+X', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '+Y', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '+Z', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Representation' })).toHaveValue('ball-stick');

  await page.getByRole('combobox', { name: 'Representation' }).selectOption('space-fill');
  await expect(page.getByRole('combobox', { name: 'Representation' })).toHaveValue('space-fill');

  const projectionToggle = page.getByRole('button', { name: 'Use orthographic projection' });
  await expect(projectionToggle).toBeEnabled();
  await projectionToggle.click();
  await expect(page.getByRole('button', { name: 'Use perspective projection' })).toBeEnabled();
});

test('edits a valid cell and supports undo, redo and reset', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');

  const cellA = page.getByLabel('Cell a (Å)');
  await expect(cellA).toHaveValue('2.8665');
  await expect(page.getByTestId('crystal-cell-volume')).toContainText('23.554 Å³');

  await cellA.fill('4');
  await cellA.press('Tab');
  await expect(page.getByTestId('crystal-cell-volume')).toContainText('32.867 Å³');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(cellA).toHaveValue('2.8665');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(cellA).toHaveValue('4');
  await page.getByRole('button', { name: 'Reset structure' }).click();
  await expect(cellA).toHaveValue('2.8665');
});

test('edits sites in fractional and Cartesian coordinates and supports site operations', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');

  await expect(page.getByTestId('crystal-site-count')).toContainText('2 sites');
  const fractionalX = page.getByLabel('Fe1 fractional x');
  await fractionalX.fill('1.25');
  await fractionalX.press('Tab');
  await page.getByRole('button', { name: 'Wrap sites into cell' }).click();
  await expect(fractionalX).toHaveValue('0.25');

  await page.getByRole('combobox', { name: 'Coordinate system' }).selectOption('cartesian');
  await expect(page.getByLabel('Fe1 Cartesian x')).toHaveValue('0.716625');

  await page.getByRole('button', { name: 'Add site' }).click();
  await expect(page.getByTestId('crystal-site-count')).toContainText('3 sites');
  await page.getByRole('button', { name: 'Duplicate Fe1' }).click();
  await expect(page.getByTestId('crystal-site-count')).toContainText('4 sites');
  await page.getByRole('button', { name: 'Delete New1' }).click();
  await expect(page.getByTestId('crystal-site-count')).toContainText('3 sites');
});

test('previews and applies a bounded supercell and measures a periodic distance', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');

  await page.getByLabel('Repeat a').fill('2');
  await page.getByLabel('Repeat b').fill('2');
  await page.getByLabel('Repeat c').fill('1');
  await expect(page.getByTestId('crystal-supercell-preview')).toContainText('8 sites');
  await page.getByRole('button', { name: 'Apply supercell' }).click();
  await expect(page.getByTestId('crystal-site-count')).toContainText('8 sites');

  await page.getByLabel('Measurement site A').selectOption({ index: 0 });
  await page.getByLabel('Measurement site B').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Add distance measurement' }).click();
  await expect(page.getByTestId('crystal-measurement-list')).toContainText('Å');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('crystal-site-count')).toContainText('2 sites');
});
