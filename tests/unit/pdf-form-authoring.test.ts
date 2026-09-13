import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { splicePdfs, type PdfFormFieldDefinition } from '../../src/tools/pdf/pdf-engine';

async function sourcePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]);
  return new Uint8Array(await doc.save());
}

describe('PDF advanced form authoring', () => {
  it('authors radio groups and multiselect option lists with flags and selections', async () => {
    const fields: PdfFormFieldDefinition[] = [
      {
        type: 'radio',
        name: 'client.priority',
        options: [
          { value: 'Low', page: 1, x: 20, y: 320, width: 18, height: 18 },
          { value: 'High', page: 1, x: 20, y: 290, width: 18, height: 18 },
        ],
        selected: 'High',
        required: true,
      },
      {
        type: 'option-list',
        name: 'client.services',
        page: 1,
        x: 80,
        y: 240,
        width: 150,
        height: 90,
        options: ['Imaging', 'Therapy', 'Surgery'],
        selected: ['Imaging', 'Surgery'],
        multiselect: true,
        readOnly: true,
      },
    ];

    const output = await splicePdfs([{ bytes: await sourcePdf() }], { formFields: fields });
    const form = (await PDFDocument.load(output)).getForm();

    expect(form.getRadioGroup('client.priority').getOptions()).toEqual(['Low', 'High']);
    expect(form.getRadioGroup('client.priority').getSelected()).toBe('High');
    expect(form.getRadioGroup('client.priority').isRequired()).toBe(true);
    expect(form.getOptionList('client.services').getOptions()).toEqual(['Imaging', 'Therapy', 'Surgery']);
    expect(form.getOptionList('client.services').getSelected()).toEqual(['Imaging', 'Surgery']);
    expect(form.getOptionList('client.services').isMultiselect()).toBe(true);
    expect(form.getOptionList('client.services').isReadOnly()).toBe(true);
  });

  it('rejects duplicate radio options and option-list selections outside the declared options', async () => {
    const source = await sourcePdf();
    await expect(splicePdfs([{ bytes: source }], {
      formFields: [{
        type: 'radio',
        name: 'duplicate.radio',
        options: [
          { value: 'Same', page: 1, x: 20, y: 320, width: 18, height: 18 },
          { value: 'Same', page: 1, x: 20, y: 290, width: 18, height: 18 },
        ],
      }],
    })).rejects.toThrow(/radio.*duplicate/i);

    await expect(splicePdfs([{ bytes: source }], {
      formFields: [{
        type: 'option-list',
        name: 'invalid.list',
        page: 1,
        x: 80,
        y: 240,
        width: 150,
        height: 90,
        options: ['A', 'B'],
        selected: ['A', 'C'],
        multiselect: true,
      }],
    })).rejects.toThrow(/option list.*selected/i);
  });
});
