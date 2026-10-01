import {
  PDFArray,
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFString,
  PDFTextField,
} from 'pdf-lib';

export type PdfFormFieldInspectionType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'option-list'
  | 'button'
  | 'signature'
  | 'unknown';

export type PdfFormFieldInspectionValue = string | string[] | boolean;

export interface PdfFormFieldInspection {
  name: string;
  type: PdfFormFieldInspectionType;
  pages: number[];
  readOnly: boolean;
  required: boolean;
  value?: PdfFormFieldInspectionValue;
  defaultValue?: PdfFormFieldInspectionValue;
}

type PdfLibField = ReturnType<ReturnType<PDFDocument['getForm']>['getFields']>[number];

function fieldType(field: PdfLibField): PdfFormFieldInspectionType {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFOptionList) return 'option-list';
  if (field instanceof PDFButton) return 'button';
  if (field instanceof PDFSignature) return 'signature';
  return 'unknown';
}

function widgetPages(document: PDFDocument, field: PdfLibField): number[] {
  const pages = document.getPages();
  const pageNumbers = new Set<number>();

  for (const widget of field.acroField.getWidgets()) {
    const pageRef = widget.P();
    let pageIndex = pageRef ? pages.findIndex((page) => page.ref === pageRef) : -1;

    if (pageIndex < 0) {
      const widgetRef = document.context.getObjectRef(widget.dict);
      const page = widgetRef ? document.findPageForAnnotationRef(widgetRef) : undefined;
      if (page) pageIndex = pages.indexOf(page);
    }

    if (pageIndex >= 0) pageNumbers.add(pageIndex + 1);
  }

  return [...pageNumbers].sort((left, right) => left - right);
}

function decodeScalar(value: unknown): string | undefined {
  if (value instanceof PDFString || value instanceof PDFHexString || value instanceof PDFName) return value.decodeText();
  return undefined;
}

function decodeStringArray(value: unknown): string[] | undefined {
  if (value instanceof PDFArray) {
    const values: string[] = [];
    for (let index = 0; index < value.size(); index += 1) {
      const decoded = decodeScalar(value.lookup(index));
      if (decoded !== undefined) values.push(decoded);
    }
    return values.length ? values : undefined;
  }
  const scalar = decodeScalar(value);
  return scalar === undefined ? undefined : [scalar];
}

function rawDefault(field: PdfLibField): unknown {
  return field.acroField.dict.lookup(PDFName.of('DV'));
}

function currentValue(field: PdfLibField): PdfFormFieldInspectionValue | undefined {
  if (field instanceof PDFTextField) return field.getText();
  if (field instanceof PDFCheckBox) return field.isChecked();
  if (field instanceof PDFRadioGroup) return field.getSelected();
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) return field.getSelected();
  return undefined;
}

function defaultValue(field: PdfLibField): PdfFormFieldInspectionValue | undefined {
  const raw = rawDefault(field);
  if (raw === undefined) return undefined;

  if (field instanceof PDFTextField) return decodeScalar(raw);

  if (field instanceof PDFCheckBox) {
    if (!(raw instanceof PDFName)) return undefined;
    const onValue = field.acroField.getOnValue();
    return Boolean(onValue && raw.decodeText() === onValue.decodeText());
  }

  if (field instanceof PDFRadioGroup) {
    if (!(raw instanceof PDFName)) return undefined;
    const encoded = raw.decodeText();
    const onValues = field.acroField.getOnValues();
    const index = onValues.findIndex((value) => value.decodeText() === encoded);
    return index >= 0 ? field.getOptions()[index] : encoded;
  }

  if (field instanceof PDFDropdown || field instanceof PDFOptionList) return decodeStringArray(raw);
  return decodeScalar(raw);
}

export function inspectDocumentFormFields(document: PDFDocument): PdfFormFieldInspection[] {
  const fields = document.getForm().getFields();
  return fields.map((field) => {
    const inspection: PdfFormFieldInspection = {
      name: field.getName(),
      type: fieldType(field),
      pages: widgetPages(document, field),
      readOnly: field.isReadOnly(),
      required: field.isRequired(),
    };
    const value = currentValue(field);
    const resetValue = defaultValue(field);
    if (value !== undefined) inspection.value = value;
    if (resetValue !== undefined) inspection.defaultValue = resetValue;
    return inspection;
  });
}

export async function inspectPdfFormFields(bytes: Uint8Array): Promise<PdfFormFieldInspection[]> {
  const document = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  return inspectDocumentFormFields(document);
}
