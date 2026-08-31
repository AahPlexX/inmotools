import { escapeJsonPointer } from './patch-engine';

export type LatticeNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'unknown';

export interface LatticeGraphNode {
  readonly id: string;
  readonly path: string;
  readonly parentPath?: string;
  readonly key: string;
  readonly type: LatticeNodeType;
  readonly depth: number;
  readonly childCount: number;
  readonly value?: string | number | boolean | null;
  readonly cycle?: boolean;
}

export interface LatticeGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: 'structural';
}

export interface LatticeCrossLink {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: 'foreign-key';
  readonly value: string;
}

export interface LatticeGraphModel {
  readonly nodes: LatticeGraphNode[];
  readonly edges: LatticeGraphEdge[];
  readonly crossLinks: LatticeCrossLink[];
}

const nodeType = (value: unknown): LatticeNodeType => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return typeof value;
  return 'unknown';
};

const childEntries = (value: unknown): Array<[string, unknown]> => {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  if (typeof value === 'object' && value !== null) return Object.entries(value);
  return [];
};

const primitiveValue = (value: unknown): string | number | boolean | null | undefined =>
  value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined;

export const buildGraphModel = (value: unknown, options: { readonly collapsedPaths?: ReadonlySet<string> } = {}): LatticeGraphModel => {
  const collapsed = options.collapsedPaths ?? new Set<string>();
  const nodes: LatticeGraphNode[] = [];
  const edges: LatticeGraphEdge[] = [];
  const activeObjects = new WeakSet<object>();

  const walk = (current: unknown, path: string, parentPath: string | undefined, key: string, depth: number): void => {
    const entries = childEntries(current);
    const objectLike = typeof current === 'object' && current !== null;
    const cycle = objectLike && activeObjects.has(current as object);
    nodes.push({
      id: path || '$',
      path,
      parentPath,
      key,
      type: nodeType(current),
      depth,
      childCount: cycle ? 0 : entries.length,
      value: cycle ? undefined : primitiveValue(current),
      cycle: cycle || undefined,
    });
    if (cycle || collapsed.has(path) || !entries.length) return;
    if (objectLike) activeObjects.add(current as object);
    for (const [childKey, childValue] of entries) {
      const childPath = `${path}/${escapeJsonPointer(childKey)}`;
      edges.push({ id: `edge:${path || '$'}>${childPath}`, source: path, target: childPath, kind: 'structural' });
      walk(childValue, childPath, path, childKey, depth + 1);
    }
    if (objectLike) activeObjects.delete(current as object);
  };

  walk(value, '', undefined, '$', 0);

  const definitions = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.key !== 'id' || node.value === undefined || node.value === null) continue;
    const key = String(node.value);
    definitions.set(key, [...(definitions.get(key) ?? []), node.path]);
  }
  const crossLinks: LatticeCrossLink[] = [];
  for (const node of nodes) {
    if (node.value === undefined || node.value === null || node.key === 'id') continue;
    if (!/(?:_id|Id)$/u.test(node.key)) continue;
    const targets = definitions.get(String(node.value)) ?? [];
    for (const target of targets) {
      if (target === node.path) continue;
      crossLinks.push({ id: `fk:${node.path}>${target}`, source: node.path, target, kind: 'foreign-key', value: String(node.value) });
    }
  }
  return { nodes, edges, crossLinks };
};

export const ancestorClosure = (paths: readonly string[]): Set<string> => {
  const result = new Set<string>();
  for (const path of paths) {
    result.add('');
    if (!path) continue;
    const parts = path.slice(1).split('/');
    for (let index = 1; index <= parts.length; index += 1) result.add(`/${parts.slice(0, index).join('/')}`);
  }
  return result;
};
