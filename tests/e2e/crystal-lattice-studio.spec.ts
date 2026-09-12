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
