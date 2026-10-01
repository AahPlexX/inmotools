// Feature 33 — Interactive Visual DNS & Network Node Graph.
// Canvas node-link diagram: root URL → CNAME aliases → IPs → ASNs → countries.
// Supports drag-to-inspect (dragging a node repositions it and pins its
// inspector panel open) plus wheel/pinch zoom and background-drag panning.

import { useEffect, useMemo, useRef, useState } from 'react';

export interface GraphNode { id: string; label: string; layer: 0 | 1 | 2 | 3 | 4; detail: string }
export interface GraphEdge { from: string; to: string }
export interface NodeGraphData { nodes: GraphNode[]; edges: GraphEdge[] }

const NODE_RADIUS = 10;
const LAYER_COLORS = ['#5b8def', '#7cc4ff', '#ffb454', '#8bd17c', '#e28cf0'];

function layoutNodes(data: NodeGraphData, width: number, height: number): Map<string, { x: number; y: number }> {
  const byLayer = new Map<number, GraphNode[]>();
  for (const node of data.nodes) {
    const list = byLayer.get(node.layer) ?? [];
    list.push(node);
    byLayer.set(node.layer, list);
  }
  const positions = new Map<string, { x: number; y: number }>();
  const layerCount = 5;
  for (const [layer, nodes] of byLayer) {
    const colX = 60 + (layer * (width - 120)) / (layerCount - 1);
    nodes.forEach((node, i) => {
      const rowY = height / (nodes.length + 1) * (i + 1);
      positions.set(node.id, { x: colX, y: rowY });
    });
  }
  return positions;
}

export function NodeGraph({ data }: { data: NodeGraphData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 360 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const dragState = useRef<{ mode: 'pan' | 'node'; nodeId?: string; lastX: number; lastY: number } | null>(null);
  const pinchState = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: entry.contentRect.width, height: Math.max(320, entry.contentRect.width * 0.55) });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPositions(layoutNodes(data, size.width, size.height));
  }, [data, size.width, size.height]);

  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    ctx.strokeStyle = 'rgba(150, 170, 210, 0.45)';
    ctx.lineWidth = 1.25;
    for (const edge of data.edges) {
      const a = positions.get(edge.from);
      const b = positions.get(edge.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const node of data.nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, node.id === selected?.id ? NODE_RADIUS + 3 : NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = LAYER_COLORS[node.layer] ?? '#9aa8c4';
      ctx.fill();
      if (node.id === selected?.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = '#e7ecfa';
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, pos.x, pos.y + NODE_RADIUS + 14);
    }
    ctx.restore();
  }, [data, positions, transform, selected, size]);

  function toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - transform.x) / transform.scale, y: (clientY - rect.top - transform.y) / transform.scale };
  }

  function hitTest(worldX: number, worldY: number): string | undefined {
    for (const node of data.nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      if (Math.hypot(pos.x - worldX, pos.y - worldY) <= NODE_RADIUS + 4) return node.id;
    }
    return undefined;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const world = toWorld(e.clientX, e.clientY);
    const hitId = hitTest(world.x, world.y);
    if (hitId) {
      setSelected(nodeById.get(hitId) ?? null);
      dragState.current = { mode: 'node', nodeId: hitId, lastX: e.clientX, lastY: e.clientY };
    } else {
      dragState.current = { mode: 'pan', lastX: e.clientX, lastY: e.clientY };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    if (drag.mode === 'pan') {
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    } else if (drag.mode === 'node' && drag.nodeId) {
      setPositions((prev) => {
        const next = new Map(prev);
        const current = next.get(drag.nodeId!);
        if (current) next.set(drag.nodeId!, { x: current.x + dx / transform.scale, y: current.y + dy / transform.scale });
        return next;
      });
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  }

  function onPointerUp() { dragState.current = null; }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({ ...t, scale: Math.min(4, Math.max(0.4, t.scale * delta)) }));
  }

  function onTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchState.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale: transform.scale };
    }
  }

  function onTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (e.touches.length === 2 && pinchState.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = distance / pinchState.current.distance;
      setTransform((t) => ({ ...t, scale: Math.min(4, Math.max(0.4, pinchState.current!.scale * ratio)) }));
    }
  }

  function onTouchEnd() { pinchState.current = null; }

  return (
    <div ref={containerRef} className="node-graph-container">
      <canvas
        ref={canvasRef}
        className="node-graph-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        role="img"
        aria-label="Interactive DNS and network node graph"
      />
      {selected ? (
        <div className="node-graph-inspector" role="status">
          <strong>{selected.label}</strong>
          <p>{selected.detail}</p>
          <button type="button" onClick={() => setSelected(null)}>Close</button>
        </div>
      ) : (
        <p className="node-graph-hint">Drag a node to inspect it, drag the background to pan, scroll or pinch to zoom.</p>
      )}
    </div>
  );
}
