import { a1CoversCell } from './sheets-formula';
import { cloneWorkbook } from './sheets-model';
import { cryptoRandomId, type PortableWorkbook, type ValidationRule } from './sheets-types';

export function upsertValidation(book: PortableWorkbook, rule: ValidationRule): PortableWorkbook {
  const next = cloneWorkbook(book);
  const id = rule.id || cryptoRandomId();
  next.validations = [...next.validations.filter((item) => item.id !== id), { ...rule, id }];
  return next;
}

export function removeValidation(book: PortableWorkbook, id: string): PortableWorkbook {
  const next = cloneWorkbook(book);
  next.validations = next.validations.filter((item) => item.id !== id);
  return next;
}

export function validationsForCell(book: PortableWorkbook, sheetId: string, row: number, col: number): ValidationRule[] {
  return book.validations.filter((rule) => rule.sheetId === sheetId && a1CoversCell(rule.a1, row, col));
}

export function listValidationChoices(argument: string): string[] {
  return argument.split(',').map((item) => item.trim()).filter(Boolean);
}

export function listValidationForCell(book: PortableWorkbook, sheetId: string, row: number, col: number): string[] {
  const rule = validationsForCell(book, sheetId, row, col).find((item) => item.kind === 'list');
  return rule ? listValidationChoices(rule.argument) : [];
}

export function enforceValidation(
  book: PortableWorkbook,
  sheetId: string,
  row: number,
  col: number,
  value: unknown,
): { ok: boolean; message: string } {
  for (const rule of validationsForCell(book, sheetId, row, col)) {
    if (!rulePasses(rule, value)) return { ok: false, message: rule.message || 'Value failed validation.' };
  }
  return { ok: true, message: '' };
}

function rulePasses(rule: ValidationRule, value: unknown): boolean {
  if (rule.kind === 'list') {
    const allowed = rule.argument.split(',').map((item) => item.trim()).filter(Boolean);
    return allowed.includes(String(value ?? '').trim());
  }
  if (rule.kind === 'number') {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return false;
    const [min, max] = parseBound(rule.argument, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    return numeric >= min && numeric <= max;
  }
  if (rule.kind === 'text-length') {
    const length = String(value ?? '').length;
    const [min, max] = parseBound(rule.argument, 0, Number.POSITIVE_INFINITY);
    return length >= min && length <= max;
  }
  if (rule.kind === 'custom') {
    const text = String(value ?? '');
    return rule.argument.trim() === '' || text.includes(rule.argument.replace(/^=/, ''));
  }
  return true;
}

function parseBound(argument: string, fallbackMin: number, fallbackMax: number): [number, number] {
  const match = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/.exec(argument.trim());
  if (match) return [Number(match[1]), Number(match[2])];
  const single = Number(argument);
  if (Number.isFinite(single)) return [fallbackMin === Number.NEGATIVE_INFINITY ? single : fallbackMin, single];
  return [fallbackMin, fallbackMax];
}
