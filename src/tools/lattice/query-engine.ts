import { JSONPath } from 'jsonpath-plus';
import { ancestorClosure, buildGraphModel } from './graph-engine';
import { getPointerValue } from './patch-engine';
import type { JsonValue } from './format-engine';

export interface JsonTreeRow {
  readonly path: string;
  readonly parent_path: string | null;
  readonly key: string;
  readonly type: string;
  readonly value_text: string | null;
  readonly value_json: string;
  readonly depth: number;
}

const printable = (value: unknown): string | null => value === null ? 'null' : ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : null;

export const buildJsonTreeRows = (value: JsonValue): JsonTreeRow[] => {
  const graph = buildGraphModel(value);
  return graph.nodes.map((node) => {
    const current = getPointerValue(value, node.path);
    return {
      path: node.path,
      parent_path: node.parentPath ?? null,
      key: node.key,
      type: node.type,
      value_text: printable(current),
      value_json: JSON.stringify(current),
      depth: node.depth,
    };
  });
};

export const selectJsonPathPointers = (value: JsonValue, path: string): string[] => {
  const result = JSONPath({ path, json: value, resultType: 'pointer', wrap: true }) as unknown[];
  return [...new Set(result.map((item) => String(item) === '/' ? '' : String(item)))].sort();
};

export const slicePathsWithAncestors = (paths: readonly string[]): Set<string> => ancestorClosure(paths);
