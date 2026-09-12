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
  await page.getByLabel('Starter structure').selectOption('nacl');

  await expect(page.getByRole('img', { name: /interactive crystal structure/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fit structure' })).toBeEnabled();
  await expect(page.getByLabel('Representation')).toHaveValue('ball-stick');

  await page.getByLabel('Representation').selectOption('space-fill');
  await expect(page.getByLabel('Representation')).toHaveValue('space-fill');
});
