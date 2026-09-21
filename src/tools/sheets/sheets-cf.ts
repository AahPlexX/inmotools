import { a1CoversCell } from './sheets-formula';
import { cloneWorkbook } from './sheets-model';
import { colorScaleFill, colorScaleRangeStats, hexToRgb } from './sheets-parity';
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
  if (rule.kind === 'color-scale') {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric);
  }
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
    if (rule.kind === 'color-scale') {
      const numeric = typeof value === 'number' ? value : Number(value);
      const stats = colorScaleRangeStats(book, sheetId, rule.a1);
      if (!Number.isFinite(numeric) || !stats) continue;
      const [from, to] = parseColorScaleStops(rule.argument, rule.fill, rule.color);
      const fill = colorScaleFill(numeric, stats.min, stats.max, from, to);
      const ink = relativeLuminance(fill) < 0.4 ? '#ffffff' : '#111827';
      return { fill, color: ink };
    }
    if (evaluateConditionalFormat(rule, value)) return { fill: rule.fill, color: rule.color };
  }
  return null;
}

function parseColorScaleStops(argument: string, fill: string, color: string): [string, string] {
  const parts = argument.split(',').map((item) => item.trim()).filter((item) => item.startsWith('#'));
  return [parts[0] || fill || '#f0fdf4', parts[1] || color || '#14532d'];
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const next = value / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
