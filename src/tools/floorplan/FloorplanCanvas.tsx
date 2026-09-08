import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
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
  readonly onPan: (dx: number, dy: number) => void;
  readonly onZoomAt: (screenPoint: Point2D, factor: number) => void;
}

interface ActivePointer {
  readonly x: number;
  readonly y: number;
}

interface TouchSelectGesture {
  readonly pointerId: number;
  readonly start: Point2D;
  last: Point2D;
  moved: boolean;
  readonly shiftKey: boolean;
}

const TOUCH_PAN_THRESHOLD_PX = 8;
const VIEWPORT_PAN_STEP_PX = 48;
const VIEWPORT_ZOOM_FACTOR = 1.2;

export const FloorplanCanvas = ({
  project, analysis, mode, pointerWorld, snapWorld, draftStart, draftEnd, spacePressed,
  onWorldMove, onWorldClick, onPan, onZoomAt,
}: FloorplanCanvasProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pointersRef = useRef(new Map<number, ActivePointer>());
  const lastPanRef = useRef<Point2D | undefined>(undefined);
  const pinchRef = useRef<{ distance: number; midpoint: Point2D } | undefined>(undefined);
  const touchSelectRef = useRef<TouchSelectGesture | undefined>(undefined);
  const [resizeVersion, setResizeVersion] = useState(0);

  const localPoint = (clientX: number, clientY: number): Point2D => {
    const rect = overlayRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: 0, y: 0 };
  };

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => setResizeVersion((value) => value + 1));
    observer.observe(element);
    return () => observer.disconnect();
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
    });
  }, [analysis.clearanceViolations, draftEnd, draftStart, pointerWorld, project, resizeVersion, snapWorld]);

  const updatePinch = () => {
    const values = [...pointersRef.current.values()];
    if (values.length !== 2) { pinchRef.current = undefined; return; }
    const [a, b] = values as [ActivePointer, ActivePointer];
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const previous = pinchRef.current;
    if (previous && previous.distance > 0 && distance > 0) onZoomAt(midpoint, distance / previous.distance);
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event.clientX, event.clientY);
    dropReleasedPointers(event.currentTarget, event.pointerId);
    pointersRef.current.set(event.pointerId, screen);
    capturePointer(event.currentTarget, event.pointerId);

    if (pointersRef.current.size >= 2) {
      touchSelectRef.current = undefined;
      lastPanRef.current = undefined;
      updatePinch();
      return;
    }

    if (event.pointerType === 'touch' && mode === 'select' && !spacePressed) {
      touchSelectRef.current = { pointerId: event.pointerId, start: screen, last: screen, moved: false, shiftKey: event.shiftKey };
      return;
    }

    const shouldPan = spacePressed || event.button === 1;
    if (shouldPan) { lastPanRef.current = screen; return; }
    onWorldClick(screenToWorld(screen, project.viewport), event.shiftKey);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event.clientX, event.clientY);
    dropReleasedPointers(event.currentTarget, event.pointerId);
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, screen);

    if (pointersRef.current.size >= 2) {
      touchSelectRef.current = undefined;
      lastPanRef.current = undefined;
      updatePinch();
      return;
    }

    const touchSelect = touchSelectRef.current;
    if (touchSelect?.pointerId === event.pointerId) {
      if (!touchSelect.moved && Math.hypot(screen.x - touchSelect.start.x, screen.y - touchSelect.start.y) > TOUCH_PAN_THRESHOLD_PX) {
        touchSelect.moved = true;
        lastPanRef.current = touchSelect.last;
      }
      if (touchSelect.moved) {
        const previous = lastPanRef.current ?? touchSelect.last;
        onPan(screen.x - previous.x, screen.y - previous.y);
        lastPanRef.current = screen;
      }
      touchSelect.last = screen;
      return;
    }

    if (lastPanRef.current) {
      onPan(screen.x - lastPanRef.current.x, screen.y - lastPanRef.current.y);
      lastPanRef.current = screen;
      return;
    }
    onWorldMove(screenToWorld(screen, project.viewport), event.shiftKey);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event.clientX, event.clientY);
    const touchSelect = touchSelectRef.current;
    const wasSinglePointer = pointersRef.current.size <= 1;
    if (touchSelect?.pointerId === event.pointerId && !touchSelect.moved && wasSinglePointer) {
      onWorldClick(screenToWorld(screen, project.viewport), touchSelect.shiftKey);
    }
    if (touchSelect?.pointerId === event.pointerId) touchSelectRef.current = undefined;
    pointersRef.current.delete(event.pointerId);
    lastPanRef.current = undefined;
    updatePinch();
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (touchSelectRef.current?.pointerId === event.pointerId) touchSelectRef.current = undefined;
    pointersRef.current.delete(event.pointerId);
    lastPanRef.current = undefined;
    updatePinch();
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const screen = localPoint(event.clientX, event.clientY);
    onZoomAt(screen, Math.exp(-event.deltaY * 0.0015));
  };

  const zoomAtCenter = (factor: number) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    onZoomAt({ x: rect.width / 2, y: rect.height / 2 }, factor);
  };

  return (
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
        aria-label="Interactive floor plan drafting canvas"
        role="application"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
      />
      <div className="plancraft-view-controls" role="group" aria-label="Viewport controls">
        <button type="button" aria-label="Pan view left" onClick={() => onPan(VIEWPORT_PAN_STEP_PX, 0)}>←</button>
        <button type="button" aria-label="Pan view up" onClick={() => onPan(0, VIEWPORT_PAN_STEP_PX)}>↑</button>
        <button type="button" aria-label="Pan view down" onClick={() => onPan(0, -VIEWPORT_PAN_STEP_PX)}>↓</button>
        <button type="button" aria-label="Pan view right" onClick={() => onPan(-VIEWPORT_PAN_STEP_PX, 0)}>→</button>
        <button type="button" aria-label="Zoom view out" onClick={() => zoomAtCenter(1 / VIEWPORT_ZOOM_FACTOR)}>−</button>
        <button type="button" aria-label="Zoom view in" onClick={() => zoomAtCenter(VIEWPORT_ZOOM_FACTOR)}>+</button>
      </div>
    </div>
  );
};

export default FloorplanCanvas;
