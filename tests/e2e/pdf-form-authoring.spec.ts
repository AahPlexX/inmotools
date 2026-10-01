import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFString, TextAlignment } from 'pdf-lib';
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

function defaultText(field: { acroField: { dict: { lookupMaybe(name: PDFName, ...types: Array<typeof PDFString | typeof PDFHexString>): PDFString | PDFHexString | undefined } } }) {
  return field.acroField.dict.lookupMaybe(PDFName.of('DV'), PDFString, PDFHexString)?.decodeText();
}

test('authors text, checkbox, dropdown, radio, and option-list fields through visible controls', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'authoring.pdf', mimeType: 'application/pdf', buffer: await plainPdf() });
  await expect(page.getByRole('heading', { name: 'Create editable form fields' })).toBeVisible();

  await page.getByLabel('Field name').fill('client.name');
  await page.getByLabel('Current text').fill('Ada');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('checkbox');
  await page.getByLabel('Field name').fill('client.approved');
  await page.getByLabel('Current checked state').check();
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('dropdown');
  await page.getByLabel('Field name').fill('client.status');
  await page.getByLabel('Options').fill('Draft\nFiled');
  await page.getByLabel('Current selected value', { exact: true }).fill('Filed');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('radio');
  await page.getByLabel('Field name').fill('client.priority');
  await page.getByLabel('Options').fill('Low\nHigh');
  await page.getByLabel('Current selected value', { exact: true }).fill('High');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('option-list');
  await page.getByLabel('Field name').fill('client.services');
  await page.getByLabel('Options').fill('Imaging\nTherapy\nFollow-up');
  await page.getByLabel('Current selected values', { exact: true }).fill('Imaging\nFollow-up');
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

test('persists visible font, alignment, and reset defaults separately from current form values', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'properties.pdf', mimeType: 'application/pdf', buffer: await plainPdf() });

  await page.getByLabel('Field name').fill('styled.text');
  await page.getByLabel('Current text').fill('Current text');
  await page.getByLabel('Field font', { exact: true }).selectOption('courier');
  await page.getByLabel('Field font size (pt)', { exact: true }).fill('12');
  await page.getByLabel('Text alignment').selectOption('right');
  await page.getByLabel('Write a reset/default value distinct from the current value').check();
  await page.getByLabel('Reset/default text').fill('Reset text');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('checkbox');
  await page.getByLabel('Field name').fill('styled.check');
  await page.getByLabel('Write a reset/default value distinct from the current value').check();
  await page.getByLabel('Reset/default checked state').check();
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('dropdown');
  await page.getByLabel('Field name').fill('styled.dropdown');
  await page.getByLabel('Options').fill('Draft\nFiled');
  await page.getByLabel('Current selected value', { exact: true }).fill('Filed');
  await page.getByLabel('Field font', { exact: true }).selectOption('times-roman');
  await page.getByLabel('Field font size (pt)', { exact: true }).fill('10');
  await page.getByLabel('Write a reset/default value distinct from the current value').check();
  await page.getByLabel('Reset/default selected value', { exact: true }).fill('Draft');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('radio');
  await page.getByLabel('Field name').fill('styled.radio');
  await page.getByLabel('Options').fill('Low\nHigh');
  await page.getByLabel('Current selected value', { exact: true }).fill('High');
  await page.getByLabel('Write a reset/default value distinct from the current value').check();
  await page.getByLabel('Reset/default selected value', { exact: true }).fill('Low');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await page.getByLabel('Field type').selectOption('option-list');
  await page.getByLabel('Field name').fill('styled.list');
  await page.getByLabel('Options').fill('A\nB\nC');
  await page.getByLabel('Current selected values', { exact: true }).fill('B');
  await page.getByLabel('Multiselect').check();
  await page.getByLabel('Field font', { exact: true }).selectOption('helvetica');
  await page.getByLabel('Field font size (pt)', { exact: true }).fill('11');
  await page.getByLabel('Write a reset/default value distinct from the current value').check();
  await page.getByLabel('Reset/default selected values', { exact: true }).fill('A\nC');
  await page.getByRole('button', { name: 'Stage form field' }).click();

  await expect(page.getByTestId('pdf-staged-form-field')).toHaveCount(5);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Process and download' }).click();
  const form = (await PDFDocument.load(await downloadBytes(await downloadPromise))).getForm();

  const text = form.getTextField('styled.text');
  expect(text.getText()).toBe('Current text');
  expect(text.getAlignment()).toBe(TextAlignment.Right);
  expect(text.acroField.getDefaultAppearance()).toMatch(/Courier.*12(?:\.0+)?\s+Tf/);
  expect(defaultText(text)).toBe('Reset text');

  const check = form.getCheckBox('styled.check');
  expect(check.isChecked()).toBe(false);
  expect(check.acroField.dict.lookupMaybe(PDFName.of('DV'), PDFName)?.decodeText()).toBe(check.acroField.getOnValue()?.decodeText());

  const dropdown = form.getDropdown('styled.dropdown');
  expect(dropdown.getSelected()).toEqual(['Filed']);
  expect(defaultText(dropdown)).toBe('Draft');
  expect(dropdown.acroField.getDefaultAppearance()).toMatch(/Times-Roman.*10(?:\.0+)?\s+Tf/);

  const radio = form.getRadioGroup('styled.radio');
  expect(radio.getSelected()).toBe('High');
  expect(radio.acroField.dict.lookupMaybe(PDFName.of('DV'), PDFName)?.decodeText()).toBe(radio.acroField.getOnValues()[0]?.decodeText());

  const optionList = form.getOptionList('styled.list');
  expect(optionList.getSelected()).toEqual(['B']);
  const defaults = optionList.acroField.dict.lookupMaybe(PDFName.of('DV'), PDFArray);
  expect(defaults && Array.from({ length: defaults.size() }, (_, index) => defaults.lookup(index, PDFString, PDFHexString).decodeText())).toEqual(['A', 'C']);
  expect(optionList.acroField.getDefaultAppearance()).toMatch(/Helvetica.*11(?:\.0+)?\s+Tf/);
});

test('flattens an existing source field while retaining a newly authored editable field', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({ name: 'source-form.pdf', mimeType: 'application/pdf', buffer: await editableFormPdf() });
  await page.getByLabel('Field name').fill('replacement.note');
  await page.getByLabel('Current text').fill('Reviewed');
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
