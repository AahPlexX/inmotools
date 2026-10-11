import { PDFDocument, PDFName, PDFNumber, PDFString, degrees } from 'pdf-lib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import fixtures from '../fixtures/pdf-password-fixtures.json' with { type: 'json' };

async function source(kind: 'plain' | 'actions' | 'optional' | 'xfa') {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([300, 200]);
  if (kind === 'actions') {
    doc.setTitle('Owned diagnostic source');
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ S: 'JavaScript', JS: PDFString.of('globalThis.__ownedPdfAction = true') }));
  }
  if (kind === 'optional') doc.catalog.set(PDFName.of('Names'), PDFString.of('owned malformed optional names'));
  if (kind === 'xfa') {
    page.setCropBox(20, 30, 200, 150); page.setRotation(degrees(90)); page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    doc.getForm().createTextField('owned-field');
    doc.catalog.lookup(PDFName.of('AcroForm')).set(PDFName.of('XFA'), doc.context.obj(['template', 'owned inert XFA']));
  }
  return Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }));
}

test('PDF-R04 retains readable malformed-optional sources, shows inert indicators and restores export after removal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles([
    { name: 'actions.pdf', mimeType: 'application/pdf', buffer: await source('actions') },
    { name: 'optional.pdf', mimeType: 'application/pdf', buffer: await source('optional') },
  ]);
  await expect(page.getByTestId('pdf-item')).toHaveCount(2);
  const optionalSummary = page.getByTestId('pdf-item').nth(1).getByTestId('pdf-inventory-summary');
  await expect(optionalSummary).toContainText('attachment inventory incomplete');
  await expect(optionalSummary).not.toContainText('0 embedded files');
  const first = page.getByTestId('pdf-item').nth(0).getByTestId('pdf-diagnostics');
  await first.locator('summary').click();
  await expect(first).toContainText('JavaScript, OpenAction');
  await expect(first).toContainText('Not encrypted');
  await expect(first).toContainText('Info fields: Title');
  const second = page.getByTestId('pdf-item').nth(1).getByTestId('pdf-diagnostics');
  await second.locator('summary').click();
  await expect(second).toContainText('Names should be a dictionary');
  await expect(second).toContainText('Attachment inventory not fully inspected');
  await expect(page.getByRole('button', { name: 'Process and download', exact: true })).toBeDisabled();
  await page.getByLabel('Preview source', { exact: true }).selectOption({ label: 'optional.pdf' });
  await expect(page.getByTestId('pdf-render-canvas')).toHaveAttribute('data-rendered-page', '1');
  await page.getByRole('button', { name: 'Remove optional.pdf from the queue', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download', exact: true }).click();
  const download = await downloadPromise; const stream = await download.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect((await PDFDocument.load(Buffer.concat(chunks))).getPageCount()).toBe(1);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__ownedPdfAction)).toBeUndefined();
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await expect(page.getByTestId('pdf-item')).toHaveCount(0);
});

test('PDF-R04 XFA and physical dimensions remain readable across narrow portrait, landscape and themes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const name = `owned-${'long-source-'.repeat(20)}geometry.pdf`;
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name, mimeType: 'application/pdf', buffer: await source('xfa') });
  const diagnostics = page.getByTestId('pdf-diagnostics');
  await diagnostics.locator('summary').click();
  await expect(diagnostics).toContainText('XFA: present');
  await expect(diagnostics).toContainText('1 AcroForm fields');
  await expect(diagnostics).toContainText('300 × 400 pt');
  await expect(page.getByRole('button', { name: 'Process and download', exact: true })).toBeDisabled();
  for (const viewport of [{ width: 320, height: 800 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await diagnostics.scrollIntoViewIfNeeded();
    const bounds = await diagnostics.boundingBox();
    expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    expect(await diagnostics.locator('dl > div').evaluateAll(groups => groups.every(group => {
      const term = group.querySelector('dt')!.getBoundingClientRect();
      const value = group.querySelector('dd')!.getBoundingClientRect();
      const container = group.getBoundingClientRect();
      return value.top >= term.bottom && term.left >= container.left && value.right <= container.right + 1;
    }))).toBe(true);
    await expect(diagnostics.getByText(/300 × 400 pt/)).toBeVisible();
  }
  for (const theme of ['Light', 'Dark', 'System']) {
    await page.getByRole('radio', { name: theme, exact: true }).check();
    const audit = await new AxeBuilder({ page }).include('.pdf-diagnostics').analyze();
    expect(audit.violations).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test('PDF-R04 protected reader diagnostics show actual encryption handler and remain excluded from output', async ({ page }) => {
  const entry = fixtures.files.find(f => f.name === 'owned-aes256.pdf')!;
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: entry.name, mimeType: 'application/pdf', buffer: Buffer.from(entry.base64, 'base64') });
  await page.getByLabel('PDF password', { exact: true }).fill(entry.password);
  await page.getByRole('button', { name: 'Open read-only', exact: true }).click();
  const diagnostics = page.getByTestId('pdf-protected-item').getByTestId('pdf-diagnostics');
  await diagnostics.locator('summary').click();
  await expect(diagnostics).toContainText('Encrypted · read-only');
  await expect(diagnostics).toContainText('Security handler: Standard');
  await expect(diagnostics).toContainText('Raw structural inspection is unavailable');
  await expect(page.getByTestId('pdf-item')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Process and download', exact: true })).toBeDisabled();
  await expect(page.getByTestId('pdf-render-canvas')).toHaveAttribute('data-rendered-page', '1');
  await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await expect(page.getByTestId('pdf-protected-item')).toHaveCount(0);
  await expect.poll(() => page.workers().length).toBe(0);
  expect(errors).toEqual([]);
});
