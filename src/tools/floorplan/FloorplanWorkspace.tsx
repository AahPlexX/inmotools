import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import { requestSupportPrompt, SUPPORT_URL } from '../../lib/support';
import { analyzeFloorplan, buildSnapTargets, componentFootprint, type FloorplanAnalysis } from './floorplan-analysis';
import FloorplanCanvas, { type FloorplanToolMode } from './FloorplanCanvas';
import FloorplanInspector from './FloorplanInspector';
import { clampZoom, constrainAngle, screenToWorld, snapToGrid } from './geometry-engine';
import { exportDxf, exportPdf, exportSvg, pdfScaleFromNotation, PDF_SHEET_LABELS, serializeProject, type PdfSheet } from './export-engine';
import { addWall, deleteSelection, duplicateComponent, hitTest, mergeVertex, moveVertex, placeOpening, projectOntoWalls, splitWall, type WallEndpoint } from './plan-operations';
import { COMPONENT_LIBRARY, getSymbolDefinition } from './symbol-library';
import { commitFrom, commitProject, createInitialProject, loadProject, parseProjectJson, redoState, undoState, updateSelection } from './state-engine';
import { formatArea, formatLength, type DisplayUnits } from './units';
import type { FloorplanDimension, FloorplanProject, HostedOpening, PlanComponent, Point2D, ProjectHistory, WallSegment } from './floorplan-types';
import type { FloorplanWorkerResponse } from './floorplan-worker';

const AUTOSAVE_KEY = 'inmotools_plancraft_autosave';
// Rooms, dimensions, and clearance warnings are derived by the geometry worker. A
// worker that is merely slow to start or busy would otherwise leave the plan with
// no analysis and no recovery, so fall back to the identical main-thread pass.
const ANALYSIS_FALLBACK_MS = 1500;
const SNAP_RADIUS_PX = 15;
const PAGE_TITLE = 'PlanCraft Studio — Draw Floor Plans in Your Browser | InMo Tools';
const PAGE_DESCRIPTION = 'Draw floor plans in your browser: walls, doors, windows, furniture, room areas, and ADA clearance checks. Export PDF, DXF, or SVG. Nothing is uploaded.';

const GRID_CHOICES: Record<DisplayUnits, readonly (readonly [number, string])[]> = {
  metric: [[10, '10 mm'], [50, '50 mm'], [100, '100 mm'], [500, '500 mm'], [1000, '1000 mm']],
  imperial: [[25.4, '1"'], [152.4, '6"'], [304.8, '1\''], [609.6, '2\'']],
};

const safeInitialHistory = (): ProjectHistory => {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (raw) return loadProject(parseProjectJson(raw));
  } catch { /* Missing or damaged local recovery data starts a blank plan. */ }
  return createInitialProject('Untitled Plan');
};

const isTypingTarget = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
const distance = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);

type Drag =
  | { readonly kind: 'component'; readonly id: string; readonly before: FloorplanProject; readonly offset: Point2D; moved: boolean }
  | { readonly kind: 'vertex'; readonly id: string; readonly before: FloorplanProject; moved: boolean; last?: WallEndpoint };

const MODE_HELP: Record<Exclude<FloorplanToolMode, 'component'>, string> = {
  select: 'Select: click something to edit it. Drag furniture or wall corners to move them.',
  wall: 'Walls: click to set each corner. Click an existing corner or wall to join it. Esc stops.',
  door: 'Doors: click on a wall to add a door.',
  window: 'Windows: click on a wall to add a window.',
  measure: 'Measure: click two points to add a dimension.',
  ada: 'Turning space: click to place a 60" (1525 mm) circle and see what gets in its way.',
};

export const FloorplanWorkspace = () => {
  const [history, setHistory] = useState<ProjectHistory>(safeInitialHistory);
  const [analysis, setAnalysis] = useState<FloorplanAnalysis>(() => analyzeFloorplan(history.present));
  // The exact geometry the displayed analysis was computed from, compared against the live
  // geometry during render so `data-analysis-state` never claims a stale analysis is current.
  type AnalysedGeometry = readonly [unknown, unknown, unknown, unknown, unknown];
  const geometryOf = (project: FloorplanProject): AnalysedGeometry =>
    [project.vertices, project.walls, project.components, project.roomNames, project.units] as const;
  const [analysedGeometry, setAnalysedGeometry] = useState<AnalysedGeometry>(() => geometryOf(history.present));
  const liveGeometry = geometryOf(history.present);
  const analysisCurrent = analysedGeometry.every((part, index) => part === liveGeometry[index]);
  const [mode, setMode] = useState<FloorplanToolMode>('select');
  const [selectedSymbol, setSelectedSymbol] = useState('sofa-3-seat');
  const [draftStart, setDraftStart] = useState<WallEndpoint>();
  const [measureStart, setMeasureStart] = useState<Point2D>();
  const [pointerWorld, setPointerWorld] = useState<Point2D>();
  const [snapWorld, setSnapWorld] = useState<Point2D>();
  const [draftEnd, setDraftEnd] = useState<Point2D>();
  const [snapping, setSnapping] = useState(true);
  const [spacePressed, setSpacePressed] = useState(false);
  const [status, setStatus] = useState('Pick a tool to start. W draws walls; V selects and moves things.');
  const [pdfSheet, setPdfSheet] = useState<PdfSheet>(() => ((history.present.units ?? 'metric') === 'imperial' ? 'letter' : 'a4'));
  const [pdfScaleChoice, setPdfScaleChoice] = useState<'fit' | 'drawing'>('fit');
  const workerRef = useRef<Worker | undefined>(undefined);
  const requestRef = useRef(0);
  const analysisTimerRef = useRef<number | undefined>(undefined);
  const latestProjectRef = useRef(history.present);
  const idRef = useRef(1);
  const canvasSizeRef = useRef({ width: 800, height: 600 });
  const hoverRef = useRef(false);
  const dragRef = useRef<Drag | undefined>(undefined);
  const supportAskedRef = useRef(false);
  latestProjectRef.current = history.present;

  const project = history.present;
  const units: DisplayUnits = project.units ?? 'metric';
  const len = (mm: number) => formatLength(mm, units);

  const cancelAnalysisFallback = () => {
    if (analysisTimerRef.current === undefined) return;
    window.clearTimeout(analysisTimerRef.current);
    analysisTimerRef.current = undefined;
  };

  const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${idRef.current++}`;
  const openingCount = project.walls.reduce((sum, wall) => sum + wall.openings.length, 0);
  const displayProject = useMemo<FloorplanProject>(() => ({ ...history.present, rooms: analysis.rooms }), [analysis.rooms, history.present]);
  // Derived here rather than read from the worker analysis so that snapping always
  // reflects the geometry just drawn; a lagging round trip would otherwise let a
  // closing click miss an existing corner and silently leave the outline open.
  const snapTargets = useMemo(() => buildSnapTargets(history.present), [history.present]);

  const setPresent = (updater: (current: FloorplanProject) => FloorplanProject) => setHistory((current) => ({ ...current, present: updater(current.present) }));
  const commit = (label: string, updater: (current: FloorplanProject) => FloorplanProject) => setHistory((current) => commitProject(current, label, updater));
  const clearDrafts = () => { setDraftStart(undefined); setDraftEnd(undefined); setMeasureStart(undefined); setSnapWorld(undefined); };

  // --- Page title and description while the tool is open ---------------------
  useEffect(() => {
    const previousTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? null;
    document.title = PAGE_TITLE;
    meta?.setAttribute('content', PAGE_DESCRIPTION);
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.setAttribute('content', previousDescription);
    };
  }, []);

  // --- Geometry worker -------------------------------------------------------
  useEffect(() => {
    try {
      const worker = new Worker(new URL('./floorplan-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<FloorplanWorkerResponse>) => {
        if (event.data.requestId !== requestRef.current) return;
        cancelAnalysisFallback();
        if (event.data.type === 'analysis') { setAnalysis(event.data.analysis); setAnalysedGeometry(geometryOf(latestProjectRef.current)); }
        else { setAnalysis(analyzeFloorplan(latestProjectRef.current)); setAnalysedGeometry(geometryOf(latestProjectRef.current)); }
      };
      worker.onerror = () => {
        if (workerRef.current === worker) workerRef.current = undefined;
        worker.terminate();
        setAnalysis(analyzeFloorplan(latestProjectRef.current));
        setAnalysedGeometry(geometryOf(latestProjectRef.current));
      };
      workerRef.current = worker;
      return () => {
        if (workerRef.current === worker) workerRef.current = undefined;
        worker.terminate();
      };
    } catch {
      workerRef.current = undefined;
      setAnalysis(analyzeFloorplan(latestProjectRef.current));
      return undefined;
    }
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const worker = workerRef.current;
    const current = history.present;
    if (!worker) {
      setAnalysis(analyzeFloorplan(current));
      setAnalysedGeometry(geometryOf(current));
      return undefined;
    }
    worker.postMessage({ type: 'analyze', requestId, project: current });
    cancelAnalysisFallback();
    analysisTimerRef.current = window.setTimeout(() => {
      analysisTimerRef.current = undefined;
      if (requestRef.current !== requestId) return;
      setAnalysis(analyzeFloorplan(current));
      setAnalysedGeometry(geometryOf(current));
    }, ANALYSIS_FALLBACK_MS);
    return cancelAnalysisFallback;
  }, [history.present.vertices, history.present.walls, history.present.components, history.present.roomNames, history.present.units]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(AUTOSAVE_KEY, serializeProject(displayProject)); } catch { /* Local storage may be unavailable. */ }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [displayProject]);

  // --- Snapping --------------------------------------------------------------
  /**
   * Resolves a raw plan point to where it should land: an existing corner, a wall
   * (midpoint or anywhere along its centerline), a component center, or the grid.
   * With Shift the direction locks to 45° steps and the length snaps to the grid.
   * `excludeVertexId` ignores a corner being dragged and the walls attached to it.
   */
  const resolvePoint = (raw: Point2D, shiftKey = false, excludeVertexId?: string): WallEndpoint => {
    const { viewport } = history.present;
    const radius = SNAP_RADIUS_PX / viewport.scale;
    if (draftStart && shiftKey) {
      const constrained = constrainAngle(draftStart.point, raw, 45);
      const length = distance(draftStart.point, constrained);
      const snappedLength = snapping ? Math.round(length / viewport.gridMm) * viewport.gridMm : length;
      const angle = Math.atan2(constrained.y - draftStart.point.y, constrained.x - draftStart.point.x);
      const point = { x: draftStart.point.x + Math.cos(angle) * snappedLength, y: draftStart.point.y + Math.sin(angle) * snappedLength };
      const corner = snapping ? snapTargets.find((target) => target.kind === 'vertex' && target.id !== excludeVertexId && distance(target.point, point) <= radius) : undefined;
      return corner ? { point: corner.point, vertexId: corner.id } : { point };
    }
    if (!snapping) return { point: raw };
    const attachedWalls = new Set(excludeVertexId ? history.present.walls.filter((wall) => wall.startVertexId === excludeVertexId || wall.endVertexId === excludeVertexId).map((wall) => wall.id) : []);
    const candidates = snapTargets
      .filter((target) => target.id !== excludeVertexId && !(target.kind === 'midpoint' && attachedWalls.has(target.id.replace(/:mid$/, ''))))
      .map((target) => ({ target, gap: distance(target.point, raw) }))
      .filter((item) => item.gap <= radius);
    const pick = (kind: string) => candidates.filter((item) => item.target.kind === kind).sort((a, b) => a.gap - b.gap || a.target.id.localeCompare(b.target.id))[0];
    const corner = pick('vertex');
    if (corner) return { point: corner.target.point, vertexId: corner.target.id };
    const midpoint = pick('midpoint');
    if (midpoint) return { point: midpoint.target.point, hostWallId: midpoint.target.id.replace(/:mid$/, '') };
    const others = attachedWalls.size ? { ...history.present, walls: history.present.walls.filter((wall) => !attachedWalls.has(wall.id)) } : history.present;
    const onWall = projectOntoWalls(others, raw);
    if (onWall && onWall.distance <= radius) return { point: onWall.point, hostWallId: onWall.wall.id };
    const component = pick('component');
    if (component) return { point: component.target.point };
    return { point: snapToGrid(raw, viewport.gridMm) };
  };

  // --- Drafting actions ------------------------------------------------------
  const addWallSegment = (endRaw: Point2D, shiftKey: boolean) => {
    const end = resolvePoint(endRaw, shiftKey);
    if (!draftStart) {
      setDraftStart(end); setDraftEnd(end.point);
      setStatus('Start set. Click where the wall ends. Hold Shift for straight 45° lines; Esc stops.');
      return;
    }
    const result = addWall(history.present, draftStart, end, nextId);
    if (!result.ok) { setStatus(result.reason); return; }
    commit('Add wall', () => result.project);
    const length = len(distance(draftStart.point, end.point));
    if (result.joinedExisting) {
      clearDrafts();
      setStatus(`Added a ${length} wall and connected it. Click to start another wall, or press V to select.`);
    } else {
      setDraftStart({ point: end.point, vertexId: result.endVertexId }); setDraftEnd(end.point);
      setStatus(`Added a ${length} wall. Keep clicking to continue, or press Esc to stop.`);
    }
  };

  const addOpening = (point: Point2D, type: 'door_single' | 'window_casement') => {
    const projection = projectOntoWalls(history.present, point);
    const threshold = Math.max(250, 20 / history.present.viewport.scale);
    const noun = type === 'door_single' ? 'door' : 'window';
    if (!projection || projection.distance > threshold) { setStatus(`Click on a wall to place the ${noun}.`); return; }
    const opening: HostedOpening = type === 'door_single'
      ? { id: nextId('door'), type, offsetRatio: projection.ratio, width: 915, nominalHeight: 2032, sillHeight: 0, flipSide: false, flipHand: false }
      : { id: nextId('window'), type, offsetRatio: projection.ratio, width: 1200, nominalHeight: 1200, sillHeight: 900, flipSide: false, flipHand: false };
    const result = placeOpening(history.present, projection.wall.id, projection.ratio, opening);
    if (!result.ok) { setStatus(result.reason); return; }
    commit(`Add ${noun}`, () => result.project);
    setStatus(type === 'door_single'
      ? `Added a ${len(opening.width)} door. Press F to swing it the other way; change its width in Properties.`
      : `Added a ${len(opening.width)} window. Change its width or sill height in Properties.`);
  };

  const addComponent = (point: Point2D, symbolKey = selectedSymbol) => {
    const symbol = getSymbolDefinition(symbolKey); if (!symbol) return;
    const position = snapping ? snapToGrid(point, history.present.viewport.gridMm) : point;
    const layerId = symbol.clearance.adaRuleKey === 'ada_turning_circle' ? 'clearance' : symbol.category === 'mep' ? 'mep' : 'furniture';
    const component: PlanComponent = { id: nextId('component'), category: symbol.category, symbolKey, position, rotation: 0, scale: { x: 1, y: 1 }, layerId, clearance: symbol.clearance };
    commit(`Place ${symbol.label}`, (current) => ({ ...current, components: [...current.components, component], selectedId: component.id }));
    setStatus(`Placed ${symbol.label}. Click to place another, press R to rotate, or V to select.`);
  };

  const selectAt = (raw: Point2D) => {
    const hit = hitTest(history.present, raw, history.present.viewport.scale);
    const id = hit?.kind === 'vertex'
      ? history.present.walls.find((wall) => wall.startVertexId === hit.id || wall.endVertexId === hit.id)?.id
      : hit?.id;
    setHistory((current) => updateSelection(current, id));
  };

  const handleWorldClick = (raw: Point2D, shiftKey: boolean) => {
    if (mode === 'wall') { addWallSegment(raw, shiftKey); return; }
    if (mode === 'door') { addOpening(raw, 'door_single'); return; }
    if (mode === 'window') { addOpening(raw, 'window_casement'); return; }
    if (mode === 'component') { addComponent(raw); return; }
    if (mode === 'ada') { addComponent(raw, 'ada-turning-circle'); return; }
    if (mode === 'measure') {
      const resolved = resolvePoint(raw, shiftKey).point;
      if (!measureStart) { setMeasureStart(resolved); setDraftStart({ point: resolved }); setDraftEnd(resolved); setStatus('First point set. Click the second point.'); return; }
      if (distance(measureStart, resolved) < 1) { setStatus('Click a second point away from the first.'); return; }
      const dimension: FloorplanDimension = { id: nextId('dimension'), start: measureStart, end: resolved, layerId: 'dimensions' };
      commit('Add dimension', (current) => ({ ...current, dimensions: [...current.dimensions, dimension], selectedId: dimension.id }));
      clearDrafts();
      setStatus(`Added a ${len(distance(measureStart, resolved))} dimension.`);
      return;
    }
    selectAt(raw);
  };

  const handleWorldMove = (raw: Point2D, shiftKey: boolean) => {
    setPointerWorld(raw);
    if (mode === 'select') { setSnapWorld(undefined); return; }
    const resolved = resolvePoint(raw, shiftKey);
    setSnapWorld(resolved.vertexId || resolved.hostWallId ? resolved.point : undefined);
    if (draftStart) setDraftEnd(resolved.point);
  };

  // --- Dragging (Select tool) ------------------------------------------------
  const handleDragStart = (world: Point2D) => {
    const current = history.present;
    const hit = hitTest(current, world, current.viewport.scale);
    if (hit?.kind === 'component') {
      const component = current.components.find((item) => item.id === hit.id)!;
      dragRef.current = { kind: 'component', id: hit.id, before: current, offset: { x: world.x - component.position.x, y: world.y - component.position.y }, moved: false };
      setHistory((state) => updateSelection(state, hit.id));
      return true;
    }
    if (hit?.kind === 'vertex') {
      dragRef.current = { kind: 'vertex', id: hit.id, before: current, moved: false };
      const wall = current.walls.find((item) => item.startVertexId === hit.id || item.endVertexId === hit.id);
      setHistory((state) => updateSelection(state, wall?.id));
      return true;
    }
    return false;
  };

  const handleDragMove = (world: Point2D) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.moved = true;
    if (drag.kind === 'component') {
      const target = { x: world.x - drag.offset.x, y: world.y - drag.offset.y };
      const position = snapping ? snapToGrid(target, history.present.viewport.gridMm) : target;
      setPresent((current) => ({ ...current, components: current.components.map((item) => (item.id === drag.id ? { ...item, position } : item)) }));
      setStatus(`Moving to ${len(position.x)}, ${len(position.y)}. Release to drop.`);
      return;
    }
    const resolved = resolvePoint(world, false, drag.id);
    drag.last = resolved;
    setSnapWorld(resolved.vertexId || resolved.hostWallId ? resolved.point : undefined);
    setPresent((current) => moveVertex(current, drag.id, resolved.point));
    setStatus(resolved.vertexId ? 'Release to join these corners.' : resolved.hostWallId ? 'Release to connect this corner to the wall.' : 'Moving corner. Release to drop.');
  };

  const handleDragEnd = () => {
    const drag = dragRef.current;
    dragRef.current = undefined;
    setSnapWorld(undefined);
    if (!drag?.moved) return;
    if (drag.kind === 'vertex') {
      const last = drag.last;
      if (last?.vertexId && last.vertexId !== drag.id) {
        const into = last.vertexId;
        setPresent((current) => mergeVertex(current, drag.id, into));
      } else if (last?.hostWallId) {
        const junctionId = nextId('vertex');
        const newWallId = nextId('wall');
        const host = last.hostWallId;
        setPresent((current) => mergeVertex(splitWall(current, host, last.point, junctionId, newWallId), drag.id, junctionId));
      }
      setStatus('Corner moved. Undo puts it back.');
    } else {
      setStatus('Moved. Undo puts it back.');
    }
    setHistory((current) => commitFrom(current, drag.kind === 'vertex' ? 'Move corner' : 'Move item', drag.before));
  };

  // --- Selection actions -----------------------------------------------------
  const deleteSelected = () => {
    const selectedId = history.present.selectedId;
    const next = selectedId ? deleteSelection(history.present, selectedId) : undefined;
    if (!next) { setStatus('Select something first, then press Delete.'); return; }
    commit('Delete', () => next);
    setStatus('Deleted. Undo brings it back.');
  };

  const rotateSelected = () => {
    const id = history.present.selectedId;
    if (!id || !history.present.components.some((component) => component.id === id)) { setStatus('Select a piece of furniture or a fixture to rotate it.'); return; }
    commit('Rotate', (current) => ({ ...current, components: current.components.map((component) => (component.id === id ? { ...component, rotation: (component.rotation + 90) % 360 } : component)) }));
  };

  const flipSelected = () => {
    const id = history.present.selectedId;
    const wall = history.present.walls.find((item) => item.openings.some((opening) => opening.id === id && opening.type.startsWith('door')));
    if (!wall) { setStatus('Select a door to flip its swing.'); return; }
    commit('Flip door', (current) => ({ ...current, walls: current.walls.map((item) => (item.id === wall.id ? { ...item, openings: item.openings.map((opening) => (opening.id === id ? { ...opening, flipSide: !opening.flipSide } : opening)) } : item)) }));
  };

  const duplicateSelected = () => {
    const id = history.present.selectedId;
    const offset = Math.max(history.present.viewport.gridMm, 300);
    const next = id ? duplicateComponent(history.present, id, nextId('component'), offset) : undefined;
    if (!next) { setStatus('Select a piece of furniture or a fixture to duplicate it.'); return; }
    commit('Duplicate', () => next);
    setStatus('Duplicated. Drag the copy where you want it.');
  };

  const nudgeSelected = (dx: number, dy: number) => {
    const id = history.present.selectedId;
    if (!id || !history.present.components.some((component) => component.id === id)) return false;
    commit('Nudge', (current) => ({ ...current, components: current.components.map((component) => (component.id === id ? { ...component, position: { x: component.position.x + dx, y: component.position.y + dy } } : component)) }));
    return true;
  };

  const activateMode = (nextMode: FloorplanToolMode, symbolKey = selectedSymbol) => {
    setMode(nextMode); clearDrafts();
    setStatus(nextMode === 'component' ? `Click in the plan to place a ${getSymbolDefinition(symbolKey)?.label ?? 'component'}.` : MODE_HELP[nextMode]);
  };

  const undo = () => { clearDrafts(); setHistory((current) => undoState(current)); };
  const redo = () => { clearDrafts(); setHistory((current) => redoState(current)); };

  // --- View ------------------------------------------------------------------
  const handlePan = (dx: number, dy: number) => setPresent((current) => ({ ...current, viewport: { ...current.viewport, panX: current.viewport.panX + dx, panY: current.viewport.panY + dy } }));
  const handleZoomAt = (screen: Point2D, factor: number) => setPresent((current) => {
    const anchor = screenToWorld(screen, current.viewport); const scale = clampZoom(current.viewport.scale * factor);
    return { ...current, viewport: { ...current.viewport, scale, panX: screen.x - anchor.x * scale, panY: screen.y - anchor.y * scale } };
  });
  const zoomAtCenter = (factor: number) => handleZoomAt({ x: canvasSizeRef.current.width / 2, y: canvasSizeRef.current.height / 2 }, factor);

  const fitToDrawing = (target: FloorplanProject = history.present) => {
    const points: Point2D[] = [
      ...target.vertices.map((vertex) => vertex.position),
      ...target.dimensions.flatMap((dimension) => [dimension.start, dimension.end]),
      ...target.components.flatMap((component) => {
        const footprint = componentFootprint(component);
        return footprint.kind === 'circle'
          ? [{ x: footprint.center.x - footprint.radius, y: footprint.center.y - footprint.radius }, { x: footprint.center.x + footprint.radius, y: footprint.center.y + footprint.radius }]
          : [...footprint.points];
      }),
    ];
    const { width, height } = canvasSizeRef.current;
    if (points.length === 0) {
      setPresent((current) => ({ ...current, viewport: { ...current.viewport, scale: 0.1, panX: 120, panY: 120 } }));
      return;
    }
    const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y));
    const margin = 60;
    const scale = clampZoom(Math.min((width - margin * 2) / Math.max(1, maxX - minX), (height - margin * 2) / Math.max(1, maxY - minY)));
    const panX = width / 2 - ((minX + maxX) / 2) * scale;
    const panY = height / 2 - ((minY + maxY) / 2) * scale;
    setPresent((current) => ({ ...current, viewport: { ...current.viewport, scale, panX, panY } }));
  };

  // --- Keyboard --------------------------------------------------------------
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.metaKey || event.ctrlKey) {
        if (event.altKey) return;
        if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
        else if (key === 'y') { event.preventDefault(); redo(); }
        else if (key === 'd') { event.preventDefault(); duplicateSelected(); }
        // Every other Ctrl/Cmd shortcut (copy, reload, find...) belongs to the browser.
        return;
      }
      if (event.altKey) return;
      const canvasFocused = event.target instanceof HTMLElement && event.target.dataset.testid === 'floorplan-overlay';
      const onCanvas = canvasFocused || (hoverRef.current && (event.target === document.body || event.target === null));
      if (event.code === 'Space') {
        // Space pans only over the drawing; elsewhere it must still press buttons and scroll the page.
        if (!onCanvas) return;
        event.preventDefault(); setSpacePressed(true); return;
      }
      const arrows: Record<string, readonly [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      const arrow = arrows[key];
      if (arrow) {
        const step = history.present.viewport.gridMm * (event.shiftKey ? 10 : 1);
        if (nudgeSelected(arrow[0] * step, arrow[1] * step)) { event.preventDefault(); return; }
        if (canvasFocused) { event.preventDefault(); handlePan(-arrow[0] * 48, -arrow[1] * 48); }
        return;
      }
      if (key === 'escape') {
        if (draftStart || measureStart) { clearDrafts(); setStatus(mode === 'wall' ? 'Stopped. Click to start a new wall, or press V to select.' : 'Cancelled.'); return; }
        if (history.present.selectedId) { setHistory((current) => updateSelection(current, undefined)); return; }
        activateMode('select');
        return;
      }
      if (key === 'w') activateMode('wall');
      else if (key === 'd') activateMode('door');
      else if (key === 'n') activateMode('window');
      else if (key === 'm') activateMode('measure');
      else if (key === 'v') activateMode('select');
      else if (key === 'r') rotateSelected();
      else if (key === 'f') flipSelected();
      else if (key === '0') fitToDrawing();
      else if (key === '=' || key === '+') zoomAtCenter(1.2);
      else if (key === '-') zoomAtCenter(1 / 1.2);
      else if (key === 'delete' || key === 'backspace') { event.preventDefault(); deleteSelected(); }
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpacePressed(false); };
    const blur = () => setSpacePressed(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  });

  // --- Export and backup -----------------------------------------------------
  const safeName = (project.name.trim() || 'plan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'plan';
  const exported = (filename: string) => {
    setStatus(`Saved ${filename} to your downloads.`);
    if (!supportAskedRef.current) {
      supportAskedRef.current = true;
      requestSupportPrompt({ key: 'plancraft-export', message: 'Your floor plan export is ready. PlanCraft is free and runs on your device; if it saved you time, you can chip in to keep it going.' });
    }
  };
  const exportSvgFile = () => { const filename = `${safeName}.svg`; downloadText(exportSvg(displayProject), filename, 'image/svg+xml;charset=utf-8'); exported(filename); };
  const exportDxfFile = (version: 'r12' | 'r2000') => { const filename = `${safeName}-${version}.dxf`; downloadText(exportDxf(displayProject, version), filename, 'application/dxf'); exported(filename); };
  const exportPdfFile = async () => {
    try {
      const pdfScale = pdfScaleChoice === 'fit' ? 'fit' : pdfScaleFromNotation(displayProject.scaleNotation);
      const bytes = await exportPdf(displayProject, pdfSheet, { pdfScale });
      const filename = `${safeName}-${pdfSheet}.pdf`;
      downloadBytes(bytes, filename, 'application/pdf');
      exported(filename);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The PDF could not be created. Try "Fit to page".');
    }
  };
  const backupJson = () => { const filename = `${safeName}.plancraft.json`; downloadText(serializeProject(displayProject), filename, 'application/json;charset=utf-8'); exported(filename); };
  const restoreJson = async (file?: File) => {
    if (!file) return;
    try {
      const restored = parseProjectJson(await file.text());
      clearDrafts();
      commit('Open backup', () => restored);
      fitToDrawing(restored);
      setStatus(`Opened ${file.name}. Undo returns to the plan you had before.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'That backup could not be opened.');
    }
  };
  const newPlan = () => {
    clearDrafts(); setMode('select');
    commit('Start a new plan', (current) => ({ ...createInitialProject('Untitled Plan').present, units: current.units, viewport: current.viewport }));
    setStatus('Started a new plan. Undo (Ctrl+Z) brings the previous one back.');
  };

  // --- Inspector edits -------------------------------------------------------
  const updateWall = (id: string, patch: Partial<WallSegment>) => commit('Edit wall', (current) => ({ ...current, walls: current.walls.map((wall) => (wall.id === id ? { ...wall, ...patch } : wall)) }));
  const setWallLength = (id: string, lengthMm: number) => commit('Change wall length', (current) => {
    const wall = current.walls.find((item) => item.id === id);
    const start = wall && current.vertices.find((vertex) => vertex.id === wall.startVertexId)?.position;
    const end = wall && current.vertices.find((vertex) => vertex.id === wall.endVertexId)?.position;
    if (!wall || !start || !end) return current;
    const length = distance(start, end) || 1;
    return moveVertex(current, wall.endVertexId, { x: start.x + (end.x - start.x) / length * lengthMm, y: start.y + (end.y - start.y) / length * lengthMm });
  });
  const updateOpening = (wallId: string, openingId: string, patch: Partial<HostedOpening>) => {
    const wall = history.present.walls.find((item) => item.id === wallId);
    const opening = wall?.openings.find((item) => item.id === openingId);
    if (!wall || !opening) return;
    const result = placeOpening(history.present, wallId, opening.offsetRatio, { ...opening, ...patch });
    if (!result.ok) { setStatus(result.reason); return; }
    commit('Edit opening', () => result.project);
  };
  const setOpeningOffset = (wallId: string, openingId: string, fromStartMm: number) => {
    const wall = history.present.walls.find((item) => item.id === wallId);
    const opening = wall?.openings.find((item) => item.id === openingId);
    const start = wall && history.present.vertices.find((vertex) => vertex.id === wall.startVertexId)?.position;
    const end = wall && history.present.vertices.find((vertex) => vertex.id === wall.endVertexId)?.position;
    if (!wall || !opening || !start || !end) return;
    const result = placeOpening(history.present, wallId, fromStartMm / (distance(start, end) || 1), opening);
    if (!result.ok) { setStatus(result.reason); return; }
    commit('Move opening', () => result.project);
  };
  const updateComponent = (id: string, patch: Partial<PlanComponent>) => commit('Edit item', (current) => ({ ...current, components: current.components.map((component) => (component.id === id ? { ...component, ...patch } : component)) }));
  const updateDimension = (id: string, patch: Partial<FloorplanDimension>) => commit('Edit dimension', (current) => ({ ...current, dimensions: current.dimensions.map((dimension) => (dimension.id === id ? { ...dimension, ...patch } : dimension)) }));
  const updateMeta = (patch: Partial<Pick<FloorplanProject, 'name' | 'author' | 'scaleNotation' | 'units'>>) => {
    commit('Edit plan settings', (current) => {
      const next = { ...current, ...patch };
      // Switching units keeps the grid sensible: pick the closest grid from the new unit system.
      if (patch.units && patch.units !== (current.units ?? 'metric')) {
        const choices = GRID_CHOICES[patch.units];
        const closest = choices.reduce((best, [value]) => (Math.abs(value - current.viewport.gridMm) < Math.abs(best - current.viewport.gridMm) ? value : best), choices[0]![0]);
        return { ...next, viewport: { ...current.viewport, gridMm: closest } };
      }
      return next;
    });
  };
  const renameRoom = (key: string, name: string) => commit('Rename room', (current) => {
    const names = { ...(current.roomNames ?? {}) };
    if (name.trim()) names[key] = name.trim(); else delete names[key];
    return { ...current, roomNames: names };
  });
  const toggleLayer = (id: string, visible: boolean) => setPresent((current) => ({ ...current, layers: current.layers.map((layer) => (layer.id === id ? { ...layer, visible } : layer)) }));

  const categories = [['living', 'Living'], ['bedroom', 'Bedroom'], ['dining', 'Dining'], ['kitchen_bath', 'Kitchen & bath'], ['office', 'Office & storage'], ['mep', 'Electrical & mechanical']] as const;
  const totalArea = analysis.rooms.reduce((sum, room) => sum + room.areaSqMeters, 0);
  const gridChoices = GRID_CHOICES[units].some(([value]) => value === project.viewport.gridMm)
    ? GRID_CHOICES[units]
    : [...GRID_CHOICES[units], [project.viewport.gridMm, len(project.viewport.gridMm)] as const];

  return (
    <div className="plancraft" data-testid="floorplan-studio" data-analysis-state={analysisCurrent ? 'current' : 'pending'}>
      <header className="plancraft-toolbar">
        <div><strong>{project.name || 'PlanCraft Studio'}</strong><span aria-live="off">{pointerWorld ? `X ${len(pointerWorld.x)} · Y ${len(pointerWorld.y)} · ` : ''}Zoom {(project.viewport.scale * 1000).toFixed(0)}%</span></div>
        <div className="plancraft-toolbar-actions">
          <button type="button" className="plancraft-button" disabled={!history.past.length} onClick={undo} title="Ctrl+Z">Undo</button>
          <button type="button" className="plancraft-button" disabled={!history.future.length} onClick={redo} title="Ctrl+Y">Redo</button>
          <label className="plancraft-check"><input type="checkbox" checked={snapping} onChange={(event) => setSnapping(event.target.checked)} /> Snap to corners, walls &amp; grid</label>
          <label>Grid <select value={project.viewport.gridMm} onChange={(event) => setPresent((current) => ({ ...current, viewport: { ...current.viewport, gridMm: Number(event.target.value) } }))}>{gridChoices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </header>

      <div className="plancraft-exportbar" aria-label="Export controls">
        <button type="button" className="plancraft-button" onClick={exportSvgFile}>Export SVG</button>
        <button type="button" className="plancraft-button" onClick={() => exportDxfFile('r12')}>Export DXF R12</button>
        <button type="button" className="plancraft-button" onClick={() => exportDxfFile('r2000')}>Export DXF R2000</button>
        <span className="plancraft-pdf-group">
          <label>PDF sheet <select value={pdfSheet} onChange={(event) => setPdfSheet(event.target.value as PdfSheet)}>{(Object.keys(PDF_SHEET_LABELS) as PdfSheet[]).map((sheet) => <option key={sheet} value={sheet}>{PDF_SHEET_LABELS[sheet]}</option>)}</select></label>
          <label>PDF scale <select value={pdfScaleChoice} onChange={(event) => setPdfScaleChoice(event.target.value as 'fit' | 'drawing')}><option value="fit">Fit to page</option><option value="drawing">At {project.scaleNotation}</option></select></label>
          <button type="button" className="plancraft-button" onClick={() => void exportPdfFile()}>Export PDF</button>
        </span>
        <button type="button" className="plancraft-button" onClick={backupJson}>Backup JSON</button>
        <label className="plancraft-file-button">Restore JSON<input type="file" accept="application/json,.json" onChange={(event) => consumeFileInput(event.target, () => restoreJson(event.target.files?.[0]))} /></label>
        <a className="plancraft-coffee" href={SUPPORT_URL} target="_blank" rel="noreferrer">☕ Buy me a coffee</a>
      </div>

      <div className="plancraft-shell">
        <section className="plancraft-toolbox" aria-label="Drafting tools">
          <div className="plancraft-panel-heading"><span>Drafting tools</span></div>
          <div className="plancraft-tool-grid">
            <button type="button" aria-pressed={mode === 'select'} onClick={() => activateMode('select')}>Select &amp; Transform <kbd>V</kbd></button>
            <button type="button" aria-pressed={mode === 'wall'} onClick={() => activateMode('wall')}>Continuous Wall <kbd>W</kbd></button>
            <button type="button" aria-pressed={mode === 'door'} onClick={() => activateMode('door')}>Parametric Door <kbd>D</kbd></button>
            <button type="button" aria-pressed={mode === 'window'} onClick={() => activateMode('window')}>Window Cutout <kbd>N</kbd></button>
            <button type="button" aria-pressed={mode === 'measure'} onClick={() => activateMode('measure')}>Dimension Tape <kbd>M</kbd></button>
            <button type="button" aria-pressed={mode === 'ada'} onClick={() => activateMode('ada')}>ADA 60&quot; Circle</button>
          </div>
        </section>

        <section className="plancraft-stage" aria-label="Floor plan viewport">
          <div className="plancraft-hud" aria-hidden="true">
            <span>Scale {project.scaleNotation}</span><span>Grid {len(project.viewport.gridMm)}</span><span>Snap {snapping ? 'on' : 'off'}</span>
          </div>
          <FloorplanCanvas
            project={displayProject}
            analysis={analysis}
            mode={mode}
            pointerWorld={pointerWorld}
            snapWorld={snapWorld}
            draftStart={draftStart?.point}
            draftEnd={draftEnd}
            spacePressed={spacePressed}
            onWorldMove={handleWorldMove}
            onWorldClick={handleWorldClick}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onPan={handlePan}
            onZoomAt={handleZoomAt}
            onFit={() => fitToDrawing()}
            onHoverChange={(inside) => { hoverRef.current = inside; if (!inside) setPointerWorld(undefined); }}
            onResize={(width, height) => { canvasSizeRef.current = { width, height }; }}
          />
          <div className="plancraft-status">
            <span role="status" aria-live="polite">{status}</span>
            <span className="plancraft-hint-pointer">Shift locks angles · Space + drag or drag empty space to pan · Scroll to zoom · 0 fits the plan</span>
            <span className="plancraft-hint-touch">Tap to place · Drag with one finger to pan · Pinch to zoom · Drag furniture or corners with Select</span>
          </div>
          <div className="plancraft-summary" aria-label="Plan summary">
            <div><span>Walls</span><strong data-testid="wall-count">{project.walls.length}</strong></div>
            <div><span>Rooms</span><strong data-testid="room-count">{analysis.rooms.length}</strong></div>
            <div><span>Doors &amp; windows</span><strong data-testid="opening-count">{openingCount}</strong></div>
            <div><span>Items</span><strong data-testid="component-count">{project.components.length}</strong></div>
            <div><span>Floor area</span><strong>{formatArea(totalArea, units)}</strong></div>
          </div>
        </section>

        <aside className="plancraft-library" aria-label="Furniture and fixtures">
          <div className="plancraft-panel-heading"><span>Furniture &amp; fixtures</span><strong>{COMPONENT_LIBRARY.length - 1} items</strong></div>
          {categories.map(([category, title]) => (
            <details key={category} open={category === 'living'}>
              <summary>{title}</summary>
              <div className="plancraft-symbol-grid">{COMPONENT_LIBRARY.filter((symbol) => symbol.category === category && symbol.key !== 'ada-turning-circle').map((symbol) => (
                <button type="button" key={symbol.key} aria-pressed={mode === 'component' && selectedSymbol === symbol.key} title={`${symbol.label} · ${len(symbol.width)} × ${len(symbol.depth)}`} onClick={() => { setSelectedSymbol(symbol.key); activateMode('component', symbol.key); }}>{symbol.label}</button>
              ))}</div>
            </details>
          ))}
        </aside>

        <FloorplanInspector
          project={displayProject}
          analysis={analysis}
          onProjectMeta={updateMeta}
          onWallUpdate={updateWall}
          onWallLength={setWallLength}
          onOpeningUpdate={updateOpening}
          onOpeningOffset={setOpeningOffset}
          onComponentUpdate={updateComponent}
          onDimensionUpdate={updateDimension}
          onDeleteSelected={deleteSelected}
          onDuplicateSelected={duplicateSelected}
          onRotateSelected={rotateSelected}
          onToggleLayer={toggleLayer}
          onRoomRename={renameRoom}
          onSelect={(id) => setHistory((current) => updateSelection(current, id))}
          onNewPlan={newPlan}
        />
      </div>

      <p className="plancraft-disclaimer">Clearance and ADA indicators are planning aids, not code-compliance certification. Verify final drawings against the codes and standards governing the project.</p>
    </div>
  );
};

export default FloorplanWorkspace;
