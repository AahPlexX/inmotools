import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import { AST_ROOT_ID, AST_ROW_CAP, astRangeOf, findAstNode, flattenAst, parentAstId, type AstRange } from './ast-inspector-engine';

const ROW_HEIGHT = 28;
const VIEWPORT_HEIGHT = 280;
const OVERSCAN = 6;

export interface AstInspectorProps {
  readonly tree: unknown;
  readonly lineOffset: number;
  // `reveal` is true when the person chose the node, false when the range only moved with an edit.
  readonly onSelect: (range: AstRange | null, reveal: boolean) => void;
}

const rangeKey = (range: AstRange | null): string =>
  range ? `${range.startLine}:${range.startColumn}-${range.endLine}:${range.endColumn}` : '';

const rangeLabel = (range: AstRange | null): string =>
  range ? `${range.startLine}:${range.startColumn}–${range.endLine}:${range.endColumn}` : 'generated';

export default function AstInspector({ tree, lineOffset, onSelect }: AstInspectorProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([AST_ROOT_ID]));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const emittedKeyRef = useRef('');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const { rows, truncated } = useMemo(() => flattenAst(tree, expanded, lineOffset), [tree, expanded, lineOffset]);

  // An id is a path, so it stays meaningful while the document is edited; it is dropped once the path is gone.
  const activeNode = useMemo(() => activeId ? findAstNode(tree, activeId) : null, [tree, activeId]);
  const activeRange = useMemo(() => activeNode ? astRangeOf(activeNode, lineOffset) : null, [activeNode, lineOffset]);
  const activeKey = rangeKey(activeRange);

  useEffect(() => {
    if (activeId && !activeNode) setActiveId(null);
  }, [activeId, activeNode]);

  useEffect(() => {
    if (activeKey === emittedKeyRef.current) return;
    emittedKeyRef.current = activeKey;
    onSelectRef.current(activeRange, false);
  }, [activeKey, activeRange]);

  useEffect(() => () => onSelectRef.current(null, false), []);

  const activeIndex = activeId ? rows.findIndex((row) => row.id === activeId) : -1;

  const scrollToIndex = useCallback((index: number) => {
    const host = hostRef.current;
    if (!host || index < 0) return;
    const top = index * ROW_HEIGHT;
    if (top < host.scrollTop) host.scrollTop = top;
    else if (top + ROW_HEIGHT > host.scrollTop + host.clientHeight) host.scrollTop = top + ROW_HEIGHT - host.clientHeight;
    setScrollTop(host.scrollTop);
  }, []);

  const choose = useCallback((id: string, index: number) => {
    setActiveId(id);
    const node = findAstNode(tree, id);
    const range = node ? astRangeOf(node, lineOffset) : null;
    emittedKeyRef.current = rangeKey(range);
    onSelectRef.current(range, true);
    scrollToIndex(index);
  }, [tree, lineOffset, scrollToIndex]);

  const setOpen = useCallback((id: string, open: boolean) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!rows.length) return;
    const index = activeIndex < 0 ? 0 : activeIndex;
    const row = rows[index];
    let target = -1;
    switch (event.key) {
      case 'ArrowDown': target = Math.min(index + 1, rows.length - 1); break;
      case 'ArrowUp': target = Math.max(index - 1, 0); break;
      case 'Home': target = 0; break;
      case 'End': target = rows.length - 1; break;
      case 'ArrowRight':
        if (row.childCount > 0 && !row.expanded) setOpen(row.id, true);
        else if (row.expanded) target = index + 1;
        break;
      case 'ArrowLeft':
        if (row.expanded) setOpen(row.id, false);
        else {
          const parent = parentAstId(row.id);
          if (parent) target = rows.findIndex((candidate) => candidate.id === parent);
        }
        break;
      case 'Enter':
      case ' ':
        target = index;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target >= 0 && rows[target]) choose(rows[target].id, target);
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  const visible = rows.slice(first, last);
  const activeDescendant = activeIndex >= 0 && activeIndex >= first && activeIndex < last ? `markdown-ast-${activeId}` : undefined;

  return (
    <div className="markdown-workbench-ast">
      <div
        ref={hostRef}
        className="markdown-workbench-ast-tree"
        role="tree"
        aria-label="Markdown syntax tree"
        aria-activedescendant={activeDescendant}
        tabIndex={0}
        data-testid="markdown-ast-tree"
        style={{ height: Math.min(VIEWPORT_HEIGHT, Math.max(rows.length, 1) * ROW_HEIGHT) }}
        onKeyDown={onKeyDown}
        onScroll={(event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="markdown-workbench-ast-spacer" style={{ height: rows.length * ROW_HEIGHT }}>
          {visible.map((row, offset) => (
            <div
              key={row.id}
              id={`markdown-ast-${row.id}`}
              role="treeitem"
              aria-level={row.level}
              aria-posinset={row.position}
              aria-setsize={row.siblings}
              aria-expanded={row.childCount > 0 ? row.expanded : undefined}
              aria-selected={row.id === activeId}
              className="markdown-workbench-ast-row"
              data-ast-type={row.type}
              style={{ top: (first + offset) * ROW_HEIGHT, height: ROW_HEIGHT, paddingLeft: 6 + (row.level - 1) * 14 }}
              onClick={() => choose(row.id, first + offset)}
            >
              <span
                className="markdown-workbench-ast-toggle"
                aria-hidden="true"
                onClick={(event) => {
                  if (row.childCount === 0) return;
                  event.stopPropagation();
                  setOpen(row.id, !row.expanded);
                }}
              >{row.childCount === 0 ? '·' : row.expanded ? '▾' : '▸'}</span>
              <span className="markdown-workbench-ast-type">{row.type}</span>
              {row.detail ? <span className="markdown-workbench-ast-detail">{row.detail}</span> : null}
              <span className="markdown-workbench-ast-range">{rangeLabel(row.range)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="markdown-workbench-hint" data-testid="markdown-ast-summary">
        {rows.length} {rows.length === 1 ? 'row' : 'rows'} shown{truncated ? ` (limited to ${AST_ROW_CAP}; collapse branches to see the rest)` : ''}.
        {activeRange ? ` Selected source range ${rangeLabel(activeRange)}.` : ' Use the arrow keys to move, Right and Left to expand or collapse.'}
      </p>
    </div>
  );
}
