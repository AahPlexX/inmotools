import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { normalizeBBox } from '../core/geodesy';
import { invert, linePath, project, WORLD_EXTENT } from '../core/projection';
import type { BBox, LatLon } from '../core/types';
import { baseLayerSvg, overlayLayerSvg, type MapScene } from '../render/scene';

export type MapMode = 'select' | 'measure' | 'box';
export type ViewBox = [number, number, number, number];

export interface MapCanvasHandle {
  viewBox: () => ViewBox;
  fit: (point: LatLon, widthDeg?: number) => void;
  reset: () => void;
}

interface Props {
  scene: MapScene;
  mode: MapMode;
  onPick: (point: LatLon) => void;
  onMeasure: (point: LatLon) => void;
  onBox: (box: BBox) => void;
  onPinMenu: (pinId: string, x: number, y: number) => void;
  onMapMenu: (point: LatLon, x: number, y: number) => void;
}

const [WX, WY, WW, WH] = WORLD_EXTENT;
const PAD = WW * 0.02;
const HOME: ViewBox = [WX - PAD, WY - PAD, WW + 2 * PAD, WH + 2 * PAD];
const MIN_W = WW / 600;
const MAX_W = HOME[2];

function clampView([x, y, w, h]: ViewBox): ViewBox {
  const scale = Math.min(MAX_W, Math.max(MIN_W, w)) / w;
  const nw = w * scale; const nh = h * scale;
  const cx = Math.min(WX + WW, Math.max(WX, x + w / 2));
  const cy = Math.min(WY + WH, Math.max(WY, y + h / 2));
  return [cx - nw / 2, cy - nh / 2, nw, nh];
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ scene, mode, onPick, onMeasure, onBox, onPinMenu, onMapMenu }, handle) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewBox>(HOME);
  const [size, setSize] = useState({ width: 800, height: 400 });
  const [hover, setHover] = useState<{ x: number; y: number; name: string } | null>(null);
  const [draft, setDraft] = useState<{ a: LatLon; b: LatLon } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; view: ViewBox; moved: boolean; pinch?: { dist: number; cx: number; cy: number }; boxStart?: LatLon; longPress?: number; longFired?: boolean } | null>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the view's aspect ratio equal to the element's so there is no letterboxing.
  const fitted = useMemo<ViewBox>(() => {
    const [x, y, w, h] = view;
    const aspect = size.width / size.height;
    const cx = x + w / 2; const cy = y + h / 2;
    const nw = Math.max(w, h * aspect); const nh = nw / aspect;
    return [cx - nw / 2, cy - nh / 2, nw, nh];
  }, [view, size]);
  const unitsPerPx = fitted[2] / size.width;

  const toSvg = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    return [fitted[0] + ((clientX - rect.left) / rect.width) * fitted[2], fitted[1] + ((clientY - rect.top) / rect.height) * fitted[3]];
  }, [fitted]);
  const toLatLon = useCallback((clientX: number, clientY: number) => {
    const [x, y] = toSvg(clientX, clientY);
    return invert(x, y);
  }, [toSvg]);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setView((current) => {
      const rect = svg.current?.getBoundingClientRect();
      const [x, y, w, h] = current;
      const aspect = size.width / size.height;
      const fw = Math.max(w, h * aspect); const fh = fw / aspect;
      const fx = x + w / 2 - fw / 2; const fy = y + h / 2 - fh / 2;
      const px = rect && clientX !== undefined ? (clientX - rect.left) / rect.width : 0.5;
      const py = rect && clientY !== undefined ? (clientY - rect.top) / rect.height : 0.5;
      const ax = fx + px * fw; const ay = fy + py * fh;
      const nw = Math.min(MAX_W, Math.max(MIN_W, fw / factor)); const nh = nw / aspect;
      return clampView([ax - px * nw, ay - py * nh, nw, nh]);
    });
  }, [size]);

  useImperativeHandle(handle, () => ({
    viewBox: () => fitted,
    reset: () => setView(HOME),
    fit: (point, widthDeg = 20) => {
      const [x, y] = project(point.lon, point.lat);
      const w = Math.max(MIN_W, (widthDeg / 360) * WW);
      setView(clampView([x - w / 2, y - w / 4, w, w / 2]));
    },
  }), [fitted]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(Math.exp(-delta * 0.0015), event.clientX, event.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const openMenuAt = (target: EventTarget | null, x: number, y: number) => {
    const pin = target instanceof Element ? target.closest<SVGGElement>('[data-pin]') : null;
    if (pin?.dataset.pin) { onPinMenu(pin.dataset.pin, x, y); return; }
    const point = toLatLon(x, y);
    if (point) onMapMenu(point, x, y);
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    svg.current?.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setHover(null);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (gesture.current?.longPress) window.clearTimeout(gesture.current.longPress);
      gesture.current = { startX: 0, startY: 0, view: fitted, moved: true, pinch: { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 } };
      return;
    }
    const target = event.target;
    const start = { startX: event.clientX, startY: event.clientY, view: fitted, moved: false } as NonNullable<typeof gesture.current>;
    if (mode === 'box') start.boxStart = toLatLon(event.clientX, event.clientY) ?? undefined;
    if (event.pointerType !== 'mouse') {
      start.longPress = window.setTimeout(() => {
        if (gesture.current && !gesture.current.moved) { gesture.current.longFired = true; openMenuAt(target, event.clientX, event.clientY); }
      }, 550);
    }
    gesture.current = start;
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) {
      if (event.pointerType === 'mouse') {
        const name = event.target instanceof Element ? event.target.closest<SVGElement>('[data-name]')?.dataset.name : undefined;
        setHover(name ? { x: event.clientX, y: event.clientY, name } : null);
      }
      return;
    }
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = svg.current?.getBoundingClientRect();
      if (!rect) return;
      const [vx, vy, vw, vh] = g.view;
      const nw = Math.min(MAX_W, Math.max(MIN_W, vw * (g.pinch.dist / dist))); const nh = nw * (vh / vw);
      const ax = vx + ((g.pinch.cx - rect.left) / rect.width) * vw; const ay = vy + ((g.pinch.cy - rect.top) / rect.height) * vh;
      const cx = (a.x + b.x) / 2; const cy = (a.y + b.y) / 2;
      setView(clampView([ax - ((cx - rect.left) / rect.width) * nw, ay - ((cy - rect.top) / rect.height) * nh, nw, nh]));
      return;
    }
    const dx = event.clientX - g.startX; const dy = event.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > 5) { g.moved = true; if (g.longPress) window.clearTimeout(g.longPress); }
    if (!g.moved) return;
    if (mode === 'box' && g.boxStart) {
      const here = toLatLon(event.clientX, event.clientY);
      if (here) setDraft({ a: g.boxStart, b: here });
      return;
    }
    const [vx, vy, vw, vh] = g.view;
    setView(clampView([vx - dx * (vw / size.width), vy - dy * (vw / size.width), vw, vh]));
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    pointers.current.delete(event.pointerId);
    if (g?.longPress) window.clearTimeout(g.longPress);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.longFired || g.pinch) { setDraft(null); return; }
    if (mode === 'box' && g.moved && draft) { onBox(normalizeBBox(draft.a, draft.b)); setDraft(null); return; }
    setDraft(null);
    if (g.moved) return;
    const point = toLatLon(event.clientX, event.clientY);
    if (!point) return;
    if (mode === 'measure') onMeasure(point); else onPick(point);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = fitted[2] * 0.1;
    const pan = (dx: number, dy: number) => setView((v) => clampView([v[0] + dx, v[1] + dy, v[2], v[3]]));
    switch (event.key) {
      case 'ArrowLeft': pan(-step, 0); break;
      case 'ArrowRight': pan(step, 0); break;
      case 'ArrowUp': pan(0, -step); break;
      case 'ArrowDown': pan(0, step); break;
      case '+': case '=': zoomAt(1.5); break;
      case '-': case '_': zoomAt(1 / 1.5); break;
      case '0': setView(HOME); break;
      case 'Enter': case ' ': {
        const center = invert(fitted[0] + fitted[2] / 2, fitted[1] + fitted[3] / 2);
        if (center) (mode === 'measure' ? onMeasure : onPick)(center);
        break;
      }
      default: return;
    }
    event.preventDefault();
  };

  const { countries, fills, highlight } = scene;
  const baseHtml = useMemo(() => baseLayerSvg({ countries, fills, highlight }), [countries, fills, highlight]);
  const overlayHtml = useMemo(() => overlayLayerSvg(scene, Number(unitsPerPx.toPrecision(2))), [scene, unitsPerPx]);
  const draftPath = draft ? (() => {
    const b = normalizeBBox(draft.a, draft.b);
    return linePath([{ lat: b.south, lon: b.west }, { lat: b.south, lon: b.east }, { lat: b.north, lon: b.east }, { lat: b.north, lon: b.west }, { lat: b.south, lon: b.west }]);
  })() : null;

  const hoverStyle = hover ? { left: Math.min(hover.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 180), top: Math.max(8, hover.y - 34) } : undefined;
  const modeHelp = mode === 'measure' ? 'Measure mode: click two points.' : mode === 'box' ? 'Box mode: drag to draw a rectangle.' : 'Click the map to look up a point.';

  return (
    <div className="gi-map" data-mode={mode}>
      <svg
        ref={svg}
        className="gi-map-svg"
        viewBox={fitted.map((n) => n.toFixed(3)).join(' ')}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-roledescription="interactive map"
        aria-label={`World map. ${modeHelp} Arrow keys pan, plus and minus zoom, 0 resets, Enter uses the centre.`}
        tabIndex={0}
        data-testid="gi-map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(event) => { event.preventDefault(); openMenuAt(event.target, event.clientX, event.clientY); }}
        onKeyDown={onKeyDown}
      >
        <g dangerouslySetInnerHTML={{ __html: baseHtml }} />
        <g dangerouslySetInnerHTML={{ __html: overlayHtml }} />
        {draftPath ? <path className="gi-box" d={draftPath} /> : null}
      </svg>
      {hover && hoverStyle ? <div className="gi-map-hover" style={hoverStyle} aria-hidden="true">{hover.name}</div> : null}
      <div className="gi-map-controls">
        <button type="button" aria-label="Zoom in" data-tip="Zoom in (+ key or scroll)" onClick={() => zoomAt(1.6)}>+</button>
        <button type="button" aria-label="Zoom out" data-tip="Zoom out (− key or scroll)" onClick={() => zoomAt(1 / 1.6)}>−</button>
        <button type="button" aria-label="Reset view" data-tip="Show the whole world (0 key)" onClick={() => setView(HOME)}>⌂</button>
      </div>
      <p className="gi-map-credit">Made with Natural Earth · Equal Earth projection</p>
    </div>
  );
});
