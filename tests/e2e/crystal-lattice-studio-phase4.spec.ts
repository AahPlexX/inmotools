import { expect, test } from '@playwright/test';

const cube = [
  'CUBE demo',
  'density',
  '0 0 0 0',
  '2 -1 0 0',
  '2 0 -1 0',
  '2 0 0 -1',
  '0 1 2 3 4 5 6 7',
].join('\n');

const reflections = [
  '1 0 0 10 1',
  '0 1 0 20 2',
  '0 0 1 15 1.5',
  '0 0 0 0 0',
].join('\n');

test.describe('Crystal Lattice Studio phase 4 — advanced analysis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#/tools/crystal-lattice-studio');
    await expect(page.getByTestId('crystal-workspace')).toBeVisible();
  });

  test('exposes refinement, fields, voids, and morphology as real task areas', async ({ page }) => {
    const panel = page.getByTestId('crystal-advanced-analysis-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Reflection & Fourier analysis' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Volumetric fields' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Void & cavity analysis' })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Crystal morphology' })).toBeVisible();
  });

  test('imports a local scalar field and exposes slice plus isosurface results', async ({ page }) => {
    await page.getByTestId('crystal-volume-input').setInputFiles({
      name: 'field.cube',
      mimeType: 'text/plain',
      buffer: Buffer.from(cube),
    });

    await expect(page.getByTestId('crystal-volume-status')).toContainText('2 × 2 × 2');
    await expect(page.getByTestId('crystal-volume-slice-table')).toBeVisible();
    await expect(page.getByTestId('crystal-field-slice-preview')).toBeVisible();

    await page.getByLabel('Positive isosurface level').fill('3.5');
    await page.getByRole('button', { name: 'Update field views' }).click();
    await expect(page.getByTestId('crystal-isosurface-status')).toContainText('triangles');
    await expect(page.getByTestId('crystal-field-surface-preview')).toBeVisible();
  });

  test('runs bounded periodic void analysis and builds an inspectable morphology', async ({ page }) => {
    await page.getByLabel('Void grid spacing (Å)').fill('0.8');
    await page.getByLabel('Probe radius (Å)').fill('0.5');
    await page.getByRole('button', { name: 'Analyze voids' }).click();
    await expect(page.getByTestId('crystal-void-result')).toContainText('void');
    await expect(page.getByTestId('crystal-void-result')).toContainText('accessible');
    await expect(page.getByTestId('crystal-void-preview')).toBeVisible();

    await page.getByRole('button', { name: 'Build morphology' }).click();
    await expect(page.getByTestId('crystal-morphology-status')).toContainText('faces');
    await expect(page.getByTestId('crystal-morphology-table')).toBeVisible();
    await expect(page.getByTestId('crystal-morphology-preview')).toBeVisible();
  });

  test('loads observed reflections and reports Fo/Fc residuals plus difference-density extrema', async ({ page }) => {
    await page.getByTestId('crystal-reflection-input').setInputFiles({
      name: 'observed.hkl',
      mimeType: 'text/plain',
      buffer: Buffer.from(reflections),
    });

    await expect(page.getByTestId('crystal-reflection-status')).toContainText('3 observed reflections');
    await expect(page.getByTestId('crystal-reflection-metrics')).toContainText('R1');
    await expect(page.getByTestId('crystal-reflection-table')).toBeVisible();
    await expect(page.getByTestId('crystal-fourier-extrema')).toContainText(/maximum|minimum/i);
  });
});
