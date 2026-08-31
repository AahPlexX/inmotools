import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { screenToWorld } from './geometry-engine';
import { drawBaseScene, drawOverlayScene } from './render-engine';
import type { FloorplanAnalysis } from './floorplan-analysis';
import type { FloorplanProject, Point2D } from './floorplan-types';

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

export const FloorplanCanvas = ({
  project, analysis, mode, pointerWorld, snapWorld, draftStart, draftEnd, spacePressed,
  onWorldMove, onWorldClick, onPan, onZoomAt,
}: FloorplanCanvasProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pointersRef = useRef(new Map<number, ActivePointer>());
  const lastPanRef = useRef<Point2D>();
  const pinchRef = useRef<{ distance: number; midpoint: Point2D }>();
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, screen);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointersRef.current.size >= 2) { updatePinch(); return; }
    const shouldPan = spacePressed || event.button === 1 || (event.pointerType === 'touch' && mode === 'select');
    if (shouldPan) { lastPanRef.current = screen; return; }
    const world = screenToWorld(screen, project.viewport);
    onWorldClick(world, event.shiftKey);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screen = localPoint(event.clientX, event.clientY);
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, screen);
    if (pointersRef.current.size >= 2) { updatePinch(); return; }
    if (lastPanRef.current) {
      onPan(screen.x - lastPanRef.current.x, screen.y - lastPanRef.current.y);
      lastPanRef.current = screen;
      return;
    }
    onWorldMove(screenToWorld(screen, project.viewport), event.shiftKey);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    lastPanRef.current = undefined;
    updatePinch();
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const screen = localPoint(event.clientX, event.clientY);
    onZoomAt(screen, Math.exp(-event.deltaY * 0.0015));
  };

  return (
    <div className="plancraft-canvas-wrap" ref={wrapRef}>
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
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      />
    </div>
  );
};

export default FloorplanCanvas;
