import { PDFDocument } from 'pdf-lib';
import { expect, test } from '@playwright/test';

async function plainPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  return Buffer.from(await doc.save());
}

async function editableFormPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const field = doc.getForm().createTextField('source.name');
  field.addToPage(page, { x: 20, y: 120, width: 150, height: 24 });
  field.setText('Source value');
  return Buffer.from(await doc.save());
}

async function downloadBytes(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

test('authors text, checkbox, dropdown, radio, and option-list fields through visible controls', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'authoring.pdf', mimeType: 'application/pdf', buffer: await plainPdf() });
  await expect(page.getByRole('heading', { name: 'Create editable form fields' })).toBeVisible();

  await page.getByLabel('Field name').fill('client.name');
  await page.getByLabel('Initial text').fill('Ada');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('checkbox');
  await page.getByLabel('Field name').fill('client.approved');
  await page.getByLabel('Checked by default').check();
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('dropdown');
  await page.getByLabel('Field name').fill('client.status');
  await page.getByLabel('Options').fill('Draft\nFiled');
  await page.getByLabel('Selected value').fill('Filed');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('radio');
  await page.getByLabel('Field name').fill('client.priority');
  await page.getByLabel('Options').fill('Low\nHigh');
  await page.getByLabel('Selected value').fill('High');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('option-list');
  await page.getByLabel('Field name').fill('client.services');
  await page.getByLabel('Options').fill('Imaging\nTherapy\nFollow-up');
  await page.getByLabel('Selected values').fill('Imaging\nFollow-up');
  await page.getByLabel('Multiselect').check();
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await expect(page.getByTestId('pdf-staged-form-field')).toHaveCount(5);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download' }).click();
  const form = (await PDFDocument.load(await downloadBytes(await downloadPromise))).getForm();
  expect(form.getTextField('client.name').getText()).toBe('Ada');
  expect(form.getCheckBox('client.approved').isChecked()).toBe(true);
  expect(form.getDropdown('client.status').getSelected()).toEqual(['Filed']);
  expect(form.getRadioGroup('client.priority').getSelected()).toBe('High');
  expect(form.getOptionList('client.services').getSelected()).toEqual(['Imaging', 'Follow-up']);
  expect(form.getOptionList('client.services').isMultiselect()).toBe(true);
});

test('flattens an existing source field while retaining a newly authored editable field', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'source-form.pdf', mimeType: 'application/pdf', buffer: await editableFormPdf() });
  await page.getByLabel('Field name').fill('replacement.note');
  await page.getByLabel('Initial text').fill('Reviewed');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download' }).click();
  const output = await PDFDocument.load(await downloadBytes(await downloadPromise));
  const form = output.getForm();
  expect(form.getFields()).toHaveLength(1);
  expect(form.getTextField('replacement.note').getText()).toBe('Reviewed');
  expect(() => form.getTextField('source.name')).toThrow();
  await expect(page.locator('.status-line')).toContainText(/1 source form field.*flattened.*1 new editable form field was authored and verified/i);
});
