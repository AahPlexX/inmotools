import { PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { inspectPdfFormFields } from '../../src/tools/pdf/pdf-form-inventory';

async function inventoryFixture() {
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

  return new Uint8Array(await document.save());
}

describe('PDF AcroForm inventory', () => {
  it('reports field type, pages, flags, current state, and reset/default state without mutating the source', async () => {
    const bytes = await inventoryFixture();
    const before = bytes.slice();
    const fields = await inspectPdfFormFields(bytes);

    expect(bytes).toEqual(before);
    expect(fields).toEqual([
      {
        name: 'client.name',
        type: 'text',
        pages: [1],
        readOnly: false,
        required: true,
        value: 'Ada',
        defaultValue: 'Reset Ada',
      },
      {
        name: 'client.approved',
        type: 'checkbox',
        pages: [1],
        readOnly: true,
        required: false,
        value: true,
        defaultValue: true,
      },
      {
        name: 'client.status',
        type: 'dropdown',
        pages: [2],
        readOnly: false,
        required: false,
        value: ['Filed'],
        defaultValue: ['Draft'],
      },
      {
        name: 'client.priority',
        type: 'radio',
        pages: [2],
        readOnly: false,
        required: false,
        value: 'High',
        defaultValue: 'Low',
      },
      {
        name: 'client.services',
        type: 'option-list',
        pages: [2],
        readOnly: false,
        required: false,
        value: ['Imaging', 'Follow-up'],
      },
    ]);
  });
});
