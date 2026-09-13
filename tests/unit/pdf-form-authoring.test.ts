import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFString, TextAlignment } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { splicePdfs, type PdfFormFieldDefinition } from '../../src/tools/pdf/pdf-engine';

async function sourcePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]);
  return new Uint8Array(await doc.save());
}

function defaultText(field: { acroField: { dict: { lookupMaybe(name: PDFName, ...types: Array<typeof PDFString | typeof PDFHexString>): PDFString | PDFHexString | undefined } } }): string | undefined {
  return field.acroField.dict.lookupMaybe(PDFName.of('DV'), PDFString, PDFHexString)?.decodeText();
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

  it('persists standard font, alignment, font size, and real reset defaults separately from current values', async () => {
    const fields: PdfFormFieldDefinition[] = [
      {
        type: 'text',
        name: 'styled.text',
        page: 1,
        x: 20,
        y: 330,
        width: 160,
        height: 28,
        value: 'Current text',
        defaultValue: 'Reset text',
        font: 'courier',
        fontSize: 12,
        alignment: 'right',
      },
      {
        type: 'checkbox',
        name: 'styled.check',
        page: 1,
        x: 20,
        y: 290,
        width: 18,
        height: 18,
        checked: false,
        defaultChecked: true,
      },
      {
        type: 'dropdown',
        name: 'styled.dropdown',
        page: 1,
        x: 60,
        y: 285,
        width: 120,
        height: 24,
        options: ['Draft', 'Filed'],
        selected: 'Filed',
        defaultSelected: 'Draft',
        font: 'times-roman',
        fontSize: 10,
      },
      {
        type: 'radio',
        name: 'styled.radio',
        options: [
          { value: 'Low', page: 1, x: 20, y: 250, width: 18, height: 18 },
          { value: 'High', page: 1, x: 20, y: 220, width: 18, height: 18 },
        ],
        selected: 'High',
        defaultSelected: 'Low',
      },
      {
        type: 'option-list',
        name: 'styled.list',
        page: 1,
        x: 80,
        y: 150,
        width: 140,
        height: 90,
        options: ['A', 'B', 'C'],
        selected: ['B'],
        defaultSelected: ['A', 'C'],
        multiselect: true,
        font: 'helvetica',
        fontSize: 11,
      },
    ];

    const output = await splicePdfs([{ bytes: await sourcePdf() }], { formFields: fields });
    const form = (await PDFDocument.load(output)).getForm();

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
    const defaultValues = optionList.acroField.dict.lookupMaybe(PDFName.of('DV'), PDFArray);
    expect(defaultValues && Array.from({ length: defaultValues.size() }, (_, index) => defaultValues.lookup(index, PDFString, PDFHexString).decodeText())).toEqual(['A', 'C']);
    expect(optionList.acroField.getDefaultAppearance()).toMatch(/Helvetica.*11(?:\.0+)?\s+Tf/);
  });
});
