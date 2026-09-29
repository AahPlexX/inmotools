import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { screenToWorld } from './geometry-engine';
import { drawBaseScene, drawOverlayScene } from './render-engine';
import type { FloorplanAnalysis } from './floorplan-analysis';
import type { FloorplanProject, Point2D } from './floorplan-types';
import './FloorplanCanvas.css';

export type FloorplanToolMode = 'select' | 'wall' | 'door' | 'window' | 'measure' | 'ada' | 'component';

interface FloorplanCanvasProps {
  readonly project: FloorplanProject;
  readonly analysis: FloorplanAnalysis;
  readonly mode: FloorplanToolMode;
  readonly pointerWorld?: Point2D;
  readonly snapWorld?: Point2D;
  readonly draftStart?: Point2D;
  readonly draftEnd?: Point2D;
  readonly spacePressed: boolean;
  readonly onWorldMove: (point: Point2D, shiftKey: boolean) => void;
  readonly onWorldClick: (point: Point2D, shiftKey: boolean) => void;
  /** Select tool only: return true when the press lands on something draggable (it is then selected). */
  readonly onDragStart: (point: Point2D) => boolean;
  readonly onDragMove: (point: Point2D, shiftKey: boolean) => void;
  readonly onDragEnd: () => void;
  readonly onPan: (dx: number, dy: number) => void;
  readonly onZoomAt: (screenPoint: Point2D, factor: number) => void;
  readonly onFit: () => void;
  readonly onHoverChange: (inside: boolean) => void;
  readonly onResize: (width: number, height: number) => void;
}

interface ActivePointer {
  readonly x: number;
  readonly y: number;
}

/**
 * One gesture at a time:
 * - `tap`: a touch press that becomes a click if it lifts without moving, or a pan if it moves;
 * - `pan`: panning the view (Space/middle button);
 * - `maybe-pan`: a mouse press on empty canvas with Select that pans once it moves;
 * - `drag`: moving the selected component or corner.
 */
type Gesture =
  | { readonly kind: 'tap'; readonly pointerId: number; readonly start: Point2D; last: Point2D; moved: boolean; readonly shiftKey: boolean }
  | { readonly kind: 'pan'; readonly pointerId: number; last: Point2D }
  | { readonly kind: 'maybe-pan'; readonly pointerId: number; readonly start: Point2D; last: Point2D; moved: boolean }
  | { readonly kind: 'drag'; readonly pointerId: number };

const MOVE_THRESHOLD_PX = 8;
const VIEWPORT_PAN_STEP_PX = 48;
const VIEWPORT_ZOOM_FACTOR = 1.2;
const LINE_HEIGHT_PX = 16;

export const FloorplanCanvas = ({
  project, analysis, mode, pointerWorld, snapWorld, draftStart, draftEnd, spacePressed,
  onWorldMove, onWorldClick, onDragStart, onDragMove, onDragEnd, onPan, onZoomAt, onFit, onHoverChange, onResize,
}: FloorplanCanvasProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pointersRef = useRef(new Map<number, ActivePointer>());
  const pinchRef = useRef<{ distance: number; midpoint: Point2D } | undefined>(undefined);
  const gestureRef = useRef<Gesture | undefined>(undefined);
  const [resizeVersion, setResizeVersion] = useState(0);
  // Native listeners read the latest callbacks through refs.
  const zoomRef = useRef(onZoomAt);
  zoomRef.current = onZoomAt;
  const resizeRef = useRef(onResize);
  resizeRef.current = onResize;

  const localPoint = (clientX: number, clientY: number): Point2D => {
    const rect = overlayRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: 0, y: 0 };
  };
  const toWorld = (screen: Point2D) => screenToWorld(screen, project.viewport);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      setResizeVersion((value) => value + 1);
      const box = entries[0]?.contentRect;
      if (box) resizeRef.current(box.width, box.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // React registers onWheel as a passive listener, where preventDefault() is ignored and the
  // page scrolls while zooming (react/react#19651). A native non-passive listener fixes that.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = overlay.getBoundingClientRect();
      const deltaY = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * LINE_HEIGHT_PX : event.deltaY;
      // Trackpad pinch arrives as a ctrl+wheel event with small deltas; give it a stronger response.
      const sensitivity = event.ctrlKey ? 0.01 : 0.0015;
      zoomRef.current({ x: event.clientX - rect.left, y: event.clientY - rect.top }, Math.exp(-deltaY * sensitivity));
    };
    overlay.addEventListener('wheel', handleWheel, { passive: false });
    return () => overlay.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    if (baseRef.current) drawBaseScene(baseRef.current, project);
  }, [project, resizeVersion]);

  useEffect(() => {
    if (!overlayRef.current) return;
    drawOverlayScene(overlayRef.current, project, {
      pointer: pointerWorld,
      snap: snapWorld,
      draftStart,
      draftEnd,
      selectedId: project.selectedId,
      violations: analysis.clearanceViolations,
      showHandles: mode === 'select',
    });
  }, [analysis.clearanceViolations, draftEnd, draftStart, mode, pointerWorld, project, resizeVersion, snapWorld]);

  const updatePinch = () => {
    const values = [...pointersRef.current.values()];
    if (values.length !== 2) { pinchRef.current = undefined; return; }
    const [a, b] = values as [ActivePointer, ActivePointer];
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const previous = pinchRef.current;
    if (previous) {
      // Two fingers both pan (midpoint travel) and zoom (spread).
      onPan(midpoint.x - previous.midpoint.x, midpoint.y - previous.midpoint.y);
      if (previous.distance > 0 && distance > 0) onZoomAt(midpoint, distance / previous.distance);
    }
    pinchRef.current = { distance, midpoint };
  };

  const dropReleasedPointers = (target: Element, activeId: number) => {
    for (const pointerId of [...pointersRef.current.keys()]) {
      if (pointerId !== activeId && !target.hasPointerCapture(pointerId)) pointersRef.current.delete(pointerId);
    }
  };

  const capturePointer = (target: Element, pointerId: number) => {
    try { target.setPointerCapture(pointerId); } catch { /* Capture is helpful, not required. */ }
  };

  const endGesture = (commitClick: Point2D | undefined) => {
    const gesture = gestureRef.current;
    gestureRef.current = undefined;
    if (!gesture) return;
    if (gesture.kind === 'drag') onDragEnd();
    if (gesture.kind === 'tap' && !gesture.moved && commitClick) onWorldClick(toWorld(commitClick), gesture.shiftKey);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event.clientX, event.clientY);
    dropReleasedPointers(event.currentTarget, event.pointerId);
    pointersRef.current.set(event.pointerId, screen);
    capturePointer(event.currentTarget, event.pointerId);

    if (pointersRef.current.size >= 2) {
      // A second finger turns whatever was starting into a pan/zoom; nothing gets placed.
      if (gestureRef.current?.kind === 'drag') onDragEnd();
      gestureRef.current = undefined;
      updatePinch();
      return;
    }
    if (event.button === 2) return;
    if (spacePressed || event.button === 1) { gestureRef.current = { kind: 'pan', pointerId: event.pointerId, last: screen }; return; }

    const world = toWorld(screen);
    if (mode === 'select' && onDragStart(world)) { gestureRef.current = { kind: 'drag', pointerId: event.pointerId }; return; }
    if (event.pointerType === 'touch') {
      gestureRef.current = { kind: 'tap', pointerId: event.pointerId, start: screen, last: screen, moved: false, shiftKey: event.shiftKey };
      return;
    }
    onWorldClick(world, event.shiftKey);
    if (mode === 'select') gestureRef.current = { kind: 'maybe-pan', pointerId: event.pointerId, start: screen, last: screen, moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event.clientX, event.clientY);
    dropReleasedPointers(event.currentTarget, event.pointerId);
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, screen);
    if (pointersRef.current.size >= 2) { updatePinch(); return; }

    const gesture = gestureRef.current;
    if (gesture && gesture.pointerId === event.pointerId) {
      if (gesture.kind === 'drag') { onDragMove(toWorld(screen), event.shiftKey); return; }
      if (gesture.kind === 'pan') { onPan(screen.x - gesture.last.x, screen.y - gesture.last.y); gesture.last = screen; return; }
      if (!gesture.moved && Math.hypot(screen.x - gesture.start.x, screen.y - gesture.start.y) > MOVE_THRESHOLD_PX) gesture.moved = true;
      if (gesture.moved) onPan(screen.x - gesture.last.x, screen.y - gesture.last.y);
      gesture.last = screen;
      return;
    }
    onWorldMove(toWorld(screen), event.shiftKey);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event.clientX, event.clientY);
    const singlePointer = pointersRef.current.size <= 1;
    if (gestureRef.current?.pointerId === event.pointerId) endGesture(singlePointer ? screen : undefined);
    pointersRef.current.delete(event.pointerId);
    updatePinch();
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (gestureRef.current?.pointerId === event.pointerId) endGesture(undefined);
    pointersRef.current.delete(event.pointerId);
    updatePinch();
  };

  const zoomAtCenter = (factor: number) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    onZoomAt({ x: rect.width / 2, y: rect.height / 2 }, factor);
  };

  return (
    <div className="plancraft-canvas-shell">
      <div
        className="plancraft-canvas-wrap"
        ref={wrapRef}
        data-pan-x={project.viewport.panX}
        data-pan-y={project.viewport.panY}
        data-scale={project.viewport.scale}
      >
        <canvas className="plancraft-canvas" ref={baseRef} aria-hidden="true" />
        <canvas
          className="plancraft-canvas plancraft-overlay"
          ref={overlayRef}
          data-testid="floorplan-overlay"
          data-mode={mode}
          aria-label="Floor plan drawing area. Pick a drafting tool, then click or tap to place points. Arrow keys move the selected item."
          role="application"
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerEnter={() => onHoverChange(true)}
          onPointerLeave={() => onHoverChange(false)}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
      <div className="plancraft-view-controls" role="group" aria-label="Viewport controls">
        <button type="button" aria-label="Pan view left" onClick={() => onPan(VIEWPORT_PAN_STEP_PX, 0)}>←</button>
        <button type="button" aria-label="Pan view up" onClick={() => onPan(0, VIEWPORT_PAN_STEP_PX)}>↑</button>
        <button type="button" aria-label="Pan view down" onClick={() => onPan(0, -VIEWPORT_PAN_STEP_PX)}>↓</button>
        <button type="button" aria-label="Pan view right" onClick={() => onPan(-VIEWPORT_PAN_STEP_PX, 0)}>→</button>
        <button type="button" aria-label="Zoom view out" onClick={() => zoomAtCenter(1 / VIEWPORT_ZOOM_FACTOR)}>−</button>
        <button type="button" aria-label="Zoom view in" onClick={() => zoomAtCenter(VIEWPORT_ZOOM_FACTOR)}>+</button>
        <button type="button" aria-label="Fit the whole plan in view" title="Fit plan (0)" className="plancraft-fit" onClick={onFit}>Fit</button>
      </div>
    </div>
  );
};

export default FloorplanCanvas;
