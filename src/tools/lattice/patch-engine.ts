import type { JsonValue } from './format-engine';

export type JsonPatchOperation =
  | { readonly op: 'add'; readonly path: string; readonly value: JsonValue }
  | { readonly op: 'remove'; readonly path: string }
  | { readonly op: 'replace'; readonly path: string; readonly value: JsonValue }
  | { readonly op: 'move'; readonly from: string; readonly path: string }
  | { readonly op: 'copy'; readonly from: string; readonly path: string }
  | { readonly op: 'test'; readonly path: string; readonly value: JsonValue };

export const escapeJsonPointer = (segment: string): string => segment.replaceAll('~', '~0').replaceAll('/', '~1');
export const unescapeJsonPointer = (segment: string): string => segment.replaceAll('~1', '/').replaceAll('~0', '~');

const pointerParts = (pointer: string): string[] => {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON Pointer: ${pointer}`);
  return pointer.slice(1).split('/').map(unescapeJsonPointer);
};

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseArrayIndex = (segment: string, length: number, allowAppend = false): number => {
  if (allowAppend && segment === '-') return length;
  if (!/^(0|[1-9]\d*)$/.test(segment)) throw new Error(`Invalid array index: ${segment}`);
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index < 0) throw new Error(`Invalid array index: ${segment}`);
  return index;
};

export const getPointerValue = (document: JsonValue | unknown, pointer: string): unknown => {
  let current: unknown = document;
  for (const segment of pointerParts(pointer)) {
    if (Array.isArray(current)) {
      const index = parseArrayIndex(segment, current.length);
      if (index >= current.length) throw new Error(`JSON Pointer does not exist: ${pointer}`);
      current = current[index];
      continue;
    }
    if (typeof current === 'object' && current !== null) {
      if (!(segment in current)) throw new Error(`JSON Pointer does not exist: ${pointer}`);
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    throw new Error(`JSON Pointer does not exist: ${pointer}`);
  }
  return current;
};

const resolveParent = (document: JsonValue, pointer: string): { parent: JsonValue; segment: string } => {
  const parts = pointerParts(pointer);
  if (!parts.length) throw new Error('The root pointer has no parent.');
  const segment = parts.at(-1) as string;
  const parentPointer = parts.length === 1 ? '' : `/${parts.slice(0, -1).map(escapeJsonPointer).join('/')}`;
  return { parent: getPointerValue(document, parentPointer) as JsonValue, segment };
};

const deepEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
  }
  return false;
};

const addAt = (document: JsonValue, path: string, value: JsonValue): JsonValue => {
  if (path === '') return structuredClone(value);
  const { parent, segment } = resolveParent(document, path);
  const copied = structuredClone(value);
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(segment, parent.length, true);
    if (index > parent.length) throw new Error(`Add index is outside the array: ${segment}`);
    parent.splice(index, 0, copied);
    return document;
  }
  if (!isRecord(parent)) throw new Error(`Cannot add at non-container path: ${path}`);
  parent[segment] = copied;
  return document;
};

const removeAt = (document: JsonValue, path: string): JsonValue => {
  if (path === '') throw new Error('Removing the entire JSON document is not supported by this workbench.');
  const { parent, segment } = resolveParent(document, path);
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(segment, parent.length);
    if (index >= parent.length) throw new Error(`Remove path does not exist: ${path}`);
    parent.splice(index, 1);
    return document;
  }
  if (!isRecord(parent) || !(segment in parent)) throw new Error(`Remove path does not exist: ${path}`);
  delete parent[segment];
  return document;
};

const replaceAt = (document: JsonValue, path: string, value: JsonValue): JsonValue => {
  if (path === '') return structuredClone(value);
  getPointerValue(document, path);
  const { parent, segment } = resolveParent(document, path);
  const copied = structuredClone(value);
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(segment, parent.length);
    parent[index] = copied;
  } else if (isRecord(parent)) parent[segment] = copied;
  else throw new Error(`Cannot replace at non-container path: ${path}`);
  return document;
};

export const applyJsonPatch = (source: JsonValue, operations: readonly JsonPatchOperation[]) => {
  let document = structuredClone(source);
  const applied: JsonPatchOperation[] = [];
  for (const operation of operations) {
    if (operation.op === 'test') {
      if (!deepEqual(getPointerValue(document, operation.path), operation.value)) throw new Error(`JSON Patch test failed at ${operation.path || '/'}.`);
    } else if (operation.op === 'add') document = addAt(document, operation.path, operation.value);
    else if (operation.op === 'remove') document = removeAt(document, operation.path);
    else if (operation.op === 'replace') document = replaceAt(document, operation.path, operation.value);
    else if (operation.op === 'copy') document = addAt(document, operation.path, structuredClone(getPointerValue(document, operation.from)) as JsonValue);
    else {
      if (operation.path === operation.from || operation.path.startsWith(`${operation.from}/`)) throw new Error('A JSON Patch move target cannot be inside its source.');
      const value = structuredClone(getPointerValue(document, operation.from)) as JsonValue;
      document = removeAt(document, operation.from);
      document = addAt(document, operation.path, value);
    }
    applied.push(structuredClone(operation));
  }
  return { document, applied };
};
