import { a1CoversCell } from './sheets-formula';
import { cloneWorkbook } from './sheets-model';
import {
  cryptoRandomId,
  type ConditionalFormat,
  type PortableWorkbook,
  type SheetCell,
} from './sheets-types';

export function upsertConditionalFormat(book: PortableWorkbook, rule: ConditionalFormat): PortableWorkbook {
  const next = cloneWorkbook(book);
  const id = rule.id || cryptoRandomId();
  next.conditionalFormats = [...next.conditionalFormats.filter((item) => item.id !== id), { ...rule, id }];
  return next;
}

export function removeConditionalFormat(book: PortableWorkbook, id: string): PortableWorkbook {
  const next = cloneWorkbook(book);
  next.conditionalFormats = next.conditionalFormats.filter((item) => item.id !== id);
  return next;
}

export function evaluateConditionalFormat(rule: ConditionalFormat, value: unknown): boolean {
  const text = String(value ?? '');
  if (rule.kind === 'contains') return text.toLocaleLowerCase().includes(rule.argument.toLocaleLowerCase());
  if (rule.kind === 'eq') return text === rule.argument;
  const numeric = typeof value === 'number' ? value : Number(value);
  const bound = Number(rule.argument);
  if (!Number.isFinite(numeric) || !Number.isFinite(bound)) return false;
  if (rule.kind === 'gt') return numeric > bound;
  if (rule.kind === 'lt') return numeric < bound;
  return false;
}

export function applyConditionalFormatPaint(
  book: PortableWorkbook,
  sheetId: string,
  row: number,
  col: number,
  cell: SheetCell | undefined,
): { fill: string; color: string } | null {
  const value = cell?.v ?? null;
  for (const rule of book.conditionalFormats) {
    if (rule.sheetId !== sheetId || !a1CoversCell(rule.a1, row, col)) continue;
    if (evaluateConditionalFormat(rule, value)) return { fill: rule.fill, color: rule.color };
  }
  return null;
}
