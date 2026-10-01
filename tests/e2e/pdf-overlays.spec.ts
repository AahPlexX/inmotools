import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { expect, test } from '@playwright/test';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function twoPagePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  doc.addPage([400, 300]);
  return Buffer.from(await doc.save());
}

async function downloadBytes(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

test('exports deterministic page tokens, Bates numbering, text watermark, and image watermark from visible controls', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({
    name: 'packet.pdf',
    mimeType: 'application/pdf',
    buffer: await twoPagePdf(),
  });

  await expect(page.getByRole('heading', { name: 'Bates, headers, footers & watermarks' })).toBeVisible();
  await page.getByLabel('Output filename').fill('packet-filed.pdf');
  await page.getByLabel('Token date').fill('2026-09-12');
  await page.getByLabel('Header template').fill('{{filename}} · {{page}}/{{pages}}');
  await page.getByLabel('Header alignment').selectOption('center');
  await page.getByLabel('Footer template').fill('Filed {{date}}');
  await page.getByLabel('Footer alignment').selectOption('right');

  await page.getByLabel('Enable Bates numbering').check();
  await page.getByLabel('Prefix').fill('B-');
  await page.getByLabel('Start number').fill('100');
  await page.getByLabel('Number padding').fill('5');
  await page.getByLabel('Placement').selectOption('footer-left');

  await page.getByLabel('Watermark template').fill('DRAFT {{page}}');
  await page.getByLabel('Opacity').first().fill('0.2');
  await page.getByLabel('Rotation (degrees)').first().fill('-35');

  await page.getByLabel('PNG or JPEG watermark').setInputFiles({
    name: 'mark.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });
  await page.getByLabel('Width (% of page)').fill('20');
  await page.getByLabel('Placement').last().selectOption('center');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('packet-filed.pdf');

  const output = await PDFDocument.load(await downloadBytes(download), { updateMetadata: false });
  expect(output.getPageCount()).toBe(2);
  for (const outputPage of output.getPages()) {
    const resources = outputPage.node.Resources();
    expect(resources?.lookupMaybe(PDFName.of('Font'), PDFDict)).toBeDefined();
    expect(resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)).toBeDefined();
  }

  await expect(page.locator('.status-line')).toContainText(/5 export overlay configurations were applied across the final pages/i);
});
