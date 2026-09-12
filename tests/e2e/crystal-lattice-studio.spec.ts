import { Buffer } from 'node:buffer';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';

const localCif = `data_local
_cell_length_a 5
_cell_length_b 5
_cell_length_c 5
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
Na1 Na 0 0 0 1
Cl1 Cl 0.5 0.5 0.5 1
`;

const PHASE_ONE_VIEWPORTS = [
  { name: '320 portrait', width: 320, height: 568 },
  { name: '390 portrait', width: 390, height: 844 },
  { name: '844 landscape', width: 844, height: 390 },
  { name: '768 tablet', width: 768, height: 1024 },
  { name: '1440 desktop', width: 1440, height: 900 },
] as const;

async function downloadBase64(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('base64');
}

async function pngCornerAlpha(page: Page, download: Download): Promise<number> {
  const encoded = await downloadBase64(download);
  return page.evaluate(async (base64) => new Promise<number>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('2D canvas unavailable while inspecting PNG'));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(context.getImageData(0, 0, 1, 1).data[3] ?? 0);
    };
    image.onerror = () => reject(new Error('Downloaded PNG could not be decoded'));
    image.src = `data:image/png;base64,${base64}`;
  }), encoded);
}

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

test('edits document metadata through the same undoable history', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');

  await page.getByRole('button', { name: 'Data & metadata' }).click();
  const dialog = page.getByRole('dialog', { name: 'Data & metadata' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title').fill('Reviewed BCC structure');
  await dialog.getByLabel('Creator').fill('Local crystallographer');
  await dialog.getByRole('button', { name: 'Save metadata' }).click();
  await expect(dialog).not.toBeVisible();

  await page.getByRole('button', { name: 'Data & metadata' }).click();
  await expect(dialog.getByLabel('Title')).toHaveValue('Reviewed BCC structure');
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Data & metadata' }).click();
  await expect(dialog.getByLabel('Title')).toHaveValue('α-Iron — body-centered cubic');
});

test('previews metadata impact and downloads a selected scientific format', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export crystal' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Export format').selectOption('cif2');
  await expect(dialog.getByTestId('crystal-export-generated')).toContainText('_cell_length_a');
  await expect(dialog.getByTestId('crystal-export-preview')).toContainText('#\\#CIF_2.0');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download CIF 2.0' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.cif$/i);
});

test('opens a local file without uploading it and allows the same file to be selected again', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH'].includes(request.method())) writes.push(request.url());
  });

  const input = page.getByTestId('crystal-structure-file-input');
  const file = { name: 'local.cif', mimeType: 'chemical/x-cif', buffer: Buffer.from(localCif) };
  await input.setInputFiles(file);
  await expect(page.getByTestId('crystal-file-status')).toContainText('Imported local.cif');
  await expect(page.getByTestId('crystal-site-count')).toContainText('2 sites');
  await expect(page.getByLabel('Cell a (Å)')).toHaveValue('5');
  await expect(input).toHaveValue('');

  await page.getByLabel('Cell a (Å)').fill('7');
  await page.getByLabel('Cell a (Å)').press('Tab');
  await expect(page.getByLabel('Cell a (Å)')).toHaveValue('7');

  await input.setInputFiles(file);
  await expect(page.getByLabel('Cell a (Å)')).toHaveValue('5');
  await expect(input).toHaveValue('');
  expect(writes).toEqual([]);
});

test('saves and reopens a project with structure and view selections', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');
  await page.getByLabel('Cell a (Å)').fill('4');
  await page.getByLabel('Cell a (Å)').press('Tab');
  await page.getByRole('combobox', { name: 'Representation' }).selectOption('space-fill');
  await page.getByRole('button', { name: 'Use orthographic projection' }).click();

  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export crystal' });
  await dialog.getByLabel('Export format').selectOption('project');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download Crystal project' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.crystal\.json$/i);
  const savedPath = await download.path();
  expect(savedPath).not.toBeNull();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('nacl');
  await page.getByRole('combobox', { name: 'Representation' }).selectOption('sticks');
  await page.getByRole('button', { name: 'Use perspective projection' }).click();
  await expect(page.getByLabel('Cell a (Å)')).toHaveValue('5.6402');

  const projectInput = page.getByTestId('crystal-project-file-input');
  await projectInput.setInputFiles(savedPath!);
  await expect(page.getByTestId('crystal-file-status')).toContainText('Opened project');
  await expect(page.getByLabel('Cell a (Å)')).toHaveValue('4');
  await expect(page.getByRole('combobox', { name: 'Representation' })).toHaveValue('space-fill');
  await expect(page.getByRole('button', { name: 'Use perspective projection' })).toBeEnabled();
  await expect(projectInput).toHaveValue('');
});

test('downloads a true vector SVG publication graphic', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('bcc');
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export crystal' });
  await dialog.getByLabel('Export format').selectOption('svg');

  const preview = dialog.getByTestId('crystal-export-preview');
  await expect(preview).toContainText('<svg');
  await expect(preview).toContainText('<circle');
  await expect(preview).toContainText('Fe1');
  await expect(preview).not.toContainText('data:image/png');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download SVG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/i);
});

test('PNG publication export honors transparent and solid backgrounds', async ({ page }) => {
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export crystal' });
  await dialog.getByLabel('Export format').selectOption('png');
  await dialog.getByLabel('Image width (px)').fill('320');
  await dialog.getByLabel('Image height (px)').fill('240');

  await dialog.getByLabel('PNG background').selectOption('transparent');
  const transparentDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PNG' }).click();
  const transparentDownload = await transparentDownloadPromise;
  expect(transparentDownload.suggestedFilename()).toMatch(/\.png$/i);
  expect(await pngCornerAlpha(page, transparentDownload)).toBeLessThan(255);

  await dialog.getByLabel('PNG background').selectOption('white');
  const solidDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PNG' }).click();
  const solidDownload = await solidDownloadPromise;
  expect(await pngCornerAlpha(page, solidDownload)).toBe(255);
});

test('Phase 1 reflows across the explicit acceptance viewport matrix', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The explicit viewport matrix only needs one browser-project pass.');
  await page.goto('./#/tools/crystal-lattice-studio');
  await page.getByRole('combobox', { name: /Starter structure/ }).selectOption('nacl');
  await expect(page.getByRole('heading', { name: 'Edit the structure' })).toBeVisible();

  for (const viewport of PHASE_ONE_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.getByRole('heading', { name: 'Edit the structure' }).scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const overflow = await page.evaluate(() => Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - document.body.clientWidth,
    ));
    expect(overflow, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(1);
  }
});

test('Phase 1 workspace has no serious or critical axe violations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One focused axe pass covers the shared workspace DOM.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./#/tools/crystal-lattice-studio');
  await expect(page.getByTestId('crystal-workspace')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[data-testid="crystal-workspace"]')
    .analyze();
  const severe = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(severe).toEqual([]);
});

test('Phase 1 controls are keyboard operable and dialogs restore focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Keyboard acceptance only needs one browser-project pass.');
  await page.goto('./#/tools/crystal-lattice-studio');

  const starter = page.getByRole('combobox', { name: /Starter structure/ });
  await starter.focus();
  await expect(starter).toBeFocused();
  await starter.press('ArrowDown');
  await expect(starter).not.toHaveValue('nacl');
  await starter.selectOption('bcc');

  const cellA = page.getByLabel('Cell a (Å)');
  await cellA.focus();
  await cellA.press('ControlOrMeta+A');
  await cellA.pressSequentially('3');
  await expect(cellA).toHaveValue('3');

  const fractionalX = page.getByLabel('Fe1 fractional x');
  await fractionalX.focus();
  await expect(fractionalX).toBeFocused();
  const duplicate = page.getByRole('button', { name: 'Duplicate Fe1' });
  await duplicate.focus();
  await duplicate.press('Enter');
  await expect(page.getByTestId('crystal-site-count')).toContainText('3 sites');

  const repeatA = page.getByLabel('Repeat a');
  await repeatA.focus();
  await repeatA.press('ControlOrMeta+A');
  await repeatA.pressSequentially('2');
  await expect(page.getByTestId('crystal-supercell-preview')).toContainText('2 × 1 × 1');

  const measurementA = page.getByLabel('Measurement site A');
  await measurementA.focus();
  await expect(measurementA).toBeFocused();
  const addMeasurement = page.getByRole('button', { name: 'Add distance measurement' });
  await addMeasurement.focus();
  await addMeasurement.press('Enter');
  await expect(page.getByTestId('crystal-measurement-list')).toContainText('Å');

  const presetX = page.getByRole('button', { name: '+X', exact: true });
  await presetX.focus();
  await presetX.press('Enter');
  await expect(presetX).toBeFocused();

  const metadataButton = page.getByRole('button', { name: 'Data & metadata' });
  await metadataButton.focus();
  await metadataButton.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Data & metadata' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Data & metadata' })).not.toBeVisible();
  await expect(metadataButton).toBeFocused();

  const exportButton = page.getByRole('button', { name: 'Export' });
  await exportButton.focus();
  await exportButton.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Export crystal' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Export crystal' })).not.toBeVisible();
  await expect(exportButton).toBeFocused();
});
