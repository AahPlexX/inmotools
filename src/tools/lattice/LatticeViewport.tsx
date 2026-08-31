import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import type { JsonPrimitive } from './format-engine';
import type { LatticeGraphModel, LatticeGraphNode } from './graph-engine';
import type { LatticeLayoutModel } from './layout-engine';
import { fitViewport, visibleLayoutNodes, type LatticeScreenSize, type LatticeViewport as ViewportState } from './viewport-engine';

const labelFor = (node: LatticeGraphNode): string => {
  if (node.value === undefined) return node.type === 'object' ? `Object (${node.childCount})` : node.type === 'array' ? `Array (${node.childCount})` : node.type;
  if (node.value === null) return 'null';
  return String(node.value);
};

const parsePrimitive = (node: LatticeGraphNode, text: string): JsonPrimitive => {
  if (node.type === 'string') return text;
  if (node.type === 'number') {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error('Enter a finite number.');
    return value;
  }
  if (node.type === 'boolean') {
    if (text === 'true') return true;
    if (text === 'false') return false;
    throw new Error('Enter true or false.');
  }
  if (node.type === 'null') return null;
  return text;
};

export default function LatticeViewport({
  graph,
  layout,
  collapsedPaths,
  searchMatches,
  activePath,
  onToggleCollapse,
  onEditPrimitive,
  onSelect,
}: {
  graph: LatticeGraphModel;
  layout: LatticeLayoutModel | null;
  collapsedPaths: ReadonlySet<string>;
  searchMatches: ReadonlySet<string>;
  activePath?: string;
  onToggleCollapse: (path: string) => void;
  onEditPrimitive: (path: string, value: JsonPrimitive) => void;
  onSelect: (path: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const [screen, setScreen] = useState<LatticeScreenSize>({ width: 900, height: 620 });
  const [viewport, setViewport] = useState<ViewportState>({ x: 24, y: 24, scale: 1 });
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const graphNodes = useMemo(() => new Map(graph.nodes.map((node) => [node.path, node])), [graph]);

  const fit = () => {
    if (!layout) return;
    setViewport(fitViewport(layout.bounds, screen, 36));
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setScreen({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { if (layout) setViewport(fitViewport(layout.bounds, screen, 36)); }, [layout, screen.width, screen.height]);

  const visible = useMemo(() => layout ? visibleLayoutNodes(layout, { viewport, screen, activeId: activePath, overscan: 180 }) : [], [layout, viewport, screen, activePath]);
  const visibleIds = useMemo(() => new Set(visible.map((node) => node.id)), [visible]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.lattice-node')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setViewport((current) => ({ ...current, x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y }));
  };
  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const factor = Math.exp(-event.deltaY * 0.0012);
    setViewport((current) => {
      const nextScale = Math.min(3, Math.max(0.12, current.scale * factor));
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return { scale: nextScale, x: px - worldX * nextScale, y: py - worldY * nextScale };
    });
  };

  const beginEdit = (node: LatticeGraphNode) => {
    if (!['string', 'number', 'boolean', 'null'].includes(node.type)) return;
    setEditing(node.path);
    setEditValue(node.value === null ? 'null' : String(node.value ?? ''));
    setEditError('');
  };
  const commitEdit = (node: LatticeGraphNode) => {
    try {
      onEditPrimitive(node.path, parsePrimitive(node, editValue));
      setEditing(null);
      setEditError('');
    } catch (error) { setEditError(error instanceof Error ? error.message : 'Invalid value.'); }
  };

  if (!layout) return <div className="lattice-viewport lattice-viewport-loading" role="status">Laying out graph locally…</div>;

  return <div className="lattice-viewport" ref={hostRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} onWheel={onWheel}>
    <div className="lattice-viewport-actions"><button type="button" onClick={fit}>Fit graph</button><span>{Math.round(viewport.scale * 100)}%</span></div>
    <div className="lattice-world" style={{ width: layout.bounds.width, height: layout.bounds.height, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
      <svg className="lattice-edges" width={layout.bounds.width} height={layout.bounds.height} aria-hidden="true">
        <g>{layout.edges.map((edge) => <path key={edge.id} d={edge.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} />)}</g>
        <g className="lattice-crosslinks">{graph.crossLinks.map((link) => {
          const source = layout.nodes.get(link.source); const target = layout.nodes.get(link.target);
          if (!source || !target) return null;
          return <line key={link.id} x1={source.x + source.width / 2} y1={source.y + source.height / 2} x2={target.x + target.width / 2} y2={target.y + target.height / 2} />;
        })}</g>
      </svg>
      {visible.map((box) => {
        const node = graphNodes.get(box.id);
        if (!node) return null;
        const pathLabel = node.path || '$';
        const expanded = node.childCount > 0 && !collapsedPaths.has(node.path);
        const matched = searchMatches.has(node.path);
        return <div
          className={`lattice-node${matched ? ' is-match' : ''}${activePath === node.path ? ' is-active' : ''}`}
          data-node-path={node.path}
          key={node.path || '$'}
          style={{ left: box.x, top: box.y, width: box.width, minHeight: box.height }}
          onClick={() => onSelect(node.path)}
          onDoubleClick={() => beginEdit(node)}
          role="group"
          aria-label={`${pathLabel} ${node.type}`}
        >
          <div className="lattice-node-head"><strong>{node.path ? node.key : '$'}</strong><span>{node.type}</span></div>
          {editing === node.path ? <div className="lattice-inline-edit">
            <input aria-label={`Edit ${node.path || '/'} value`} autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commitEdit(node); if (event.key === 'Escape') setEditing(null); }} />
            {editError ? <small role="alert">{editError}</small> : null}
          </div> : <div className="lattice-node-value">{labelFor(node).slice(0, 88)}</div>}
          {node.childCount > 0 ? <button type="button" className="lattice-collapse" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.path || '/'}`} onClick={(event) => { event.stopPropagation(); onToggleCollapse(node.path); }}>{expanded ? '−' : '+'}<span>{node.childCount}</span></button> : null}
        </div>;
      })}
    </div>
    <div className="lattice-minimap" aria-label="Graph minimap"><svg viewBox={`0 0 ${Math.max(1, layout.bounds.width)} ${Math.max(1, layout.bounds.height)}`}>{[...layout.nodes.values()].slice(0, 1200).map((node) => <rect key={node.id} x={node.x} y={node.y} width={node.width} height={node.height} className={visibleIds.has(node.id) ? 'is-visible' : ''} />)}</svg></div>
  </div>;
}
