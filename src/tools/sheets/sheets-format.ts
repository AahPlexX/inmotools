import { setCell } from './sheets-model';
import type { CellPrimitive, MergeRange, PortableWorkbook } from './sheets-types';

export interface NumberFormatOption {
  id: string;
  label: string;
  z: string;
}

export const NUMBER_FORMATS: NumberFormatOption[] = [
  { id: 'general', label: 'General', z: 'General' },
  { id: 'number', label: 'Number', z: '#,##0.00' },
  { id: 'integer', label: 'Integer', z: '#,##0' },
  { id: 'percent', label: 'Percent', z: '0.00%' },
  { id: 'currency', label: 'Currency', z: '$#,##0.00' },
  { id: 'scientific', label: 'Scientific', z: '0.00E+00' },
  { id: 'date', label: 'Date', z: 'yyyy-mm-dd' },
  { id: 'time', label: 'Time', z: 'hh:mm:ss' },
  { id: 'text', label: 'Text', z: '@' },
];

export function formatDisplay(value: CellPrimitive | null | undefined, z?: string): string {
  if (value === null || value === undefined) return '';
  const pattern = z && z !== 'General' ? z : '';
  if (!pattern || pattern === '@') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string' && (pattern === '@' || !Number.isFinite(Number(value)))) return value;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (pattern.includes('%')) {
    const decimals = /\.0+/.exec(pattern)?.[0].length ?? 1;
    return `${(numeric * 100).toFixed(Math.max(0, decimals - 1))}%`;
  }
  if (/e\+/i.test(pattern)) return numeric.toExponential(2).replace('e', 'E').replace('E+', 'E+').replace(/E([+-])(\d)$/, 'E$10$2');
  if (pattern.startsWith('$')) return `$${groupNumber(numeric, countDecimals(pattern))}`;
  if (/yyyy|mm|dd/i.test(pattern)) return formatExcelDate(numeric);
  if (/hh|ss/i.test(pattern)) return formatExcelTime(numeric);
  return groupNumber(numeric, countDecimals(pattern));
}

function countDecimals(pattern: string): number {
  const match = /\.0+/.exec(pattern);
  return match ? match[0].length - 1 : 0;
}

function groupNumber(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction !== undefined ? `${grouped}.${fraction}` : grouped;
}

function excelSerialToDate(serial: number): Date {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
  return new Date(utc);
}

function formatExcelDate(serial: number): string {
  if (serial > 10000 && serial < 1e15 && !Number.isInteger(serial)) {
    const date = new Date(serial);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const date = serial > 20000 && serial < 80000 ? excelSerialToDate(serial) : new Date(serial);
  if (Number.isNaN(date.getTime())) return String(serial);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatExcelTime(serial: number): string {
  const fraction = serial % 1;
  const total = Math.round(Math.abs(fraction) * 86400);
  const hours = String(Math.floor(total / 3600) % 24).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function applyNumberFormat(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  z: string,
): PortableWorkbook {
  let next = book;
  const r1 = Math.min(range.r1, range.r2);
  const r2 = Math.max(range.r1, range.r2);
  const c1 = Math.min(range.c1, range.c2);
  const c2 = Math.max(range.c1, range.c2);
  for (let row = r1; row <= r2; row += 1) {
    for (let col = c1; col <= c2; col += 1) {
      next = setCell(next, sheetId, row, col, { z });
    }
  }
  return next;
}
