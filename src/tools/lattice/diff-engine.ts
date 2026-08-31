import type { JsonValue } from './format-engine';

export type StructuralDiffChange =
  | { readonly kind: 'insert'; readonly path: string; readonly after: JsonValue }
  | { readonly kind: 'delete'; readonly path: string; readonly before: JsonValue }
  | { readonly kind: 'modify'; readonly path: string; readonly before: JsonValue; readonly after: JsonValue }
  | { readonly kind: 'move'; readonly from: string; readonly path: string; readonly before: JsonValue; readonly after: JsonValue };

export interface StructuralDiffResult { readonly changes: StructuralDiffChange[]; }

const isObject = (value: JsonValue): value is { [key: string]: JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stableValue = (value: JsonValue): string => {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

const childPath = (path: string, key: string): string => `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;

export const diffStructures = (before: JsonValue, after: JsonValue): StructuralDiffResult => {
  const raw: StructuralDiffChange[] = [];
  const walk = (left: JsonValue, right: JsonValue, path: string): void => {
    if (stableValue(left) === stableValue(right)) return;
    if (isObject(left) && isObject(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        const nextPath = childPath(path, key);
        if (!(key in left)) raw.push({ kind: 'insert', path: nextPath, after: structuredClone(right[key]) });
        else if (!(key in right)) raw.push({ kind: 'delete', path: nextPath, before: structuredClone(left[key]) });
        else walk(left[key], right[key], nextPath);
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        const nextPath = childPath(path, String(index));
        if (index >= left.length) raw.push({ kind: 'insert', path: nextPath, after: structuredClone(right[index]) });
        else if (index >= right.length) raw.push({ kind: 'delete', path: nextPath, before: structuredClone(left[index]) });
        else walk(left[index], right[index], nextPath);
      }
      return;
    }
    raw.push({ kind: 'modify', path, before: structuredClone(left), after: structuredClone(right) });
  };
  walk(before, after, '');

  const deleted = new Map<string, number[]>();
  const inserted = new Map<string, number[]>();
  raw.forEach((change, index) => {
    if (change.kind === 'delete') { const key = stableValue(change.before); deleted.set(key, [...(deleted.get(key) ?? []), index]); }
    if (change.kind === 'insert') { const key = stableValue(change.after); inserted.set(key, [...(inserted.get(key) ?? []), index]); }
  });
  const consumed = new Set<number>();
  const moves: StructuralDiffChange[] = [];
  for (const [fingerprint, deleteIndexes] of deleted) {
    const insertIndexes = inserted.get(fingerprint) ?? [];
    if (deleteIndexes.length !== 1 || insertIndexes.length !== 1) continue;
    const fromChange = raw[deleteIndexes[0]];
    const toChange = raw[insertIndexes[0]];
    if (fromChange.kind !== 'delete' || toChange.kind !== 'insert') continue;
    consumed.add(deleteIndexes[0]); consumed.add(insertIndexes[0]);
    moves.push({ kind: 'move', from: fromChange.path, path: toChange.path, before: fromChange.before, after: toChange.after });
  }
  const changes = [...raw.filter((_, index) => !consumed.has(index)), ...moves]
    .sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
  return { changes };
};
