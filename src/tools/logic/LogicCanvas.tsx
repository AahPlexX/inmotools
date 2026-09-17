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
import { getComponentPorts } from './component-library';
import { componentBoundingBox, findPortAt, portAbsolutePosition, GRID_SIZE } from './geometry';
import { renderScene, screenToWorld, snapToGrid, type DraftWire } from './render-engine';
import type { ComponentType, LogicDocument, PortRef, SimulationFrame, ThemeName, WirePoint } from './logic-types';
import './LogicCanvas.css';

/**
 * A single L-bend between two absolute pixel positions, matching the
 * "orthogonal wire routing" the schematic canvas promises: horizontal
 * first when the endpoints are farther apart on that axis, vertical first
 * otherwise, so the bend reads naturally instead of a diagonal segment.
 */
const orthogonalWaypoints = (start: WirePoint, end: WirePoint): WirePoint[] => {
  if (start.x === end.x || start.y === end.y) return [];
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  return horizontalFirst ? [{ x: end.x, y: start.y }] : [{ x: start.x, y: end.y }];
};

const CLICK_MOVEMENT_THRESHOLD = 6;
const LONG_PRESS_MS = 550;

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
  readonly onPressButton: (id: string, pressed: boolean) => void;
  readonly onViewportChange: (viewport: Partial<LogicDocument['viewport']>) => void;
  readonly onDropComponent: (type: ComponentType, worldX: number, worldY: number) => void;
  readonly buildContextActions: (componentId: string) => readonly MenuAction[];
  /** Bumped by the workspace's Escape handler to cancel an in-progress wire from outside this component. */
  readonly cancelDraftWireToken: number;
}

interface ScreenPoint { readonly x: number; readonly y: number; }

const isCoarsePointer = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

export function LogicCanvas(props: LogicCanvasProps) {
  const { document: doc, frame, theme, placingType, onMoveComponent, onSelect, onAddWire, onToggleSwitch, onPressButton, onViewportChange, onDropComponent, buildContextActions, cancelDraftWireToken } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hoverPort, setHoverPort] = useState<PortRef | undefined>(undefined);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [draftWire, setDraftWire] = useState<DraftWire | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; radial: boolean; actions: readonly MenuAction[]; label: string } | null>(null);

  const dragRef = useRef<{ ids: string[]; startWorld: ScreenPoint; originals: Record<string, ScreenPoint>; moved: boolean; clickTargetId?: string; lastDx: number; lastDy: number } | null>(null);
  const panRef = useRef<{ startScreen: ScreenPoint; startPan: ScreenPoint } | null>(null);
  const marqueeStartRef = useRef<ScreenPoint | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

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
    renderScene(ctx, size.width, size.height, doc.viewport, { document: doc, frame, hoverPort, draftWire: draftWire ?? undefined, marqueeRect: marquee ?? undefined }, theme);
  }, [doc, frame, theme, size, hoverPort, draftWire, marquee]);

  const getScreenPoint = useCallback((event: { clientX: number; clientY: number }): ScreenPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }, []);

  const componentAt = useCallback((worldPoint: ScreenPoint) =>
    doc.components.find((component) => {
      const box = componentBoundingBox(component);
      return worldPoint.x >= box.minX && worldPoint.x <= box.maxX && worldPoint.y >= box.minY && worldPoint.y <= box.maxY;
    }), [doc.components]);

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

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    setMenu(null);
    longPressFiredRef.current = false;
    const screenPoint = getScreenPoint(event);
    const worldPoint = screenToWorld(screenPoint.x, screenPoint.y, doc.viewport);

    if (placingType) {
      onDropComponent(placingType, worldPoint.x / GRID_SIZE, worldPoint.y / GRID_SIZE);
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
        setTooltip({ x: screenPoint.x + 14, y: screenPoint.y + 14, text: `${component?.label ?? ''} · pin ${portDef?.label ?? port.portId}` });
      }
      return;
    }
    setHoverPort(undefined);
    const hovered = componentAt(worldPoint);
    if (hovered && !isCoarsePointer()) setTooltip({ x: screenPoint.x + 14, y: screenPoint.y + 14, text: `${hovered.label} (${hovered.type})` });
    else setTooltip(null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    clearLongPress();
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
          if (component?.type === 'SWITCH') onToggleSwitch(component.id);
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

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const screenPoint = getScreenPoint(event);
    const worldBefore = screenToWorld(screenPoint.x, screenPoint.y, doc.viewport);
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const zoom = Math.min(3, Math.max(0.25, doc.viewport.zoom * factor));
    const panX = screenPoint.x - worldBefore.x * zoom;
    const panY = screenPoint.y - worldBefore.y * zoom;
    onViewportChange({ zoom, panX, panY });
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
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
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
