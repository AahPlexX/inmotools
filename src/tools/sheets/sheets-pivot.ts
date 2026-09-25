import { cellKey } from './sheets-types';
import type { PortableSheet } from './sheets-types';

export type PivotAgg = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface PivotSpec {
  headerRow: number;
  groupCol: number;
  valueCol: number;
  agg: PivotAgg;
}

export interface PivotRow {
  group: string;
  value: number;
}

export interface PivotResult {
  rows: PivotRow[];
  agg: PivotAgg;
  groupHeader: string;
  valueHeader: string;
}

function cellText(sheet: PortableSheet, row: number, col: number): string {
  const cell = sheet.cells[cellKey(row, col)];
  if (!cell) return '';
  if (cell.v === null || cell.v === undefined) return '';
  return String(cell.v);
}

function cellNumber(sheet: PortableSheet, row: number, col: number): number | null {
  const cell = sheet.cells[cellKey(row, col)];
  if (!cell) return null;
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v;
  if (typeof cell.v === 'string' && cell.v.trim() !== '' && Number.isFinite(Number(cell.v))) return Number(cell.v);
  return null;
}

export function pivotSheet(sheet: PortableSheet, spec: PivotSpec): PivotResult {
  const groups = new Map<string, number[]>();
  for (let row = spec.headerRow + 1; row < sheet.rowCount; row += 1) {
    if (sheet.hiddenRows.includes(row)) continue;
    const label = cellText(sheet, row, spec.groupCol).trim();
    const value = cellNumber(sheet, row, spec.valueCol);
    if (!label && value === null) continue;
    const group = label || '(blank)';
    const bucket = groups.get(group) ?? [];
    if (spec.agg === 'count') bucket.push(1);
    else if (value !== null) bucket.push(value);
    groups.set(group, bucket);
  }
  const rows = [...groups.entries()].map(([group, values]) => ({
    group,
    value: aggregate(values, spec.agg),
  })).sort((left, right) => left.group.localeCompare(right.group));
  return {
    rows,
    agg: spec.agg,
    groupHeader: cellText(sheet, spec.headerRow, spec.groupCol) || `Column ${spec.groupCol + 1}`,
    valueHeader: cellText(sheet, spec.headerRow, spec.valueCol) || spec.agg,
  };
}

function aggregate(values: number[], agg: PivotAgg): number {
  if (values.length === 0) return 0;
  if (agg === 'count') return values.length;
  if (agg === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (agg === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (agg === 'min') return Math.min(...values);
  return Math.max(...values);
}
