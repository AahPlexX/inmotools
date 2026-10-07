// Flattens a parsed mdast tree into the visible rows of the syntax-tree inspector.
//
// Only expanded branches are walked, so the cost follows what is on screen rather than the
// document size. The row count is capped as a last resort for pathological documents.

export const AST_ROOT_ID = 'r';
export const AST_ROW_CAP = 20000;

export interface AstRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface AstRow {
  readonly id: string;
  readonly level: number;
  readonly type: string;
  readonly detail: string;
  readonly childCount: number;
  readonly expanded: boolean;
  readonly range: AstRange | null;
  readonly position: number;
  readonly siblings: number;
}

export interface AstFlattenResult {
  readonly rows: AstRow[];
  readonly truncated: boolean;
}

interface AstPoint {
  readonly line: number;
  readonly column: number;
}

interface AstNodeShape {
  readonly type: string;
  readonly value?: unknown;
  readonly depth?: unknown;
  readonly lang?: unknown;
  readonly url?: unknown;
  readonly ordered?: unknown;
  readonly children?: readonly AstNodeShape[];
  readonly position?: { readonly start: AstPoint; readonly end: AstPoint };
}

const isPoint = (value: unknown): value is AstPoint =>
  typeof value === 'object' && value !== null
  && typeof (value as Record<string, unknown>).line === 'number'
  && typeof (value as Record<string, unknown>).column === 'number';

export const asAstNode = (value: unknown): AstNodeShape | null =>
  typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).type === 'string'
    ? value as AstNodeShape
    : null;

const snippet = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
};

const describe = (node: AstNodeShape): string => {
  if (node.type === 'heading' && typeof node.depth === 'number') return `h${node.depth}`;
  if (node.type === 'list') return node.ordered === true ? 'ordered' : 'bulleted';
  if (node.type === 'code') {
    const lang = typeof node.lang === 'string' && node.lang ? `${node.lang} ` : '';
    return `${lang}${typeof node.value === 'string' ? snippet(node.value) : ''}`.trim();
  }
  if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') && typeof node.url === 'string') return snippet(node.url);
  return typeof node.value === 'string' ? `“${snippet(node.value)}”` : '';
};

export const astRangeOf = (node: AstNodeShape, lineOffset: number): AstRange | null => {
  const position = node.position;
  if (!position || !isPoint(position.start) || !isPoint(position.end)) return null;
  return {
    startLine: position.start.line + lineOffset,
    startColumn: position.start.column,
    endLine: position.end.line + lineOffset,
    endColumn: position.end.column,
  };
};

const childPathId = (parent: string, index: number): string => `${parent}.${index}`;

export const parentAstId = (id: string): string | null => {
  const cut = id.lastIndexOf('.');
  return cut < 0 ? null : id.slice(0, cut);
};

// Resolves an id such as "r.2.0" against the tree, or null once the document no longer has it.
export const findAstNode = (tree: unknown, id: string): AstNodeShape | null => {
  let node = asAstNode(tree);
  const parts = id.split('.');
  if (parts[0] !== AST_ROOT_ID) return null;
  for (const part of parts.slice(1)) {
    const index = Number(part);
    const next: AstNodeShape | undefined = node?.children?.[index];
    if (!node || !Number.isInteger(index) || !next) return null;
    node = next;
  }
  return node;
};

export const flattenAst = (
  tree: unknown,
  expanded: ReadonlySet<string>,
  lineOffset: number,
  cap: number = AST_ROW_CAP,
): AstFlattenResult => {
  const root = asAstNode(tree);
  const rows: AstRow[] = [];
  if (!root) return { rows, truncated: false };
  let truncated = false;
  const stack: Array<{ node: AstNodeShape; id: string; level: number; position: number; siblings: number }> = [
    { node: root, id: AST_ROOT_ID, level: 1, position: 1, siblings: 1 },
  ];
  while (stack.length) {
    if (rows.length >= cap) { truncated = true; break; }
    const { node, id, level, position, siblings } = stack.pop()!;
    const children = node.children ?? [];
    const open = children.length > 0 && expanded.has(id);
    rows.push({
      id,
      level,
      type: node.type,
      detail: describe(node),
      childCount: children.length,
      expanded: open,
      range: astRangeOf(node, lineOffset),
      position,
      siblings,
    });
    if (open) {
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: children[index], id: childPathId(id, index), level: level + 1, position: index + 1, siblings: children.length });
      }
    }
  }
  return { rows, truncated };
};
