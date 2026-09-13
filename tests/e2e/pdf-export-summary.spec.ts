import { PDFDocument } from 'pdf-lib';
import { expect, test } from '@playwright/test';

async function sourcePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  doc.addPage([300, 200]);
  doc.setTitle('Source title');
  return Buffer.from(await doc.save());
}

test('updates destructive, structural, and reversible export impacts before bytes are generated', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'summary.pdf', mimeType: 'application/pdf', buffer: await sourcePdf() });

  const summary = page.getByTestId('pdf-export-impact-summary');
  await expect(summary).toContainText('Source Info metadata is stripped');

  await page.getByLabel('Pages').fill('1');
  await expect(summary).toContainText('Source pages omitted');
  await expect(summary).toContainText('Destructive in this output');

  await page.getByLabel('Insert blank pages after').selectOption('1');
  await page.getByRole('button', { name: 'Stage blank pages' }).click();
  await expect(summary).toContainText('Blank pages inserted');
  await expect(summary).toContainText('Structural output change');

  await page.getByLabel('Output title').fill('Filed copy');
  await page.getByLabel('Output filename').fill('summary-filed.pdf');
  await expect(summary).toContainText('Replacement metadata staged');
  await expect(summary).toContainText('Output filename customized');
  await expect(summary).toContainText('Reversible before export');
});
