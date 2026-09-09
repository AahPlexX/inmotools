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

test('keeps an empty Even preset distinct from All and previews/reorders output pages', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles([
    { name: 'first.pdf', mimeType: 'application/pdf', buffer: await plainPdf(100) },
    { name: 'second.pdf', mimeType: 'application/pdf', buffer: await plainPdf(200) },
  ]);
  await expect(page.getByText('first.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText('second.pdf', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Even', exact: true }).first()).toBeDisabled();
  await expect(page.getByTestId('pdf-output-preview').locator('li')).toHaveText(['first.pdf · page 1', 'second.pdf · page 1']);

  const cards = page.getByTestId('pdf-item');
  await cards.nth(0).dragTo(cards.nth(1));
  await expect(page.getByTestId('pdf-output-preview').locator('li')).toHaveText(['second.pdf · page 1', 'first.pdf · page 1']);

  // Pointer drag is optional convenience; the explicit controls remain the
  // device-agnostic ordering path for keyboard and touch-only users.
  await cards.nth(0).getByRole('button', { name: 'Move down' }).click();
  await expect(page.getByTestId('pdf-output-preview').locator('li')).toHaveText(['first.pdf · page 1', 'second.pdf · page 1']);
  await expect(page.getByText('Output pages').locator('..')).toContainText('2');
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
