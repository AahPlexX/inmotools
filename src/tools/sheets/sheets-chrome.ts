import { a1FromParts, extractRefs, parseA1Ref } from './sheets-formula';
import { PORTABLE_FORMULA_SSOT, UNIVER_FORMULA_SSOT } from './sheets-univer';

const KNOWN_FUNCTIONS = new Set([
  'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'PRODUCT', 'ABS', 'INT', 'SQRT',
  'ROUND', 'IF', 'AND', 'OR', 'NOT', 'CONCAT', 'CONCATENATE', 'LEN', 'UPPER', 'LOWER',
  'TRIM', 'IFERROR', 'ISNUMBER', 'ISTEXT', 'ISBLANK', 'PI', 'TRUE', 'FALSE',
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
): { left: number; top: number; width: number; height: number } {
  const width = Math.min(box.width, Math.max(pad, viewport.width - pad * 2));
  const height = Math.min(box.height, Math.max(pad, viewport.height - pad * 2));
  const left = Math.min(Math.max(pad, box.x), Math.max(pad, viewport.width - width - pad));
  const top = Math.min(Math.max(pad, box.y), Math.max(pad, viewport.height - height - pad));
  return { left, top, width, height };
}
