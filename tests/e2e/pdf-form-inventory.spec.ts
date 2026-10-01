import { PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import { expect, test } from '@playwright/test';

async function formInventoryPdf() {
  const document = await PDFDocument.create();
  const page1 = document.addPage([400, 400]);
  const page2 = document.addPage([400, 400]);
  const form = document.getForm();

  const name = form.createTextField('client.name');
  name.setText('Ada');
  name.enableRequired();
  name.addToPage(page1, { x: 20, y: 330, width: 140, height: 24 });
  name.acroField.dict.set(PDFName.of('DV'), PDFHexString.fromText('Reset Ada'));

  const approved = form.createCheckBox('client.approved');
  approved.addToPage(page1, { x: 20, y: 290, width: 18, height: 18 });
  approved.check();
  approved.enableReadOnly();
  approved.acroField.dict.set(PDFName.of('DV'), approved.acroField.getOnValue() ?? PDFName.of('Yes'));

  const status = form.createDropdown('client.status');
  status.setOptions(['Draft', 'Filed']);
  status.select('Filed');
  status.addToPage(page2, { x: 20, y: 330, width: 140, height: 24 });
  status.acroField.dict.set(PDFName.of('DV'), PDFHexString.fromText('Draft'));

  const priority = form.createRadioGroup('client.priority');
  priority.addOptionToPage('Low', page2, { x: 20, y: 290, width: 18, height: 18 });
  priority.addOptionToPage('High', page2, { x: 20, y: 260, width: 18, height: 18 });
  priority.select('High');
  const lowOnValue = priority.acroField.getOnValues()[0];
  if (lowOnValue) priority.acroField.dict.set(PDFName.of('DV'), lowOnValue);

  const services = form.createOptionList('client.services');
  services.setOptions(['Imaging', 'Therapy', 'Follow-up']);
  services.enableMultiselect();
  services.select(['Imaging', 'Follow-up']);
  services.addToPage(page2, { x: 80, y: 190, width: 160, height: 60 });

  return Buffer.from(await document.save());
}

test('shows rich existing AcroForm inventory on demand without requiring another upload', async ({ page }) => {
  await page.goto('./#/tools/pdf-sanitizer');
  await page.getByLabel('Add PDF files').setInputFiles({
    name: 'existing-form.pdf',
    mimeType: 'application/pdf',
    buffer: await formInventoryPdf(),
  });

  const queueItem = page.getByTestId('pdf-item');
  await expect(queueItem).toContainText('5 AcroForm fields');
  await page.getByRole('button', { name: 'Inspect 5 existing form fields' }).click();

  const inventory = page.getByTestId('pdf-source-form-inventory');
  await expect(inventory).toBeVisible();
  await expect(inventory.getByTestId('pdf-source-form-field')).toHaveCount(5);

  const nameRow = inventory.getByRole('row', { name: /client\.name/ });
  await expect(nameRow).toContainText('text');
  await expect(nameRow).toContainText('1');
  await expect(nameRow).toContainText('required');
  await expect(nameRow).toContainText('Ada');
  await expect(nameRow).toContainText('Reset Ada');

  const checkboxRow = inventory.getByRole('row', { name: /client\.approved/ });
  await expect(checkboxRow).toContainText('checkbox');
  await expect(checkboxRow).toContainText('read-only');
  await expect(checkboxRow).toContainText('checked');

  const dropdownRow = inventory.getByRole('row', { name: /client\.status/ });
  await expect(dropdownRow).toContainText('dropdown');
  await expect(dropdownRow).toContainText('2');
  await expect(dropdownRow).toContainText('Filed');
  await expect(dropdownRow).toContainText('Draft');

  const radioRow = inventory.getByRole('row', { name: /client\.priority/ });
  await expect(radioRow).toContainText('radio');
  await expect(radioRow).toContainText('High');
  await expect(radioRow).toContainText('Low');

  const listRow = inventory.getByRole('row', { name: /client\.services/ });
  await expect(listRow).toContainText('option list');
  await expect(listRow).toContainText('Imaging, Follow-up');
});
