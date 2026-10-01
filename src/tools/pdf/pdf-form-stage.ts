import type {
  PdfFormFieldDefinition,
  PdfFormTextAlignment,
  PdfRadioOptionDefinition,
  PdfStandardFormFont,
} from './pdf-engine';

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
  font: PdfStandardFormFont;
  fontSize: string;
  alignment: PdfFormTextAlignment;
  useDefaultValue: boolean;
  defaultValue: string;
  defaultChecked: boolean;
  defaultSelectedText: string;
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
  font: 'helvetica',
  fontSize: '',
  alignment: 'left',
  useDefaultValue: false,
  defaultValue: '',
  defaultChecked: false,
  defaultSelectedText: '',
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

function optionalFontSize(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Font size must be a positive number when provided.');
  return parsed;
}

function fontProperties(draft: PdfFormAuthoringDraft) {
  return {
    font: draft.font,
    fontSize: optionalFontSize(draft.fontSize),
  };
}

function defaultChoiceValues(draft: PdfFormAuthoringDraft, label: string, options: string[]): string[] | undefined {
  if (!draft.useDefaultValue) return undefined;
  const values = optionLines(draft.defaultSelectedText);
  if (!values.length) throw new Error(`${label} reset/default value is enabled, so choose at least one declared option.`);
  if (values.some((value) => !options.includes(value))) throw new Error(`${label} reset/default value must exactly match declared options.`);
  return values;
}

export function formFieldFromDraft(draft: PdfFormAuthoringDraft): PdfFormFieldDefinition {
  const name = draft.name.trim();
  if (!name) throw new Error('Field name is required.');

  if (draft.type === 'text') {
    return {
      ...positioned(draft),
      ...fontProperties(draft),
      type: 'text',
      value: draft.value || undefined,
      defaultValue: draft.useDefaultValue ? draft.defaultValue : undefined,
      multiline: draft.multiline || undefined,
      alignment: draft.alignment,
    };
  }
  if (draft.type === 'checkbox') {
    return {
      ...positioned(draft),
      type: 'checkbox',
      checked: draft.checked || undefined,
      defaultChecked: draft.useDefaultValue ? draft.defaultChecked : undefined,
    };
  }
  if (draft.type === 'dropdown') {
    const options = uniqueOptions(draft.optionsText, 'Dropdown');
    const selected = draft.selectedText.trim();
    if (selected && !options.includes(selected)) throw new Error('Dropdown selection must exactly match one declared option.');
    const defaultSelected = defaultChoiceValues(draft, 'Dropdown', options);
    if (defaultSelected && defaultSelected.length !== 1) throw new Error('Dropdown reset/default value must contain exactly one option.');
    return {
      ...positioned(draft),
      ...fontProperties(draft),
      type: 'dropdown',
      options,
      selected: selected || undefined,
      defaultSelected: defaultSelected?.[0],
    };
  }
  if (draft.type === 'option-list') {
    const options = uniqueOptions(draft.optionsText, 'Option list');
    const selected = optionLines(draft.selectedText);
    const defaultSelected = defaultChoiceValues(draft, 'Option list', options);
    if (!draft.multiselect && selected.length > 1) throw new Error('Enable multiselect before choosing more than one option-list value.');
    if (!draft.multiselect && (defaultSelected?.length ?? 0) > 1) throw new Error('Enable multiselect before assigning more than one option-list reset/default value.');
    if (selected.some((value) => !options.includes(value))) throw new Error('Every option-list selection must exactly match a declared option.');
    return {
      ...positioned(draft),
      ...fontProperties(draft),
      type: 'option-list',
      options,
      selected: selected.length ? selected : undefined,
      defaultSelected,
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
  const defaultSelected = defaultChoiceValues(draft, 'Radio group', options);
  if (defaultSelected && defaultSelected.length !== 1) throw new Error('Radio reset/default value must contain exactly one option.');
  return {
    ...commonFlags(draft),
    type: 'radio',
    options: radioOptions,
    selected: selected || undefined,
    defaultSelected: defaultSelected?.[0],
  };
}

function validateGeometry(pageSizes: PdfOutputPageSize[], label: string, pageNumber: number, x: number, y: number, width: number, height: number): string {
  const page = pageSizes[pageNumber - 1];
  if (!page || page.page !== pageNumber) return `${label} targets output page ${pageNumber}, which is no longer available.`;
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0) return `${label} needs finite non-negative coordinates and positive width/height.`;
  if (x + width > page.width || y + height > page.height) return `${label} extends outside output page ${pageNumber}.`;
  return '';
}

function fontPropertyError(field: Extract<PdfFormFieldDefinition, { type: 'text' | 'dropdown' | 'option-list' }>): string {
  if (field.fontSize !== undefined && (!Number.isFinite(field.fontSize) || field.fontSize <= 0)) return `Form field ${field.name} has an invalid font size.`;
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
      if (field.defaultSelected !== undefined && !options.includes(field.defaultSelected)) return `Radio group ${name} has a reset/default value outside its declared options.`;
      for (const option of field.options) {
        const error = validateGeometry(pageSizes, `Radio option ${option.value} in ${name}`, option.page, option.x, option.y, option.width, option.height);
        if (error) return error;
      }
      continue;
    }

    const error = validateGeometry(pageSizes, `Form field ${name}`, field.page, field.x, field.y, field.width, field.height);
    if (error) return error;
    if (field.type === 'text') {
      const fontError = fontPropertyError(field);
      if (fontError) return fontError;
    }
    if (field.type === 'dropdown' || field.type === 'option-list') {
      const fontError = fontPropertyError(field);
      if (fontError) return fontError;
      if (!field.options.length || field.options.some((option) => !option.trim()) || new Set(field.options.map((option) => option.trim())).size !== field.options.length) return `${field.type === 'dropdown' ? 'Dropdown' : 'Option list'} ${name} needs unique nonblank options.`;
    }
    if (field.type === 'dropdown') {
      if (field.selected !== undefined && !field.options.includes(field.selected)) return `Dropdown ${name} has a selection outside its declared options.`;
      if (field.defaultSelected !== undefined && !field.options.includes(field.defaultSelected)) return `Dropdown ${name} has a reset/default value outside its declared options.`;
    }
    if (field.type === 'option-list') {
      const selected = field.selected ?? [];
      const defaultSelected = field.defaultSelected ?? [];
      if (!field.multiselect && selected.length > 1) return `Option list ${name} must enable multiselect before selecting multiple values.`;
      if (!field.multiselect && defaultSelected.length > 1) return `Option list ${name} must enable multiselect before assigning multiple reset/default values.`;
      if (selected.some((value) => !field.options.includes(value))) return `Option list ${name} has a selection outside its declared options.`;
      if (defaultSelected.some((value) => !field.options.includes(value))) return `Option list ${name} has a reset/default value outside its declared options.`;
    }
  }
  return '';
}

const fontLabel = (font: PdfStandardFormFont | undefined) => font === 'courier' ? 'Courier' : font === 'times-roman' ? 'Times Roman' : 'Helvetica';

export function formFieldSummary(field: PdfFormFieldDefinition): string {
  if (field.type === 'radio') return `Radio group · ${field.options.length} options${field.defaultSelected !== undefined ? ` · reset ${field.defaultSelected}` : ''}`;
  if (field.type === 'option-list') return `Option list · ${field.options.length} options${field.multiselect ? ' · multiselect' : ''} · ${fontLabel(field.font)}${field.fontSize ? ` ${field.fontSize} pt` : ''}${field.defaultSelected?.length ? ` · reset ${field.defaultSelected.join(', ')}` : ''}`;
  if (field.type === 'dropdown') return `Dropdown · ${field.options.length} options · ${fontLabel(field.font)}${field.fontSize ? ` ${field.fontSize} pt` : ''}${field.defaultSelected !== undefined ? ` · reset ${field.defaultSelected}` : ''}`;
  if (field.type === 'checkbox') return `Checkbox${field.checked ? ' · checked' : ''}${field.defaultChecked !== undefined ? ` · reset ${field.defaultChecked ? 'checked' : 'unchecked'}` : ''}`;
  return `Text field${field.multiline ? ' · multiline' : ''} · ${fontLabel(field.font)}${field.fontSize ? ` ${field.fontSize} pt` : ''} · ${field.alignment ?? 'left'}${field.defaultValue !== undefined ? ' · reset default set' : ''}`;
}
