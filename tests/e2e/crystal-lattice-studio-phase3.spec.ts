import { expect, test } from '@playwright/test';

test.describe('Crystal Lattice Studio phase 3 — diffraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#/tools/crystal-lattice-studio');
    await expect(page.getByTestId('crystal-workspace')).toBeVisible();
  });

  test('renders the diffraction panel and a powder pattern for the default structure', async ({ page }) => {
    const panel = page.getByTestId('crystal-diffraction-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('crystal-diffraction-status')).toContainText('reflections');
    await expect(page.getByTestId('crystal-diffraction-plot')).toBeVisible();
    await expect(page.getByTestId('crystal-diffraction-table')).toBeVisible();
  });

  test('recalculates when radiation changes', async ({ page }) => {
    const status = page.getByTestId('crystal-diffraction-status');
    await expect(status).toContainText('X-ray');
    await page.getByTestId('crystal-diffraction-radiation').selectOption('electron');
    await expect(status).toContainText('Electron');
  });

  test('rejects a non-positive minimum d-spacing', async ({ page }) => {
    await page.getByTestId('crystal-diffraction-mind').fill('0');
    await expect(page.getByTestId('crystal-diffraction-status')).toContainText('positive');
  });

  test('overlays a local observed pattern onto the simulated stick pattern', async ({ page }) => {
    await expect(page.getByTestId('crystal-diffraction-observed-status')).toContainText('No observed pattern loaded.');
    await page.getByTestId('crystal-diffraction-observed-input').setInputFiles({
      name: 'observed.xy',
      mimeType: 'text/plain',
      buffer: Buffer.from('20 120\n26.5 980\n44.5 410\n'),
    });
    await expect(page.getByTestId('crystal-diffraction-observed-status')).toContainText('3 observed peaks');
  });
});

test.describe('Crystal Lattice Studio phase 3 — reciprocal space', () => {
  test('renders the reciprocal-space panel with pole figure and Brillouin zone', async ({ page }) => {
    await page.goto('./#/tools/crystal-lattice-studio');
    await expect(page.getByTestId('crystal-workspace')).toBeVisible();
    await expect(page.getByTestId('crystal-reciprocal-panel')).toBeVisible();
    await expect(page.getByTestId('crystal-reciprocal-status')).toContainText('poles');
    await expect(page.getByTestId('crystal-pole-figure')).toBeVisible();
    await expect(page.getByTestId('crystal-bz-wireframe')).toBeVisible();
  });
});
