import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download } from '@playwright/test';
import { extractPdfAttachments } from '../../src/tools/pdf/pdf-engine';

async function specimen(pages: number, form = false) {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pages; i++) doc.addPage([300 + i, 200]).drawText(`Owned split page ${i}`);
  if (form) { const field = doc.getForm().createTextField('owned'); field.addToPage(doc.getPage(0), { x: 10, y: 20, width: 150, height: 24 }); field.setText('Owned field'); }
  return { name: 'owned-split.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}
async function downloaded(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing split download stream.');
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test('PDF-R07 R08 R09 prepare real range, burst and byte-limited files with ZIP, metadata, attachments and responsive accessible controls', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles(await specimen(5));
  const prepare = page.getByRole('button', { name: 'Prepare split PDFs', exact: true });
  await expect(prepare).toBeEnabled();
  await page.getByLabel('Output title', { exact: true }).fill('Owned split title');
  await page.getByLabel('Output filename', { exact: true }).fill('😀'.repeat(80) + '.pdf');
  await page.getByLabel('Add output attachments').setInputFiles({ name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from('Owned split evidence') });
  await page.getByLabel('Split ranges', { exact: true }).fill('1-2, 3, 4-5');
  await prepare.click();
  const parts = page.getByTestId('pdf-split-part');
  await expect(parts).toHaveCount(3);
  const names: string[] = [];
  for (let i = 0; i < 3; i++) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download part ${i + 1}`, exact: true }).click();
    const download = await pending; names.push(download.suggestedFilename());
    const bytes = await downloaded(download); const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPages().map(value => value.getWidth())).toEqual([[301, 302], [303], [304, 305]][i]);
    expect(pdf.getTitle()).toBe('Owned split title');
    expect((await extractPdfAttachments(bytes))[0].bytes).toEqual(new Uint8Array(Buffer.from('Owned split evidence')));
    expect(bytes.byteLength).toBe(Number(await parts.nth(i).getAttribute('data-bytes')));
  }
  const zipPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all as ZIP', exact: true }).click();
  const zip = await JSZip.loadAsync(await downloaded(await zipPending));
  expect(Object.keys(zip.files)).toEqual(names);
  for (const size of [{ width: 320, height: 800 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  }
  for (const theme of ['Light', 'Dark', 'System']) {
    await page.getByRole('radio', { name: theme, exact: true }).check();
    expect((await new AxeBuilder({ page }).include('.pdf-split-section').analyze()).violations).toEqual([]);
  }
  await page.getByLabel('Pages', { exact: true }).fill('1-3');
  await expect(parts).toHaveCount(0);
  await page.getByLabel('Split mode', { exact: true }).selectOption('burst');
  await prepare.click(); await expect(parts).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: `Download part ${i + 1}`, exact: true }).click();
    expect((await PDFDocument.load(await downloaded(await pending))).getPages().map(value => value.getWidth())).toEqual([301 + i]);
  }
  await page.getByLabel('Split mode', { exact: true }).selectOption('size');
  await page.getByLabel('Maximum part size (MB)', { exact: true }).fill('1');
  await page.getByLabel('Size split order', { exact: true }).selectOption('best-fit');
  await prepare.click(); await expect(parts).toHaveCount(1);
  expect(Number(await parts.first().getAttribute('data-bytes'))).toBeLessThanOrEqual(1_000_000);
  const sizePending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download part 1', exact: true }).click();
  const sizeBytes = await downloaded(await sizePending);
  expect(sizeBytes.byteLength).toBeLessThanOrEqual(1_000_000); expect((await PDFDocument.load(sizeBytes)).getPageCount()).toBe(3);
  await page.getByLabel('Maximum part size (MB)', { exact: true }).fill('0.000001');
  await prepare.click();
  await expect(page.getByTestId('pdf-split-status')).toContainText('Page 1 alone requires');
  await expect(parts).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await expect(prepare).toBeDisabled(); expect(errors).toEqual([]);
});

test('PDF-R07 R08 R09 reject invalid/form plans, cancel preparation, invalidate edits and bound burst result groups', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles(await specimen(1, true));
  await page.getByLabel('Flatten source AcroForm fields before copying pages').uncheck();
  const prepare = page.getByRole('button', { name: 'Prepare split PDFs', exact: true });
  await expect(prepare).toBeDisabled();
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await page.getByLabel('Add PDF files').setInputFiles(await specimen(250));
  await page.getByLabel('Flatten source AcroForm fields before copying pages').check();
  await page.getByLabel('Split ranges', { exact: true }).fill('1,,2');
  await expect(prepare).toBeDisabled();
  await page.getByLabel('Split mode', { exact: true }).selectOption('burst');
  await prepare.click();
  await page.getByRole('button', { name: 'Cancel split operation', exact: true }).click();
  await expect(page.getByTestId('pdf-split-status')).toContainText('cancelled');
  await expect(page.getByTestId('pdf-split-part')).toHaveCount(0);
  await expect(prepare).toBeEnabled();
  await page.getByLabel('Pages', { exact: true }).fill('1-25');
  await prepare.click();
  await expect(page.getByTestId('pdf-split-status')).toContainText('Prepared 25 PDFs');
  await expect(page.getByTestId('pdf-split-part')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next split group', exact: true }).click();
  await expect(page.getByTestId('pdf-split-part')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Download part 21', exact: true })).toBeVisible();
  await page.getByLabel('Output title', { exact: true }).fill('Edited after preparation');
  await expect(page.getByTestId('pdf-split-part')).toHaveCount(0);
  await page.goto('./#/');
  await expect.poll(() => page.workers().filter(worker => worker.url().includes('pdf.worker')).length).toBe(0);
  expect(errors).toEqual([]);
});
