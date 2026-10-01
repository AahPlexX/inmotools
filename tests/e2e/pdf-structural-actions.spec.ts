import { PDFDocument } from 'pdf-lib';
import { expect, test } from '@playwright/test';

async function pdfWithPageSizes(sizes: Array<[number, number]>) {
  const document = await PDFDocument.create();
  sizes.forEach(([width, height]) => document.addPage([width, height]));
  return Buffer.from(await document.save());
}

async function downloadBytes(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function processAndOpen(page: import('@playwright/test').Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download' }).click();
  return PDFDocument.load(await downloadBytes(await downloadPromise), { updateMetadata: false });
}

test('merges multiple source PDFs in the visible queue order', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles([
    { name: 'alpha.pdf', mimeType: 'application/pdf', buffer: await pdfWithPageSizes([[111, 211]]) },
    { name: 'beta.pdf', mimeType: 'application/pdf', buffer: await pdfWithPageSizes([[222, 322]]) },
  ]);

  await page.getByLabel('Position for alpha.pdf').selectOption('2');
  const output = await processAndOpen(page);

  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getSize()).toEqual({ width: 222, height: 322 });
  expect(output.getPage(1).getSize()).toEqual({ width: 111, height: 211 });
});

test('extracts an exact selected page range into the rebuilt output', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({
    name: 'range.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWithPageSizes([[111, 211], [222, 322], [333, 433]]),
  });

  await page.getByRole('textbox', { name: 'Pages', exact: true }).fill('2-3');
  const output = await processAndOpen(page);

  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getSize()).toEqual({ width: 222, height: 322 });
  expect(output.getPage(1).getSize()).toEqual({ width: 333, height: 433 });
});

test('duplicates pages when a page number is intentionally repeated', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({
    name: 'duplicate.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWithPageSizes([[144, 244]]),
  });

  await page.getByRole('textbox', { name: 'Pages', exact: true }).fill('1,1');
  const output = await processAndOpen(page);

  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getSize()).toEqual({ width: 144, height: 244 });
  expect(output.getPage(1).getSize()).toEqual({ width: 144, height: 244 });
});

test('persists the selected 90 degree page rotation in downloaded bytes', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({
    name: 'rotate.pdf',
    mimeType: 'application/pdf',
    buffer: await pdfWithPageSizes([[180, 280]]),
  });

  await page.getByLabel('Rotate output').selectOption('90');
  const output = await processAndOpen(page);

  expect(output.getPageCount()).toBe(1);
  expect(output.getPage(0).getRotation().angle).toBe(90);
});
