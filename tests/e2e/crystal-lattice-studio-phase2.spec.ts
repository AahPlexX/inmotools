import { expect, test } from '@playwright/test';

test('applies an explicit crystal-system constraint as an undoable cell edit', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');

  await page.getByLabel('Crystal system constraint').selectOption('cubic');
  const cellA = page.getByLabel('Cell a (Å)');
  await cellA.fill('4');
  await cellA.press('Tab');

  await expect(cellA).toHaveValue('4');
  await expect(page.getByLabel('Cell b (Å)')).toHaveValue('4');
  await expect(page.getByLabel('Cell c (Å)')).toHaveValue('4');
  await expect(page.getByLabel('Cell α (°)')).toHaveValue('90');
  await expect(page.getByLabel('Cell β (°)')).toHaveValue('90');
  await expect(page.getByLabel('Cell γ (°)')).toHaveValue('90');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(cellA).toHaveValue('2.8665');
});

test('edits advanced crystallographic site properties without hiding validation errors', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');

  await page.getByRole('button', { name: 'Advanced properties for Fe1' }).click();

  const isotope = page.getByLabel('Fe1 isotope mass number');
  await isotope.fill('56');
  await isotope.press('Tab');
  await page.getByLabel('Fe1 oxidation state').fill('2');
  await page.getByLabel('Fe1 oxidation state').press('Tab');
  await page.getByLabel('Fe1 disorder assembly').fill('A');
  await page.getByLabel('Fe1 disorder assembly').press('Tab');
  await page.getByLabel('Fe1 disorder group').fill('1');
  await page.getByLabel('Fe1 disorder group').press('Tab');
  await page.getByLabel('Fe1 isotropic displacement').fill('0.012');
  await page.getByLabel('Fe1 isotropic displacement').press('Tab');
  await page.getByLabel('Fe1 anisotropic U11').fill('0.01');
  await page.getByLabel('Fe1 anisotropic U11').press('Tab');
  await page.getByLabel('Fe1 anisotropic U22').fill('0.02');
  await page.getByLabel('Fe1 anisotropic U22').press('Tab');
  await page.getByLabel('Fe1 anisotropic U33').fill('0.03');
  await page.getByLabel('Fe1 anisotropic U33').press('Tab');
  await page.getByLabel('Fe1 notes').fill('Reference iron site');
  await page.getByLabel('Fe1 notes').press('Tab');

  await expect(isotope).toHaveValue('56');
  await expect(page.getByLabel('Fe1 oxidation state')).toHaveValue('2');
  await expect(page.getByLabel('Fe1 disorder assembly')).toHaveValue('A');
  await expect(page.getByLabel('Fe1 disorder group')).toHaveValue('1');
  await expect(page.getByLabel('Fe1 isotropic displacement')).toHaveValue('0.012');
  await expect(page.getByLabel('Fe1 anisotropic U11')).toHaveValue('0.01');
  await expect(page.getByLabel('Fe1 anisotropic U22')).toHaveValue('0.02');
  await expect(page.getByLabel('Fe1 anisotropic U33')).toHaveValue('0.03');
  await expect(page.getByLabel('Fe1 notes')).toHaveValue('Reference iron site');

  await isotope.fill('0');
  await isotope.press('Tab');
  await expect(page.getByRole('alert')).toContainText(/isotope/i);
  await expect(isotope).toHaveValue('56');
});