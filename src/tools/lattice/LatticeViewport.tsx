import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { JsonPrimitive } from './format-engine';
import type { LatticeGraphModel, LatticeGraphNode } from './graph-engine';
import type { LatticeLayoutModel } from './layout-engine';
import { centerViewportOnNode, fitViewport, viewportWorldRect, visibleLayoutNodes, wheelZoomFactor, type LatticeScreenSize, type LatticeViewport as ViewportState } from './viewport-engine';

const MIN_SCALE = 0.12;
const MAX_SCALE = 3;
const BUTTON_ZOOM_STEP = 1.25;
const MINIMAP_CAP = 1200;

const labelFor = (node: LatticeGraphNode): string => {
  if (node.cycle) return 'Cycle — already shown above';
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
  activeMatch,
  focusNonce,
  activePath,
  onToggleCollapse,
  onEditPrimitive,
  onSelect,
}: {
  graph: LatticeGraphModel;
  layout: LatticeLayoutModel | null;
  collapsedPaths: ReadonlySet<string>;
  searchMatches: ReadonlySet<string>;
  activeMatch?: string;
  focusNonce?: number;
  activePath?: string;
  onToggleCollapse: (path: string) => void;
  onEditPrimitive: (path: string, value: JsonPrimitive) => void;
  onSelect: (path: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const fitPendingRef = useRef(true);
  const [screen, setScreen] = useState<LatticeScreenSize>({ width: 900, height: 620 });
  const [viewport, setViewport] = useState<ViewportState>({ x: 24, y: 24, scale: 1 });
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const graphNodes = useMemo(() => new Map(graph.nodes.map((node) => [node.path, node])), [graph]);

  const fit = () => {
    if (!layout) return;
    setViewport(fitViewport(layout.bounds, screen, 36, MAX_SCALE));
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

  useEffect(() => { fitPendingRef.current = true; }, [layout]);

  useEffect(() => {
    if (!layout || !fitPendingRef.current || screen.width < 2 || screen.height < 2) return;
    fitPendingRef.current = false;
    setViewport(fitViewport(layout.bounds, screen, 36, MAX_SCALE));
  }, [layout, screen]);

  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  useEffect(() => {
    if (!layout || !focusNonce) return;
    const node = layout.nodes.get(activePathRef.current ?? '');
    if (!node) return;
    setViewport((current) => centerViewportOnNode(node, screen, current.scale));
  }, [focusNonce, layout, screen]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = host.getBoundingClientRect();
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey || event.metaKey);
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  const visible = useMemo(() => layout ? visibleLayoutNodes(layout, { viewport, screen, activeId: activePath, overscan: 180 }) : [], [layout, viewport, screen, activePath]);
  const visibleIds = useMemo(() => new Set(visible.map((node) => node.id)), [visible]);
  const worldRect = useMemo(() => viewportWorldRect(viewport, screen), [viewport, screen]);
  const minimapNodes = layout ? [...layout.nodes.values()] : [];
  const minimapTruncated = minimapNodes.length > MINIMAP_CAP;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: viewport.scale };
      dragRef.current = null;
      return;
    }
    if (event.button !== 0 || (event.target as HTMLElement).closest('.lattice-node, .lattice-viewport-actions, .lattice-minimap, button, input')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const factor = distance / pinchRef.current.distance;
      zoomAt(screen.width / 2, screen.height / 2, (pinchRef.current.scale * factor) / viewport.scale);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setViewport((current) => ({ ...current, x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y }));
  };
  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  const zoomAt = (px: number, py: number, factor: number) => {
    setViewport((current) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const worldX = (px - current.x) / current.scale;
      const worldY = (py - current.y) / current.scale;
      return { scale: nextScale, x: px - worldX * nextScale, y: py - worldY * nextScale };
    });
  };
  const zoomCentre = (factor: number) => zoomAt(screen.width / 2, screen.height / 2, factor);

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

  const panMinimap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!layout) return;
    const svg = event.currentTarget.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratioX = (event.clientX - rect.left) / Math.max(1, rect.width);
    const ratioY = (event.clientY - rect.top) / Math.max(1, rect.height);
    const worldX = ratioX * layout.bounds.width;
    const worldY = ratioY * layout.bounds.height;
    setViewport((current) => ({
      ...current,
      x: screen.width / 2 - worldX * current.scale,
      y: screen.height / 2 - worldY * current.scale,
    }));
  };

  if (!layout) return <div className="lattice-viewport lattice-viewport-loading" role="status">Laying out the graph on this device…</div>;

  return <div className="lattice-viewport" ref={hostRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
    <div className="lattice-viewport-actions" role="group" aria-label="Graph zoom">
      <button type="button" title="Fit the whole graph in view" onClick={fit}>Fit graph</button>
      <button type="button" title="Zoom out" aria-label="Zoom out" disabled={viewport.scale <= MIN_SCALE + 1e-6} onClick={() => zoomCentre(1 / BUTTON_ZOOM_STEP)}>−</button>
      <span title="Current zoom">{Math.round(viewport.scale * 100)}%</span>
      <button type="button" title="Zoom in" aria-label="Zoom in" disabled={viewport.scale >= MAX_SCALE - 1e-6} onClick={() => zoomCentre(BUTTON_ZOOM_STEP)}>+</button>
    </div>
    <div className="lattice-world" style={{ width: layout.bounds.width, height: layout.bounds.height, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
      <svg className="lattice-edges" width={layout.bounds.width} height={layout.bounds.height} aria-hidden="true">
        <g>{layout.edges.map((edge) => <path key={edge.id} d={edge.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} />)}</g>
        <g className="lattice-crosslinks">{graph.crossLinks.map((link) => {
          const source = layout.nodes.get(link.source); const target = layout.nodes.get(link.target);
          if (!source || !target) return null;
          return <line key={link.id} x1={source.x + source.width / 2} y1={source.y + source.height / 2} x2={target.x + target.width / 2} y2={target.y + target.height / 2}><title>{`Possible link ${link.value}`}</title></line>;
        })}</g>
      </svg>
      {visible.map((box) => {
        const node = graphNodes.get(box.id);
        if (!node) return null;
        const pathLabel = node.path || '$';
        const expanded = node.childCount > 0 && !collapsedPaths.has(node.path);
        const matched = searchMatches.has(node.path);
        const currentMatch = activeMatch === node.path;
        const fullValue = labelFor(node);
        const editable = ['string', 'number', 'boolean', 'null'].includes(node.type);
        return <div
          className={`lattice-node${matched ? ' is-match' : ''}${currentMatch ? ' is-current-match' : ''}${activePath === node.path ? ' is-active' : ''}`}
          data-node-path={node.path}
          key={node.path || '$'}
          style={{ left: box.x, top: box.y, width: box.width, minHeight: box.height }}
          onClick={() => onSelect(node.path)}
          onDoubleClick={() => beginEdit(node)}
          role="group"
          aria-label={`${pathLabel} ${node.type}`}
          title={`${pathLabel}\n${fullValue}`}
        >
          <div className="lattice-node-head"><strong title={node.path ? node.key : '$'}>{node.path ? node.key : '$'}</strong><span>{node.type}</span></div>
          {editing === node.path ? <div className="lattice-inline-edit">
            <input aria-label={`Edit ${node.path || '/'} value`} autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commitEdit(node); if (event.key === 'Escape') setEditing(null); }} />
            {editError ? <small role="alert">{editError}</small> : null}
          </div> : <div className="lattice-node-value" title={fullValue}>{fullValue}</div>}
          {editable && activePath === node.path && editing !== node.path ? <button type="button" className="lattice-edit" title="Edit this value. On a phone, tap Edit instead of double-tapping." onClick={(event) => { event.stopPropagation(); beginEdit(node); }}>Edit</button> : null}
          {node.childCount > 0 ? <button type="button" className="lattice-collapse" title={expanded ? 'Hide children' : 'Show children'} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.path || '/'}`} onClick={(event) => { event.stopPropagation(); onToggleCollapse(node.path); }}>{expanded ? '−' : '+'}<span>{node.childCount}</span></button> : null}
        </div>;
      })}
    </div>
    <div
      className="lattice-minimap"
      role="group"
      aria-label="Graph minimap. Click or drag to move the view."
      title={minimapTruncated ? `Showing the first ${MINIMAP_CAP} of ${minimapNodes.length} nodes` : 'Click or drag to move the view'}
      onPointerDown={(event) => { event.stopPropagation(); panMinimap(event); }}
      onPointerMove={(event) => { if (event.buttons === 1) panMinimap(event); }}
    >
      <svg aria-hidden="true" viewBox={`0 0 ${Math.max(1, layout.bounds.width)} ${Math.max(1, layout.bounds.height)}`}>
        {minimapNodes.slice(0, MINIMAP_CAP).map((node) => <rect key={node.id} x={node.x} y={node.y} width={node.width} height={node.height} className={visibleIds.has(node.id) ? 'is-visible' : ''} />)}
        <rect className="lattice-minimap-window" x={worldRect.x} y={worldRect.y} width={worldRect.width} height={worldRect.height} />
      </svg>
    </div>
  </div>;
}
