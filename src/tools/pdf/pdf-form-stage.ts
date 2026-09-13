import type { PdfFormFieldDefinition, PdfRadioOptionDefinition } from './pdf-engine';

export type PdfFormAuthoringType = PdfFormFieldDefinition['type'];

export type PdfFormAuthoringDraft = {
  type: PdfFormAuthoringType;
  name: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  readOnly: boolean;
  value: string;
  multiline: boolean;
  checked: boolean;
  optionsText: string;
  selectedText: string;
  multiselect: boolean;
  radioGap: number;
};

export type PdfOutputPageSize = {
  page: number;
  width: number;
  height: number;
  label: string;
};

export const EMPTY_FORM_DRAFT: PdfFormAuthoringDraft = {
  type: 'text',
  name: '',
  page: 1,
  x: 20,
  y: 120,
  width: 150,
  height: 24,
  required: false,
  readOnly: false,
  value: '',
  multiline: false,
  checked: false,
  optionsText: 'Option 1\nOption 2',
  selectedText: '',
  multiselect: false,
  radioGap: 28,
};

function optionLines(value: string): string[] {
  return value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

function uniqueOptions(value: string, label: string): string[] {
  const options = optionLines(value);
  if (!options.length) throw new Error(`${label} needs at least one option.`);
  if (new Set(options).size !== options.length) throw new Error(`${label} options must be unique.`);
  return options;
}

function commonFlags(draft: PdfFormAuthoringDraft) {
  return {
    name: draft.name.trim(),
    required: draft.required || undefined,
    readOnly: draft.readOnly || undefined,
  };
}

function positioned(draft: PdfFormAuthoringDraft) {
  return {
    ...commonFlags(draft),
    page: draft.page,
    x: draft.x,
    y: draft.y,
    width: draft.width,
    height: draft.height,
  };
}

export function formFieldFromDraft(draft: PdfFormAuthoringDraft): PdfFormFieldDefinition {
  const name = draft.name.trim();
  if (!name) throw new Error('Field name is required.');

  if (draft.type === 'text') {
    return {
      ...positioned(draft),
      type: 'text',
      value: draft.value || undefined,
      multiline: draft.multiline || undefined,
    };
  }
  if (draft.type === 'checkbox') {
    return { ...positioned(draft), type: 'checkbox', checked: draft.checked || undefined };
  }
  if (draft.type === 'dropdown') {
    const options = uniqueOptions(draft.optionsText, 'Dropdown');
    const selected = draft.selectedText.trim();
    if (selected && !options.includes(selected)) throw new Error('Dropdown selection must exactly match one declared option.');
    return { ...positioned(draft), type: 'dropdown', options, selected: selected || undefined };
  }
  if (draft.type === 'option-list') {
    const options = uniqueOptions(draft.optionsText, 'Option list');
    const selected = optionLines(draft.selectedText);
    if (!draft.multiselect && selected.length > 1) throw new Error('Enable multiselect before choosing more than one option-list value.');
    if (selected.some((value) => !options.includes(value))) throw new Error('Every option-list selection must exactly match a declared option.');
    return {
      ...positioned(draft),
      type: 'option-list',
      options,
      selected: selected.length ? selected : undefined,
      multiselect: draft.multiselect || undefined,
    };
  }

  const options = uniqueOptions(draft.optionsText, 'Radio group');
  if (!Number.isFinite(draft.radioGap) || draft.radioGap <= 0) throw new Error('Radio option spacing must be a positive number.');
  const radioOptions: PdfRadioOptionDefinition[] = options.map((value, index) => ({
    value,
    page: draft.page,
    x: draft.x,
    y: draft.y - index * draft.radioGap,
    width: draft.width,
    height: draft.height,
  }));
  const selected = draft.selectedText.trim();
  if (selected && !options.includes(selected)) throw new Error('Radio selection must exactly match one declared option.');
  return { ...commonFlags(draft), type: 'radio', options: radioOptions, selected: selected || undefined };
}

function validateGeometry(pageSizes: PdfOutputPageSize[], label: string, pageNumber: number, x: number, y: number, width: number, height: number): string {
  const page = pageSizes[pageNumber - 1];
  if (!page || page.page !== pageNumber) return `${label} targets output page ${pageNumber}, which is no longer available.`;
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0) return `${label} needs finite non-negative coordinates and positive width/height.`;
  if (x + width > page.width || y + height > page.height) return `${label} extends outside output page ${pageNumber}.`;
  return '';
}

export function stagedFormFieldError(fields: PdfFormFieldDefinition[], pageSizes: PdfOutputPageSize[]): string {
  const names = new Set<string>();
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) return 'A staged form field has a blank name.';
    if (names.has(name)) return `Duplicate staged form field name: ${name}.`;
    names.add(name);

    if (field.type === 'radio') {
      const options = field.options.map((option) => option.value.trim());
      if (!options.length || options.some((option) => !option) || new Set(options).size !== options.length) return `Radio group ${name} needs unique nonblank options.`;
      if (field.selected !== undefined && !options.includes(field.selected)) return `Radio group ${name} has a selection outside its declared options.`;
      for (const option of field.options) {
        const error = validateGeometry(pageSizes, `Radio option ${option.value} in ${name}`, option.page, option.x, option.y, option.width, option.height);
        if (error) return error;
      }
      continue;
    }

    const error = validateGeometry(pageSizes, `Form field ${name}`, field.page, field.x, field.y, field.width, field.height);
    if (error) return error;
    if (field.type === 'dropdown' || field.type === 'option-list') {
      if (!field.options.length || field.options.some((option) => !option.trim()) || new Set(field.options.map((option) => option.trim())).size !== field.options.length) return `${field.type === 'dropdown' ? 'Dropdown' : 'Option list'} ${name} needs unique nonblank options.`;
    }
    if (field.type === 'dropdown' && field.selected !== undefined && !field.options.includes(field.selected)) return `Dropdown ${name} has a selection outside its declared options.`;
    if (field.type === 'option-list') {
      const selected = field.selected ?? [];
      if (!field.multiselect && selected.length > 1) return `Option list ${name} must enable multiselect before selecting multiple values.`;
      if (selected.some((value) => !field.options.includes(value))) return `Option list ${name} has a selection outside its declared options.`;
    }
  }
  return '';
}

export function formFieldSummary(field: PdfFormFieldDefinition): string {
  if (field.type === 'radio') return `Radio group · ${field.options.length} options`;
  if (field.type === 'option-list') return `Option list · ${field.options.length} options${field.multiselect ? ' · multiselect' : ''}`;
  if (field.type === 'dropdown') return `Dropdown · ${field.options.length} options`;
  if (field.type === 'checkbox') return `Checkbox${field.checked ? ' · checked' : ''}`;
  return `Text field${field.multiline ? ' · multiline' : ''}`;
}
