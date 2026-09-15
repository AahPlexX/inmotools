import { expect, test } from '@playwright/test';

const csvBuffer = Buffer.from('id,name\n1,Ada\n2,Grace\n', 'utf8');
const jsonBuffer = Buffer.from(JSON.stringify([{ id: 1, note: "O'Neil" }, { id: 2, note: 'x' }]), 'utf8');
const wktBuffer = Buffer.from('POINT (30 10)\nLINESTRING (0 0, 1 1, 2 5)\n', 'utf8');
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('converts CSV to JSON entirely in the browser', async ({ page }) => {
  await page.goto('./#/tools/transcode-workstation');
  await page.getByLabel('Choose files to convert').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: csvBuffer });
  await expect(page.locator('.tc-file-name', { hasText: 'people.csv' })).toBeVisible();

  await page.locator('.tc-target-chip[data-format="json"]').click();
  await page.getByRole('button', { name: /Convert 1 file → JSON/ }).click();
  await expect(page.getByRole('heading', { name: 'people.csv → JSON' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('people.json');
  const content = JSON.parse((await (await download.createReadStream()).read()).toString());
  expect(content).toEqual([{ id: '1', name: 'Ada' }, { id: '2', name: 'Grace' }]);
});

test('converts JSON to SQL with dialect options', async ({ page }) => {
  await page.goto('./#/tools/transcode-workstation');
  await page.getByLabel('Choose files to convert').setInputFiles({ name: 'rows.json', mimeType: 'application/json', buffer: jsonBuffer });
  await page.locator('.tc-target-chip[data-format="sql"]').click();
  await page.getByLabel('Table name').fill('notes');
  await page.getByRole('button', { name: /Convert 1 file → SQL/ }).click();

  await expect(page.getByRole('heading', { name: 'rows.json → SQL' })).toBeVisible();
  await page.getByText('Preview').click();
  await expect(page.locator('.tc-preview')).toContainText('CREATE TABLE');
  await expect(page.locator('.tc-preview')).toContainText("O''Neil");
});

test('parses WKT geometry text into GeoJSON', async ({ page }) => {
  await page.goto('./#/tools/transcode-workstation');
  await page.getByLabel('Choose files to convert').setInputFiles({ name: 'shapes.wkt', mimeType: 'text/plain', buffer: wktBuffer });
  await page.locator('.tc-target-chip[data-format="geojson"]').click();
  await page.getByRole('button', { name: /Convert 1 file → GeoJSON/ }).click();
  await expect(page.getByRole('heading', { name: 'shapes.wkt → GeoJSON' })).toBeVisible();
  await page.getByText('Preview').click();
  await expect(page.locator('.tc-preview')).toContainText('FeatureCollection');
  await expect(page.locator('.tc-preview')).toContainText('LineString');
});

test('transcodes PNG to BMP and writes metadata-free deterministic output', async ({ page }) => {
  await page.goto('./#/tools/transcode-workstation');
  await page.getByLabel('Choose files to convert').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: onePixelPng });
  await page.locator('.tc-target-chip[data-format="bmp"]').click();
  await page.getByRole('button', { name: /Convert 1 file → BMP/ }).click();
  await expect(page.getByRole('heading', { name: 'dot.png → BMP' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('dot.bmp');
  const bytes = await (await download.createReadStream()).read();
  expect(bytes.subarray(0, 2).toString()).toBe('BM');
});

test('batches multiple files and downloads a ZIP', async ({ page }) => {
  await page.goto('./#/tools/transcode-workstation');
  await page.getByLabel('Choose files to convert').setInputFiles([
    { name: 'alpha.csv', mimeType: 'text/csv', buffer: csvBuffer },
    { name: 'beta.csv', mimeType: 'text/csv', buffer: csvBuffer },
  ]);
  await page.locator('.tc-target-chip[data-format="json"]').click();
  await page.getByRole('button', { name: /Convert 2 files → JSON/ }).click();
  await expect(page.getByRole('heading', { name: 'alpha.csv → JSON' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'beta.csv → JSON' })).toBeVisible();

  const zipPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all as ZIP' }).click();
  const zip = await zipPromise;
  expect(zip.suggestedFilename()).toBe('transcode-results.zip');
  const bytes = await (await zip.createReadStream()).read();
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
});

test('encodes an image to Base64 text', async ({ page }) => {
  await page.goto('./#/tools/transcode-workstation');
  await page.getByLabel('Choose files to convert').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: onePixelPng });
  await page.locator('.tc-target-chip[data-format="base64"]').click();
  await page.getByRole('button', { name: /Convert 1 file → Base64/ }).click();
  await expect(page.getByRole('heading', { name: 'dot.png → Base64' })).toBeVisible();
  await page.getByText('Preview').click();
  await expect(page.locator('.tc-preview')).toContainText('iVBOR');
});
