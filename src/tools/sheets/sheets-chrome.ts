import { a1FromParts, extractRefs, parseA1Ref } from './sheets-formula';
import { formulaJsFunctionNames } from './sheets-formula-js';
import { FORMULA_CATALOG } from './sheets-parity';
import { PORTABLE_FORMULA_SSOT, UNIVER_FORMULA_SSOT } from './sheets-univer';

const KNOWN_FUNCTIONS = new Set([
  ...FORMULA_CATALOG.map((item) => item.name),
  ...formulaJsFunctionNames(),
]);

export function resolveFormulaSsot(
  engine: 'univer' | 'fallback',
  mounted: boolean,
): typeof UNIVER_FORMULA_SSOT | typeof PORTABLE_FORMULA_SSOT {
  return engine === 'univer' && mounted ? UNIVER_FORMULA_SSOT : PORTABLE_FORMULA_SSOT;
}

export function describeFormula(formula: string): { summary: string; refs: string[]; trigger: 'focus-or-tap' } {
  const body = formula.startsWith('=') ? formula.slice(1) : formula;
  const functionName = /^([A-Za-z]+)\(/.exec(body)?.[1] ?? 'expression';
  const refs = new Set<string>();
  for (const ref of extractRefs(formula)) {
    refs.add(a1FromParts(ref.row, ref.col, ref.colAbs, ref.rowAbs, ref.sheetName));
  }
  for (const token of body.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []) {
    if (KNOWN_FUNCTIONS.has(token.toUpperCase()) || parseA1Ref(token)) continue;
    refs.add(token);
  }
  const list = [...refs];
  const summary = list.length
    ? `${functionName} uses ${list.join(', ')}`
    : `${functionName} has no cell or named-range refs`;
  return { summary, refs: list, trigger: 'focus-or-tap' };
}

export function clampPopupBox(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  pad = 8,
): { left: number; top: number; width: number; height: number; flipped: boolean } {
  const width = Math.min(box.width, Math.max(pad, viewport.width - pad * 2));
  const height = Math.min(box.height, Math.max(pad, viewport.height - pad * 2));
  const left = Math.min(Math.max(pad, box.x), Math.max(pad, viewport.width - width - pad));
  const roomBelow = viewport.height - pad - box.y;
  const flipped = roomBelow < height && box.y - height >= pad;
  const preferredTop = flipped ? box.y - height : box.y;
  const top = Math.min(Math.max(pad, preferredTop), Math.max(pad, viewport.height - height - pad));
  return { left, top, width, height, flipped };
}

export type GridKeyIntent = 'typeover' | 'commit' | 'cancel' | 'move' | 'ignore';

export function isPrintableTypeoverKey(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1;
}

export function gridKeyIntent(
  event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
  editing: boolean,
): GridKeyIntent {
  if (event.key === 'Escape') return 'cancel';
  if (event.key === 'Enter') return 'commit';
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    return editing ? 'ignore' : 'move';
  }
  if (event.key === 'Backspace' && editing) return 'typeover';
  if (isPrintableTypeoverKey(event)) return 'typeover';
  return 'ignore';
}

export function applyGridTypeover(formula: string, editing: boolean, key: string): { formula: string; editing: true } {
  if (key === 'Backspace') {
    return { formula: editing ? formula.slice(0, -1) : '', editing: true };
  }
  if (!editing) return { formula: key, editing: true };
  return { formula: `${formula}${key}`, editing: true };
}

export function shouldDismissSheetsOverlays(key: string): boolean {
  return key === 'Escape';
}

export function gridNavBlockedByTyping(
  target: { id?: string; tagName?: string; closest?: (selector: string) => { id?: string } | null } | null,
  gridOwnsKeys: boolean,
  formulaBarId = 'tsw-formula',
): boolean {
  if (!target) return false;
  const field = typeof target.closest === 'function'
    ? target.closest('input, textarea, select')
    : /^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName ?? '')
      ? target
      : null;
  if (!field) return false;
  if (gridOwnsKeys && field.id === formulaBarId) return false;
  return true;
}
