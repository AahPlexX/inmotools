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
