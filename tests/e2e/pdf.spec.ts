import { PDFDocument } from 'pdf-lib';
import { expect, test } from '@playwright/test';

async function plainPdf(width = 300) {
  const doc = await PDFDocument.create();
  doc.addPage([width, 200]);
  return Buffer.from(await doc.save());
}

async function editableFormPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const field = doc.getForm().createTextField('name');
  field.addToPage(page, { x: 20, y: 120, width: 150, height: 24 });
  field.setText('Editable source');
  return Buffer.from(await doc.save());
}

async function downloadBytes(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

test('keeps an empty Even preset distinct from All and reorders output without requiring drag gestures', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles([
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await plainPdf(100) },
    { name: 'second.pdf', mimeType: 'application/pdf', buffer: await plainPdf(200) },
  ]);
  await expect(page.getByText('first.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText('second.pdf', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Even', exact: true }).first()).toBeDisabled();
  await expect(page.getByTestId('pdf-output-preview').locator('li')).toHaveText(['first.pdf · page 1', 'second.pdf · page 1']);

  // Direct-position reordering is a native single-pointer/keyboard control,
  // avoiding a custom drag gesture while preserving arbitrary queue movement.
  await page.getByLabel('Position for first.pdf').selectOption('2');
  await expect(page.getByTestId('pdf-output-preview').locator('li')).toHaveText(['second.pdf · page 1', 'first.pdf · page 1']);
  await expect(page.getByRole('button', { name: /Drag .* to reorder/ })).toHaveCount(0);

  // Step controls remain available as the simplest adjacent-movement option.
  await page.getByTestId('pdf-item').nth(0).getByRole('button', { name: 'Move down' }).click();
  await expect(page.getByTestId('pdf-output-preview').locator('li')).toHaveText(['first.pdf · page 1', 'second.pdf · page 1']);
  await expect(page.getByText('Output pages', { exact: true }).locator('..')).toContainText('2');
});

test('blocks unsupported editable-form preservation and verifies flattened output before download', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'form.pdf', mimeType: 'application/pdf', buffer: await editableFormPdf() });
  await expect(page.getByTestId('pdf-form-policy')).toContainText(/1 source form field.*will be flattened/i);

  const flatten = page.getByLabel('Flatten AcroForm fields before copying pages');
  await flatten.uncheck();
  await expect(page.getByTestId('pdf-form-policy')).toContainText(/Processing is blocked.*would not remain editable/i);
  await expect(page.getByRole('button', { name: 'Process and download' })).toBeDisabled();

  await flatten.check();
  await expect(page.getByRole('button', { name: 'Process and download' })).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download' }).click();
  const download = await downloadPromise;
  const bytes = await downloadBytes(download);
  const output = await PDFDocument.load(bytes);
  expect(output.getPageCount()).toBe(1);
  expect(output.getForm().getFields()).toHaveLength(0);
  await expect(page.locator('.status-line')).toContainText(/1 source form field flattened; output inspection found 0 editable fields/i);
});

test('authors export metadata from the visible workstation and reflows at 320 CSS pixels', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'matter.pdf', mimeType: 'application/pdf', buffer: await plainPdf() });

  await expect(page.getByRole('heading', { name: 'Document properties & export' })).toBeVisible();
  await page.getByLabel('Output title').fill('Filed copy');
  await page.getByLabel('Output author').fill('Records team');
  await page.getByLabel('Output subject').fill('Matter 24-001');
  await page.getByLabel('Output keywords').fill('filed, reviewed');
  await page.getByLabel('Document language').fill('en-US');
  await page.getByLabel('Output filename').fill('matter-filed.pdf');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('matter-filed.pdf');
  const output = await PDFDocument.load(await downloadBytes(download), { updateMetadata: false });
  expect(output.getTitle()).toBe('Filed copy');
  expect(output.getAuthor()).toBe('Records team');
  expect(output.getSubject()).toBe('Matter 24-001');
  expect(output.getKeywords()).toBe('filed reviewed');

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByLabel('Output filename')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('inserts blank pages, edits page boxes, and writes metadata dates through the visible workstation', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'packet.pdf', mimeType: 'application/pdf', buffer: await plainPdf() });

  await page.getByLabel('Output creation date/time (UTC)').fill('2026-09-12T10:30');
  await page.getByLabel('Output modification date/time (UTC)').fill('2026-09-12T14:45');

  await expect(page.getByRole('heading', { name: 'Blank page insertion' })).toBeVisible();
  await page.getByLabel('Blank page size').selectOption('letter');
  await page.getByLabel('Insert blank pages after').selectOption('1');
  await page.getByRole('button', { name: 'Stage blank pages' }).click();
  await expect(page.getByTestId('pdf-output-preview').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('pdf-output-preview').locator('li').nth(1)).toContainText('Blank page');

  await expect(page.getByRole('heading', { name: 'Page geometry' })).toBeVisible();
  await page.getByLabel('Geometry output page').selectOption({ index: 1 });
  await page.getByLabel('CropBox x').fill('10');
  await page.getByLabel('CropBox y').fill('20');
  await page.getByLabel('CropBox width').fill('500');
  await page.getByLabel('CropBox height').fill('700');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download' }).click();
  const output = await PDFDocument.load(await downloadBytes(await downloadPromise), { updateMetadata: false });
  expect(output.getPageCount()).toBe(2);
  expect(output.getCreationDate()?.toISOString()).toBe('2026-09-12T10:30:00.000Z');
  expect(output.getModificationDate()?.toISOString()).toBe('2026-09-12T14:45:00.000Z');
  expect(output.getPage(1).getSize()).toEqual({ width: 612, height: 792 });
  expect(output.getPage(1).getCropBox()).toEqual({ x: 10, y: 20, width: 500, height: 700 });
});
