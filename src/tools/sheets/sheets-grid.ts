import { a1FromParts, parseA1Range } from './sheets-formula';
import { cellKey, type MergeRange, type PortableWorkbook, type SheetCell } from './sheets-types';

export function normalizeRange(range: MergeRange): MergeRange {
  return {
    r1: Math.min(range.r1, range.r2),
    c1: Math.min(range.c1, range.c2),
    r2: Math.max(range.r1, range.r2),
    c2: Math.max(range.c1, range.c2),
  };
}

export function clampIndex(value: number, maxInclusive: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.trunc(value)), Math.max(0, maxInclusive));
}

export function clampSelection(range: MergeRange, rowCount: number, columnCount: number): MergeRange {
  const lastRow = Math.max(0, rowCount - 1);
  const lastCol = Math.max(0, columnCount - 1);
  return {
    r1: clampIndex(range.r1, lastRow),
    c1: clampIndex(range.c1, lastCol),
    r2: clampIndex(range.r2, lastRow),
    c2: clampIndex(range.c2, lastCol),
  };
}

export function moveSelection(
  range: MergeRange,
  dRow: number,
  dCol: number,
  rowCount: number,
  columnCount: number,
  extend: boolean,
): MergeRange {
  if (extend) {
    return clampSelection({ ...range, r2: range.r2 + dRow, c2: range.c2 + dCol }, rowCount, columnCount);
  }
  const next = clampSelection({
    r1: range.r1 + dRow,
    c1: range.c1 + dCol,
    r2: range.r1 + dRow,
    c2: range.c1 + dCol,
  }, rowCount, columnCount);
  return next;
}

export function mergeCovering(merges: MergeRange[], row: number, col: number): MergeRange | null {
  return merges.find((merge) => {
    const bounds = normalizeRange(merge);
    return row >= bounds.r1 && row <= bounds.r2 && col >= bounds.c1 && col <= bounds.c2;
  }) ?? null;
}

export type VisibleMergePaint =
  | { kind: 'cell' }
  | { kind: 'skip' }
  | { kind: 'anchor'; rowSpan: number; colSpan: number };

export function visibleMergePaint(
  merges: MergeRange[],
  row: number,
  col: number,
  visibleRows: number[],
  visibleCols: number[],
): VisibleMergePaint {
  const merge = mergeCovering(merges, row, col);
  if (!merge) return { kind: 'cell' };
  const bounds = normalizeRange(merge);
  const visRows = visibleRows.filter((item) => item >= bounds.r1 && item <= bounds.r2);
  const visCols = visibleCols.filter((item) => item >= bounds.c1 && item <= bounds.c2);
  if (visRows[0] === row && visCols[0] === col) {
    return { kind: 'anchor', rowSpan: Math.max(1, visRows.length), colSpan: Math.max(1, visCols.length) };
  }
  return { kind: 'skip' };
}

export function windowedIndices(
  count: number,
  start: number,
  limit: number,
  hidden: number[],
  frozenCount: number,
): number[] {
  const hiddenSet = new Set(hidden);
  const frozen: number[] = [];
  const cap = Math.max(0, Math.min(frozenCount, count));
  for (let index = 0; index < cap; index += 1) {
    if (!hiddenSet.has(index)) frozen.push(index);
  }
  const body: number[] = [];
  for (let index = Math.max(start, cap); body.length < limit && index < count; index += 1) {
    if (!hiddenSet.has(index)) body.push(index);
  }
  return [...frozen, ...body];
}

export function selectionA1(range: MergeRange): string {
  const start = a1FromParts(range.r1, range.c1);
  const end = a1FromParts(range.r2, range.c2);
  return start === end ? start : `${start}:${end}`;
}

export function rangeToTsv(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  label: (cell: SheetCell | undefined) => string,
): string {
  const sheet = book.sheets.find((item) => item.id === sheetId);
  const bounds = normalizeRange(range);
  const lines: string[] = [];
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    const cells: string[] = [];
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      cells.push(label(sheet?.cells[cellKey(row, col)]));
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

export function clearRange(book: PortableWorkbook, sheetId: string, range: MergeRange): PortableWorkbook {
  const next = structuredClone(book);
  const sheet = next.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  const bounds = normalizeRange(range);
  for (let row = bounds.r1; row <= bounds.r2; row += 1) {
    for (let col = bounds.c1; col <= bounds.c2; col += 1) {
      const key = cellKey(row, col);
      const current = sheet.cells[key];
      if (!current) continue;
      const cleared = { ...current, v: null, f: null };
      if (!cleared.note && !cleared.hyperlink && !cleared.z && !cleared.s) delete sheet.cells[key];
      else sheet.cells[key] = cleared;
    }
  }
  return next;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findReplaceInSheet(
  book: PortableWorkbook,
  sheetId: string,
  find: string,
  replace: string,
  doReplace: boolean,
): { next: PortableWorkbook; hits: number } {
  const needle = find.trim();
  if (!needle) return { next: book, hits: 0 };
  const sheet = book.sheets.find((item) => item.id === sheetId);
  if (!sheet) return { next: book, hits: 0 };
  const matcher = new RegExp(escapeRegExp(needle), 'gi');
  const next = structuredClone(book);
  const target = next.sheets.find((item) => item.id === sheetId);
  if (!target) return { next: book, hits: 0 };
  let hits = 0;
  for (const [key, cell] of Object.entries(target.cells)) {
    const hay = `${cell.v ?? ''} ${cell.f ?? ''}`;
    matcher.lastIndex = 0;
    if (!matcher.test(hay)) continue;
    hits += 1;
    if (!doReplace) continue;
    const patch: SheetCell = { ...cell };
    if (typeof cell.v === 'string') patch.v = cell.v.replace(new RegExp(escapeRegExp(needle), 'gi'), replace);
    if (typeof cell.f === 'string' && cell.f) patch.f = cell.f.replace(new RegExp(escapeRegExp(needle), 'gi'), replace);
    target.cells[key] = patch;
  }
  return { next, hits };
}

export function safeHyperlink(href: string | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('#') && !/^#?\s*javascript:/i.test(trimmed)) return trimmed;
  return null;
}

export function toArgb(color: string): string {
  const hex = color.replace('#', '').trim();
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `FF${hex.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const [red, green, blue] = hex.split('');
    return `FF${red}${red}${green}${green}${blue}${blue}`.toUpperCase();
  }
  return 'FF111827';
}

export function rewriteA1ForAxis(a1: string, axis: 'row' | 'col', at: number, delta: number): string | null {
  const range = parseA1Range(a1);
  if (!range) return a1;
  const start = axis === 'row' ? range.r1 : range.c1;
  const end = axis === 'row' ? range.r2 : range.c2;
  if (delta < 0 && start >= at && end < at - delta) return null;
  const nextStart = start >= at ? start + delta : start;
  const nextEnd = end >= at ? end + delta : end;
  if (nextStart < 0 || nextEnd < nextStart) return null;
  const next = axis === 'row'
    ? { ...range, r1: nextStart, r2: nextEnd }
    : { ...range, c1: nextStart, c2: nextEnd };
  const startA1 = a1FromParts(next.r1, next.c1);
  const endA1 = a1FromParts(next.r2, next.c2);
  return startA1 === endA1 ? startA1 : `${startA1}:${endA1}`;
}

export function shiftIndex(index: number, at: number, delta: number): number | null {
  if (delta < 0 && index >= at && index < at - delta) return null;
  const next = index >= at ? index + delta : index;
  return next < 0 ? null : next;
}

export function shiftHidden(list: number[], at: number, delta: number): number[] {
  return [...new Set(list.flatMap((index) => {
    const next = shiftIndex(index, at, delta);
    return next === null ? [] : [next];
  }))].sort((left, right) => left - right);
}

export function shiftSizeMap(map: Record<string, number>, at: number, delta: number): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    const shifted = shiftIndex(Number(key), at, delta);
    if (shifted === null) continue;
    next[String(shifted)] = value;
  }
  return next;
}

export function applyResizeToSelection(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  axis: 'row' | 'col',
  size: number,
): PortableWorkbook {
  const bounds = normalizeRange(range);
  const sheet = book.sheets.find((item) => item.id === sheetId);
  if (!sheet) return book;
  const next = structuredClone(book);
  const target = next.sheets.find((item) => item.id === sheetId);
  if (!target) return book;
  if (axis === 'col') {
    const width = Math.min(360, Math.max(28, size));
    for (let col = bounds.c1; col <= bounds.c2; col += 1) target.columnWidths[String(col)] = width;
  } else {
    const height = Math.min(160, Math.max(18, size));
    for (let row = bounds.r1; row <= bounds.r2; row += 1) target.rowHeights[String(row)] = height;
  }
  return next;
}

export function frozenOffset(index: number, frozenCount: number, headerSize: number, itemSize: number): string | undefined {
  if (index < 0 || index >= frozenCount) return undefined;
  return `${headerSize + index * itemSize}px`;
}
