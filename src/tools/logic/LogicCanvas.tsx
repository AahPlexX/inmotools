import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { busLevels, describeBus } from './bus-engine';
import { getComponentPorts } from './component-library';
import { findComponentAt } from './gate-shapes';
import { findPortAt, orthogonalWaypoints, portAbsolutePosition, GRID_SIZE } from './geometry';
import { readLevel } from './sim-engine';
import { levelLocation, markerWidthOf } from './subcircuit-ports';
import { renderScene, screenToWorld, snapToGrid, THEME_PALETTES, type DraftWire } from './render-engine';
import { beginPinch, updatePinch, zoomViewportAt, type PinchStart } from './touch-gestures';
import type { ComponentType, LogicDocument, PortRef, SimulationFrame, ThemeName, WirePoint } from './logic-types';
import './LogicCanvas.css';

const CLICK_MOVEMENT_THRESHOLD = 6;
const LONG_PRESS_MS = 550;
const TOOLTIP_MAX_WIDTH = 220;
const TOOLTIP_MAX_HEIGHT = 56;
const TOOLTIP_EDGE_MARGIN = 8;

/** Keeps the hover tooltip's estimated box fully inside the canvas viewport instead of clipping past its right/bottom edge. */
const clampTooltipPosition = (x: number, y: number, containerWidth: number, containerHeight: number): ScreenPoint => ({
  x: Math.min(x, Math.max(TOOLTIP_EDGE_MARGIN, containerWidth - TOOLTIP_MAX_WIDTH - TOOLTIP_EDGE_MARGIN)),
  y: Math.min(y, Math.max(TOOLTIP_EDGE_MARGIN, containerHeight - TOOLTIP_MAX_HEIGHT - TOOLTIP_EDGE_MARGIN)),
});

export interface MenuAction {
  readonly key: string;
  readonly label: string;
  readonly onSelect: () => void;
}

export interface LogicCanvasProps {
  readonly document: LogicDocument;
  readonly frame: SimulationFrame;
  readonly theme: ThemeName;
  readonly placingType: ComponentType | null;
  readonly onMoveComponent: (id: string, x: number, y: number, final: boolean) => void;
  readonly onSelect: (ids: string[]) => void;
  readonly onAddWire: (from: PortRef, to: PortRef, waypoints: readonly WirePoint[]) => void;
  readonly onToggleSwitch: (id: string) => void;
  /** A double-click (or double-tap) on a part; the workspace opens it if it is a subcircuit. */
  readonly onOpenComponent: (id: string) => void;
  readonly onPressButton: (id: string, pressed: boolean) => void;
  readonly onViewportChange: (viewport: Partial<LogicDocument['viewport']>) => void;
  readonly onDropComponent: (type: ComponentType, worldX: number, worldY: number) => void;
  readonly buildContextActions: (componentId: string) => readonly MenuAction[];
  /** Bumped by the workspace's Escape handler to cancel an in-progress wire from outside this component. */
  readonly cancelDraftWireToken: number;
}

interface ScreenPoint { readonly x: number; readonly y: number; }

/** Whether the person asked their system to reduce motion; animated themes then hold still. */
const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const isCoarsePointer = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

export function LogicCanvas(props: LogicCanvasProps) {
  const { document: doc, frame, theme, placingType, onMoveComponent, onSelect, onAddWire, onToggleSwitch, onOpenComponent, onPressButton, onViewportChange, onDropComponent, buildContextActions, cancelDraftWireToken } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hoverPort, setHoverPort] = useState<PortRef | undefined>(undefined);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [draftWire, setDraftWire] = useState<DraftWire | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // Themes that draw moving signal flow need a free-running clock; everyone else redraws only when the circuit changes.
  const animates = THEME_PALETTES[theme].flow === true && !prefersReducedMotion();
  const [animationTime, setAnimationTime] = useState(0);
  useEffect(() => {
    if (!animates) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      // About 30 frames a second is plenty for a dash pattern and halves the redraw cost.
      if (now - last >= 33) {
        last = now;
        setAnimationTime(now);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animates]);
  const [menu, setMenu] = useState<{ x: number; y: number; radial: boolean; actions: readonly MenuAction[]; label: string } | null>(null);

  const dragRef = useRef<{ ids: string[]; startWorld: ScreenPoint; originals: Record<string, ScreenPoint>; moved: boolean; clickTargetId?: string; lastDx: number; lastDy: number } | null>(null);
  const panRef = useRef<{ startScreen: ScreenPoint; startPan: ScreenPoint } | null>(null);
  const marqueeStartRef = useRef<ScreenPoint | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  /** Every finger currently on the canvas, by pointer id, so a second one can turn the gesture into a pan/zoom. */
  const touchPointsRef = useRef(new Map<number, ScreenPoint>());
  const pinchRef = useRef<PinchStart | null>(null);
  /** A component drop started by a finger, held until that finger lifts so a pinch that follows it never drops one. */
  /** A wire action on a bus pin that a touch has started but not yet finished (see the hold-to-read handling). */
  const pendingPortTapRef = useRef<{ activate: () => void } | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const pendingTouchDropRef = useRef<{ pointerId: number; type: ComponentType; worldX: number; worldY: number } | null>(null);

  useEffect(() => {
    setDraftWire(null);
  }, [cancelDraftWireToken]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ width: Math.max(240, entry.contentRect.width), height: Math.max(240, entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderScene(ctx, size.width, size.height, doc.viewport, { document: doc, frame, hoverPort, draftWire: draftWire ?? undefined, marqueeRect: marquee ?? undefined, animationTime: animates ? animationTime : undefined }, theme);
  }, [doc, frame, theme, size, hoverPort, draftWire, marquee, animates, animationTime]);

  const getScreenPoint = useCallback((event: { clientX: number; clientY: number }): ScreenPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, []);

  const componentAt = useCallback((worldPoint: ScreenPoint) => findComponentAt(doc.components, worldPoint), [doc.components]);

  const portAt = useCallback((worldPoint: ScreenPoint) => {
    for (const component of doc.components) {
      const port = findPortAt(component, worldPoint);
      if (port) return { componentId: component.id, portId: port.id, position: undefined };
    }
    return undefined;
  }, [doc.components]);

  const openMenuFor = useCallback((componentId: string, screenPoint: ScreenPoint, radial: boolean) => {
    const component = doc.components.find((candidate) => candidate.id === componentId);
    if (!component) return;
    onSelect([componentId]);
    setMenu({ x: screenPoint.x, y: screenPoint.y, radial, actions: buildContextActions(componentId), label: component.label || component.type });
  }, [doc.components, onSelect, buildContextActions]);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  /**
   * Drops whatever a single finger had started (a component drag, a held push
   * button, a rubber-band box, a pending long press) so a second finger can
   * take over as a pan/zoom. A drag already previewed on screen is put back
   * where it began, so a pinch never leaves a component displaced.
   */
  const abandonSingleTouchGesture = () => {
    clearLongPress();
    pendingTouchDropRef.current = null;
    pendingPortTapRef.current = null;
    const drag = dragRef.current;
    if (drag) {
      if (drag.moved) {
        for (const id of drag.ids) {
          const origin = drag.originals[id];
          if (origin) onMoveComponent(id, origin.x, origin.y, false);
        }
      }
      for (const id of drag.ids) {
        if (doc.components.find((candidate) => candidate.id === id)?.type === 'PUSH_BUTTON') onPressButton(id, false);
      }
      dragRef.current = null;
    }
    marqueeStartRef.current = null;
    setMarquee(null);
  };

  const touchPair = (): [ScreenPoint, ScreenPoint] | undefined => {
    const points = Array.from(touchPointsRef.current.values());
    return points.length >= 2 ? [points[0]!, points[1]!] : undefined;
  };

  /** What hovering (or, on touch, holding) a pin says: the part, the pin, and for a bus its value in binary, hex, and decimal. */
  const portTooltip = (component: LogicDocument['components'][number] | undefined, portDef: ReturnType<typeof getComponentPorts>[number] | undefined, portId: string): string => {
    const base = `${component?.label ?? ''} · pin ${portDef?.label ?? portId}`;
    if (!component || !portDef?.bus) return base;
    return `${component.label} · ${describeBus(portDef.id, busLevels(portDef, (pin) => {
      const where = levelLocation(component, portDef.id, pin);
      return readLevel(frame, where.componentId, where.pinId);
    }))}`;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    setMenu(null);
    longPressFiredRef.current = false;
    const screenPoint = getScreenPoint(event);
    const worldPoint = screenToWorld(screenPoint.x, screenPoint.y, doc.viewport);

    // A second finger never clicks, drags, or wires on its own: together with
    // the first it pans and zooms the view.
    if (event.pointerType === 'touch') {
      touchPointsRef.current.set(event.pointerId, screenPoint);
      if (touchPointsRef.current.size >= 2) {
        abandonSingleTouchGesture();
        const pair = touchPair();
        pinchRef.current = pair ? (beginPinch(pair[0], pair[1], doc.viewport) ?? null) : null;
        return;
      }
    }

    if (placingType) {
      // Only the primary button places a component: a right-click would
      // otherwise both open a wire-cancel/context-menu gesture AND drop a
      // component, and a middle-click would drop one instead of panning.
      if (event.button === 0) {
        if (event.pointerType === 'touch') pendingTouchDropRef.current = { pointerId: event.pointerId, type: placingType, worldX: worldPoint.x / GRID_SIZE, worldY: worldPoint.y / GRID_SIZE };
        else onDropComponent(placingType, worldPoint.x / GRID_SIZE, worldPoint.y / GRID_SIZE);
      }
      return;
    }

    if (event.button === 2) {
      if (draftWire) { setDraftWire(null); return; }
      const component = componentAt(worldPoint);
      if (component) openMenuFor(component.id, screenPoint, false);
      return;
    }

    if (event.button === 1) {
      panRef.current = { startScreen: screenPoint, startPan: { x: doc.viewport.panX, y: doc.viewport.panY } };
      return;
    }

    const port = portAt(worldPoint);
    if (port) {
      const activate = () => {
        if (draftWire) {
          if (draftWire.from.componentId !== port.componentId || draftWire.from.portId !== port.portId) {
            const targetComponent = doc.components.find((candidate) => candidate.id === port.componentId);
            const targetPort = targetComponent ? getComponentPorts(targetComponent.type, targetComponent.params).find((candidate) => candidate.id === port.portId) : undefined;
            const endPosition = targetComponent && targetPort ? portAbsolutePosition(targetComponent, targetPort) : worldPoint;
            onAddWire(draftWire.from, { componentId: port.componentId, portId: port.portId }, orthogonalWaypoints(draftWire.fromPosition, endPosition));
          }
          setDraftWire(null);
        } else {
          setDraftWire({ from: { componentId: port.componentId, portId: port.portId }, fromPosition: worldPoint, waypoints: [], cursor: worldPoint });
        }
      };
      const owner = doc.components.find((candidate) => candidate.id === port.componentId);
      const definition = owner ? getComponentPorts(owner.type, owner.params).find((candidate) => candidate.id === port.portId) : undefined;
      if (event.pointerType === 'touch' && definition?.bus) {
        // On touch there is no hover, so a bus pin's value is shown by holding it. A quick tap still wires, but
        // only once the finger lifts, so a hold never also starts or finishes a wire.
        pendingPortTapRef.current = { activate };
        longPressTimerRef.current = window.setTimeout(() => {
          longPressFiredRef.current = true;
          pendingPortTapRef.current = null;
          const clamped = clampTooltipPosition(screenPoint.x + 14, screenPoint.y - 48, size.width, size.height);
          setTooltip({ x: clamped.x, y: clamped.y, text: portTooltip(owner, definition, port.portId) });
          if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
          tooltipTimerRef.current = window.setTimeout(() => setTooltip(null), 3500);
        }, LONG_PRESS_MS);
        return;
      }
      activate();
      return;
    }

    const component = componentAt(worldPoint);
    if (component) {
      if (event.pointerType === 'touch') {
        longPressTimerRef.current = window.setTimeout(() => {
          longPressFiredRef.current = true;
          // The long press opens a context menu; undo the provisional press
          // this same gesture started so releasing it doesn't also fire the
          // button, and drop the drag so continued finger movement while the
          // menu is open can't drag the component underneath it.
          if (component.type === 'PUSH_BUTTON') onPressButton(component.id, false);
          dragRef.current = null;
          openMenuFor(component.id, screenPoint, true);
        }, LONG_PRESS_MS);
      }
      if (component.type === 'PUSH_BUTTON') onPressButton(component.id, true);
      const alreadySelected = doc.selectedIds.includes(component.id);
      const targets = event.shiftKey ? Array.from(new Set([...doc.selectedIds, component.id])) : alreadySelected ? [...doc.selectedIds] : [component.id];
      if (!event.shiftKey && !alreadySelected) onSelect(targets);
      else if (event.shiftKey) onSelect(targets);
      const originals: Record<string, ScreenPoint> = {};
      for (const id of targets) {
        const target = doc.components.find((candidate) => candidate.id === id);
        if (target) originals[id] = { x: target.x, y: target.y };
      }
      dragRef.current = { ids: targets, startWorld: worldPoint, originals, moved: false, clickTargetId: component.id, lastDx: 0, lastDy: 0 };
      return;
    }

    marqueeStartRef.current = worldPoint;
    setMarquee({ x: worldPoint.x, y: worldPoint.y, width: 0, height: 0 });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const screenPoint = getScreenPoint(event);
    const worldPoint = screenToWorld(screenPoint.x, screenPoint.y, doc.viewport);

    if (event.pointerType === 'touch' && touchPointsRef.current.has(event.pointerId)) {
      touchPointsRef.current.set(event.pointerId, screenPoint);
      const pair = touchPair();
      if (pair) {
        // Fingers that started too close together define no scale yet; retry as they spread.
        if (!pinchRef.current) pinchRef.current = beginPinch(pair[0], pair[1], doc.viewport) ?? null;
        if (pinchRef.current) onViewportChange(updatePinch(pinchRef.current, pair[0], pair[1]));
        return;
      }
      if (pendingTouchDropRef.current?.pointerId === event.pointerId) return;
    }

    if (panRef.current) {
      const dx = screenPoint.x - panRef.current.startScreen.x;
      const dy = screenPoint.y - panRef.current.startScreen.y;
      onViewportChange({ panX: panRef.current.startPan.x + dx, panY: panRef.current.startPan.y + dy });
      return;
    }

    if (dragRef.current) {
      const dx = worldPoint.x - dragRef.current.startWorld.x;
      const dy = worldPoint.y - dragRef.current.startWorld.y;
      if (Math.abs(dx) + Math.abs(dy) > CLICK_MOVEMENT_THRESHOLD / doc.viewport.zoom) {
        dragRef.current.moved = true;
        clearLongPress();
      }
      if (dragRef.current.moved) {
        dragRef.current.lastDx = dx;
        dragRef.current.lastDy = dy;
        // Live-preview the drag without committing undo history on every
        // pointer event; handlePointerUp commits the final positions once,
        // as a single undoable move.
        for (const id of dragRef.current.ids) {
          const origin = dragRef.current.originals[id];
          if (!origin) continue;
          onMoveComponent(id, snapToGrid(origin.x * GRID_SIZE + dx) / GRID_SIZE, snapToGrid(origin.y * GRID_SIZE + dy) / GRID_SIZE, false);
        }
      }
      return;
    }

    if (marqueeStartRef.current) {
      const start = marqueeStartRef.current;
      setMarquee({ x: Math.min(start.x, worldPoint.x), y: Math.min(start.y, worldPoint.y), width: Math.abs(worldPoint.x - start.x), height: Math.abs(worldPoint.y - start.y) });
      return;
    }

    if (draftWire) {
      setDraftWire({ ...draftWire, cursor: worldPoint });
      return;
    }

    const port = portAt(worldPoint);
    if (port) {
      setHoverPort({ componentId: port.componentId, portId: port.portId });
      if (!isCoarsePointer()) {
        const component = doc.components.find((candidate) => candidate.id === port.componentId);
        const portDef = component ? getComponentPorts(component.type, component.params).find((candidate) => candidate.id === port.portId) : undefined;
        const clamped = clampTooltipPosition(screenPoint.x + 14, screenPoint.y + 14, size.width, size.height);
        setTooltip({ x: clamped.x, y: clamped.y, text: portTooltip(component, portDef, port.portId) });
      }
      return;
    }
    setHoverPort(undefined);
    const hovered = componentAt(worldPoint);
    if (hovered && !isCoarsePointer()) {
      const clamped = clampTooltipPosition(screenPoint.x + 14, screenPoint.y + 14, size.width, size.height);
      setTooltip({ x: clamped.x, y: clamped.y, text: `${hovered.label} (${hovered.type})` });
    } else setTooltip(null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    clearLongPress();
    if (event.pointerType === 'touch') {
      const wasPinching = touchPointsRef.current.size >= 2;
      touchPointsRef.current.delete(event.pointerId);
      if (touchPointsRef.current.size < 2) pinchRef.current = null;
      // Lifting a finger out of a two-finger gesture ends it; the finger left
      // down must not then read as a tap, drag, or drop.
      if (wasPinching) return;
      const pendingTap = pendingPortTapRef.current;
      pendingPortTapRef.current = null;
      if (pendingTap && event.type === 'pointerup' && !longPressFiredRef.current) {
        pendingTap.activate();
        return;
      }
      const pendingDrop = pendingTouchDropRef.current;
      if (pendingDrop?.pointerId === event.pointerId) {
        pendingTouchDropRef.current = null;
        if (event.type === 'pointerup') onDropComponent(pendingDrop.type, pendingDrop.worldX, pendingDrop.worldY);
        return;
      }
    }
    if (panRef.current) { panRef.current = null; return; }

    if (dragRef.current) {
      const { moved, clickTargetId, ids, originals, lastDx, lastDy } = dragRef.current;
      const longPressTriggered = longPressFiredRef.current;
      if (moved) {
        for (const id of ids) {
          const origin = originals[id];
          if (!origin) continue;
          onMoveComponent(id, snapToGrid(origin.x * GRID_SIZE + lastDx) / GRID_SIZE, snapToGrid(origin.y * GRID_SIZE + lastDy) / GRID_SIZE, true);
        }
      }
      if (!longPressTriggered) {
        if (!moved && clickTargetId) {
          const component = doc.components.find((candidate) => candidate.id === clickTargetId);
          if (component?.type === 'SWITCH' || (component?.type === 'PORT_IN' && markerWidthOf(component.params) === 1)) onToggleSwitch(component.id);
        }
        for (const id of ids) {
          const component = doc.components.find((candidate) => candidate.id === id);
          if (component?.type === 'PUSH_BUTTON') onPressButton(id, false);
        }
      }
      dragRef.current = null;
    }

    if (marqueeStartRef.current && marquee) {
      const selected = doc.components.filter((component) => component.x * GRID_SIZE >= marquee.x && component.x * GRID_SIZE <= marquee.x + marquee.width && component.y * GRID_SIZE >= marquee.y && component.y * GRID_SIZE <= marquee.y + marquee.height);
      onSelect(selected.map((component) => component.id));
    }
    marqueeStartRef.current = null;
    setMarquee(null);
  };

  /** The browser took the touch over (a system gesture, an incoming call): end it without acting on it. */
  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    touchPointsRef.current.delete(event.pointerId);
    if (touchPointsRef.current.size < 2) pinchRef.current = null;
    abandonSingleTouchGesture();
    pendingPortTapRef.current = null;
    panRef.current = null;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    onViewportChange(zoomViewportAt(doc.viewport, getScreenPoint(event), event.deltaY < 0 ? 1.12 : 1 / 1.12));
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const point = getScreenPoint(event);
    const target = componentAt(screenToWorld(point.x, point.y, doc.viewport));
    if (target) onOpenComponent(target.id);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

  const menuStyle = useMemo(() => (menu ? { left: menu.x, top: menu.y } : undefined), [menu]);

  return (
    <div className="logic-canvas-shell" ref={containerRef} data-testid="logic-canvas-shell">
      <canvas
        ref={canvasRef}
        data-testid="logic-canvas"
        className={placingType ? 'logic-canvas placing' : 'logic-canvas'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        role="img"
        aria-label={`${doc.metadata.title} schematic canvas with ${doc.components.length} components`}
      />
      {tooltip ? (
        <div className="logic-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
          {tooltip.text}
        </div>
      ) : null}
      {menu ? (
        <div className={menu.radial ? 'logic-menu logic-menu-radial' : 'logic-menu'} style={menuStyle} role="menu" aria-label={`${menu.label} actions`}>
          {!menu.radial ? <div className="logic-menu-title">{menu.label}</div> : null}
          {menu.actions.map((action, index) => {
            const angle = (index / menu.actions.length) * Math.PI * 2 - Math.PI / 2;
            const radialStyle = menu.radial ? { transform: `translate(${Math.cos(angle) * 64}px, ${Math.sin(angle) * 64}px)` } : undefined;
            return (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                className="logic-menu-item"
                style={radialStyle}
                onClick={() => { action.onSelect(); setMenu(null); }}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
