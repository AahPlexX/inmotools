import { getCell, setCell } from './sheets-model';
import type { CellStyle, MergeRange, OverflowMode, PortableWorkbook } from './sheets-types';

export function applyStyleToRange(
  book: PortableWorkbook,
  sheetId: string,
  range: MergeRange,
  patch: CellStyle,
): PortableWorkbook {
  let next = book;
  const r1 = Math.min(range.r1, range.r2);
  const r2 = Math.max(range.r1, range.r2);
  const c1 = Math.min(range.c1, range.c2);
  const c2 = Math.max(range.c1, range.c2);
  for (let row = r1; row <= r2; row += 1) {
    for (let col = c1; col <= c2; col += 1) {
      const current = getCell(next, sheetId, row, col)?.s ?? {};
      next = setCell(next, sheetId, row, col, { s: { ...current, ...patch } });
    }
  }
  return next;
}

export function wrapCss(style: CellStyle | undefined): { whiteSpace?: 'normal' | 'nowrap'; overflowWrap?: 'anywhere' } {
  if (!style?.wrap) return { whiteSpace: 'nowrap' };
  return { whiteSpace: 'normal', overflowWrap: 'anywhere' };
}

export function overflowCss(style: CellStyle | undefined): { overflow?: OverflowMode | 'hidden' | 'visible'; textOverflow?: string } {
  if (style?.wrap) return {};
  const mode = style?.overflow ?? 'ellipsis';
  if (mode === 'overflow') return { overflow: 'visible', textOverflow: 'clip' };
  if (mode === 'clip') return { overflow: 'hidden', textOverflow: 'clip' };
  return { overflow: 'hidden', textOverflow: 'ellipsis' };
}
