import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import { analyzeFloorplan, type FloorplanAnalysis } from './floorplan-analysis';
import FloorplanCanvas, { type FloorplanToolMode } from './FloorplanCanvas';
import FloorplanInspector from './FloorplanInspector';
import { constrainAngle, clampZoom, screenToWorld, snapToGrid } from './geometry-engine';
import { exportDxf, exportPdf, exportSvg, serializeProject } from './export-engine';
import { COMPONENT_LIBRARY, getSymbolDefinition } from './symbol-library';
import { commitProject, createInitialProject, loadProject, redoState, undoState, updateSelection } from './state-engine';
import type { FloorplanProject, HostedOpening, PlanComponent, Point2D, ProjectHistory, WallSegment, WallVertex } from './floorplan-types';
import type { FloorplanWorkerResponse } from './floorplan-worker';

const AUTOSAVE_KEY = 'inmotools_plancraft_autosave';
const COFFEE_URL = 'https://buymeacoffee.com/aahplexx';

const safeInitialHistory = (): ProjectHistory => {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (raw) {
      const project = JSON.parse(raw) as FloorplanProject;
      if (project.schemaVersion === 1 && Array.isArray(project.vertices) && Array.isArray(project.walls)) return loadProject(project);
    }
  } catch { /* Invalid local recovery data falls back to a blank project. */ }
  return createInitialProject('Untitled Plan');
};

const nearestWallProjection = (project: FloorplanProject, point: Point2D) => {
  const vertices = new Map(project.vertices.map((vertex) => [vertex.id, vertex.position]));
  let best: { wall: WallSegment; ratio: number; point: Point2D; distance: number } | undefined;
  for (const wall of project.walls) {
    const start = vertices.get(wall.startVertexId); const end = vertices.get(wall.endVertexId); if (!start || !end) continue;
    const dx = end.x - start.x; const dy = end.y - start.y; const lengthSq = dx * dx + dy * dy || 1;
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
    const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (!best || distance < best.distance) best = { wall, ratio, point: projected, distance };
  }
  return best;
};

const selectedOpening = (project: FloorplanProject) => project.walls
  .flatMap((wall) => wall.openings.map((opening) => ({ wall, opening })))
  .find(({ opening }) => opening.id === project.selectedId);

const isTypingTarget = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);

export const FloorplanWorkspace = () => {
  const [history, setHistory] = useState<ProjectHistory>(safeInitialHistory);
  const [analysis, setAnalysis] = useState<FloorplanAnalysis>(() => analyzeFloorplan(history.present));
  const [mode, setMode] = useState<FloorplanToolMode>('select');
  const [selectedSymbol, setSelectedSymbol] = useState('sofa-3-seat');
  const [draftStart, setDraftStart] = useState<{ point: Point2D; vertexId?: string }>();
  const [measureStart, setMeasureStart] = useState<Point2D>();
  const [pointerWorld, setPointerWorld] = useState<Point2D>();
  const [snapWorld, setSnapWorld] = useState<Point2D>();
  const [draftEnd, setDraftEnd] = useState<Point2D>();
  const [snapping, setSnapping] = useState(true);
  const [spacePressed, setSpacePressed] = useState(false);
  const [status, setStatus] = useState('Ready. W draws walls; V returns to selection.');
  const [exportNote, setExportNote] = useState('');
  const workerRef = useRef<Worker | undefined>(undefined);
  const requestRef = useRef(0);
  const acceptedRequestRef = useRef(0);
  const idRef = useRef(1);

  const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${idRef.current++}`;
  const openingCount = history.present.walls.reduce((sum, wall) => sum + wall.openings.length, 0);
  const displayProject = useMemo<FloorplanProject>(() => ({ ...history.present, rooms: analysis.rooms }), [analysis.rooms, history.present]);

  const setPresent = (updater: (project: FloorplanProject) => FloorplanProject) => setHistory((current) => ({ ...current, present: updater(current.present) }));
  const commit = (label: string, updater: (project: FloorplanProject) => FloorplanProject) => setHistory((current) => commitProject(current, label, updater));

  useEffect(() => {
    try {
      const worker = new Worker(new URL('./floorplan-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<FloorplanWorkerResponse>) => {
        if (event.data.requestId < acceptedRequestRef.current) return;
        if (event.data.type === 'analysis') { acceptedRequestRef.current = event.data.requestId; setAnalysis(event.data.analysis); }
        else setStatus(`Geometry worker: ${event.data.message}`);
      };
      worker.onerror = () => setAnalysis(analyzeFloorplan(history.present));
      workerRef.current = worker;
      return () => worker.terminate();
    } catch {
      workerRef.current = undefined;
      return undefined;
    }
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const worker = workerRef.current;
    if (worker) worker.postMessage({ type: 'analyze', requestId, project: history.present });
    else setAnalysis(analyzeFloorplan(history.present));
  }, [history.present.vertices, history.present.walls, history.present.components]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(AUTOSAVE_KEY, serializeProject(displayProject)); } catch { /* Local storage may be unavailable. */ }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [displayProject]);

  const resolvePoint = (raw: Point2D, shiftKey = false) => {
    let point = draftStart && shiftKey ? constrainAngle(draftStart.point, raw, 45) : raw;
    const radius = 15 / history.present.viewport.scale;
    const nearest = snapping ? analysis.snapTargets
      .map((target) => ({ target, distance: Math.hypot(target.point.x - point.x, target.point.y - point.y) }))
      .filter((item) => item.distance <= radius)
      .sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id))[0] : undefined;
    if (nearest) return { point: nearest.target.point, vertexId: nearest.target.kind === 'vertex' ? nearest.target.id : undefined };
    point = snapToGrid(point, history.present.viewport.gridMm);
    return { point };
  };

  const addWallSegment = (endRaw: Point2D, shiftKey: boolean) => {
    const endResolved = resolvePoint(endRaw, shiftKey);
    if (!draftStart) { setDraftStart(endResolved); setDraftEnd(endResolved.point); setStatus('Wall start fixed. Choose the next point.'); return; }
    if (Math.hypot(endResolved.point.x - draftStart.point.x, endResolved.point.y - draftStart.point.y) < 1) return;
    const wallId = nextId('wall');
    const startId = draftStart.vertexId ?? nextId('vertex');
    const endId = endResolved.vertexId ?? nextId('vertex');
    commit('add wall', (project) => {
      const existing = new Map(project.vertices.map((vertex) => [vertex.id, vertex]));
      const updated = new Map(existing);
      const attach = (id: string, point: Point2D) => {
        const current = updated.get(id);
        updated.set(id, current ? { ...current, connectedWallIds: [...new Set([...current.connectedWallIds, wallId])] } : { id, position: point, connectedWallIds: [wallId] });
      };
      attach(startId, draftStart.point); attach(endId, endResolved.point);
      const wall: WallSegment = { id: wallId, startVertexId: startId, endVertexId: endId, thickness: 150, height: 2700, state: 'new_construction', material: 'drywall_stud', isLoadBearing: false, openings: [] };
      return { ...project, vertices: [...updated.values()], walls: [...project.walls, wall], selectedId: wallId };
    });
    setDraftStart({ point: endResolved.point, vertexId: endId });
    setDraftEnd(endResolved.point);
    setStatus(`Added ${Math.round(Math.hypot(endResolved.point.x - draftStart.point.x, endResolved.point.y - draftStart.point.y))} mm wall segment.`);
  };

  const addOpening = (point: Point2D, type: 'door_single' | 'window_casement') => {
    const projection = nearestWallProjection(history.present, point);
    const threshold = Math.max(250, 20 / history.present.viewport.scale);
    if (!projection || projection.distance > threshold) { setStatus('Move closer to a wall centerline to host the opening.'); return; }
    const opening: HostedOpening = type === 'door_single'
      ? { id: nextId('door'), type, offsetRatio: projection.ratio, width: 915, nominalHeight: 2032, sillHeight: 0, flipSide: false, flipHand: false }
      : { id: nextId('window'), type, offsetRatio: projection.ratio, width: 1200, nominalHeight: 1200, sillHeight: 900, flipSide: false, flipHand: false };
    commit(`add ${type}`, (project) => ({ ...project, walls: project.walls.map((wall) => wall.id === projection.wall.id ? { ...wall, openings: [...wall.openings, opening] } : wall), selectedId: opening.id }));
    setStatus(`${type.startsWith('door') ? 'Door' : 'Window'} hosted on ${projection.wall.id}.`);
  };

  const addComponent = (point: Point2D, symbolKey = selectedSymbol) => {
    const symbol = getSymbolDefinition(symbolKey); if (!symbol) return;
    const component: PlanComponent = { id: nextId('component'), category: symbol.category, symbolKey, position: snapToGrid(point, history.present.viewport.gridMm), rotation: 0, scale: { x: 1, y: 1 }, layerId: symbol.category === 'mep' ? 'mep' : 'furniture', clearance: symbol.clearance };
    commit('place component', (project) => ({ ...project, components: [...project.components, component], selectedId: component.id }));
    setStatus(`Placed ${symbol.label}.`);
  };

  const addAdaCircle = (point: Point2D) => {
    const component: PlanComponent = { id: nextId('ada'), category: 'office', symbolKey: 'ada-turning-circle', position: snapToGrid(point, history.present.viewport.gridMm), rotation: 0, scale: { x: 1, y: 1 }, layerId: 'clearance', clearance: { shape: 'circle', dimensions: { x: 1525, y: 1525 }, bufferOffset: 0, adaRuleKey: 'ada_turning_circle' } };
    commit('place ADA turning circle', (project) => ({ ...project, components: [...project.components, component], selectedId: component.id }));
    setStatus('Placed 1525 mm ADA turning-space planning guide.');
  };

  const handleWorldClick = (raw: Point2D, shiftKey: boolean) => {
    if (mode === 'wall') { addWallSegment(raw, shiftKey); return; }
    if (mode === 'door') { addOpening(raw, 'door_single'); return; }
    if (mode === 'window') { addOpening(raw, 'window_casement'); return; }
    if (mode === 'component') { addComponent(raw); return; }
    if (mode === 'ada') { addAdaCircle(raw); return; }
    if (mode === 'measure') {
      const resolved = resolvePoint(raw, shiftKey).point;
      if (!measureStart) { setMeasureStart(resolved); setDraftStart({ point: resolved }); setStatus('Measurement start fixed. Choose the end point.'); return; }
      const id = nextId('dimension');
      commit('add dimension', (project) => ({ ...project, dimensions: [...project.dimensions, { id, start: measureStart, end: resolved, layerId: 'dimensions' }], selectedId: id }));
      setMeasureStart(undefined); setDraftStart(undefined); setDraftEnd(undefined); setStatus('Dimension added.'); return;
    }
    const component = [...history.present.components].sort((a, b) => Math.hypot(a.position.x - raw.x, a.position.y - raw.y) - Math.hypot(b.position.x - raw.x, b.position.y - raw.y))[0];
    const projection = nearestWallProjection(history.present, raw);
    const radius = 20 / history.present.viewport.scale;
    if (component && Math.hypot(component.position.x - raw.x, component.position.y - raw.y) <= Math.max(radius, 350)) setHistory((current) => updateSelection(current, component.id));
    else if (projection && projection.distance <= Math.max(radius, 250)) setHistory((current) => updateSelection(current, projection.wall.id));
    else setHistory((current) => updateSelection(current, undefined));
  };

  const handleWorldMove = (raw: Point2D, shiftKey: boolean) => {
    const resolved = resolvePoint(raw, shiftKey);
    setPointerWorld(raw); setSnapWorld(resolved.vertexId || snapping ? resolved.point : undefined);
    if (draftStart) setDraftEnd(resolved.point);
  };

  const deleteSelected = () => {
    const selectedId = history.present.selectedId; if (!selectedId) return;
    commit('delete selection', (project) => {
      const wall = project.walls.find((item) => item.id === selectedId);
      if (wall) {
        const walls = project.walls.filter((item) => item.id !== wall.id);
        const used = new Set(walls.flatMap((item) => [item.startVertexId, item.endVertexId]));
        return { ...project, walls, vertices: project.vertices.filter((vertex) => used.has(vertex.id)), selectedId: undefined };
      }
      if (project.components.some((component) => component.id === selectedId)) return { ...project, components: project.components.filter((component) => component.id !== selectedId), selectedId: undefined };
      if (selectedOpening(project)) return { ...project, walls: project.walls.map((item) => ({ ...item, openings: item.openings.filter((opening) => opening.id !== selectedId) })), selectedId: undefined };
      return project;
    });
  };

  const rotateSelected = () => {
    const id = history.present.selectedId; if (!id) return;
    commit('rotate selection', (project) => ({ ...project, components: project.components.map((component) => component.id === id ? { ...component, rotation: (component.rotation + 90) % 360 } : component) }));
  };

  const flipSelected = () => {
    const entry = selectedOpening(history.present); if (!entry) return;
    commit('flip opening', (project) => ({ ...project, walls: project.walls.map((wall) => wall.id === entry.wall.id ? { ...wall, openings: wall.openings.map((opening) => opening.id === entry.opening.id ? { ...opening, flipSide: !opening.flipSide } : opening) } : wall) }));
  };

  const activateMode = (nextMode: FloorplanToolMode) => { setMode(nextMode); setDraftStart(undefined); setDraftEnd(undefined); setMeasureStart(undefined); setStatus(`${nextMode === 'select' ? 'Selection' : nextMode} tool active.`); };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (modifier && key === 'z') { event.preventDefault(); setHistory((current) => undoState(current)); return; }
      if (modifier && key === 'y') { event.preventDefault(); setHistory((current) => redoState(current)); return; }
      if (event.code === 'Space') { event.preventDefault(); setSpacePressed(true); return; }
      if (key === 'w') activateMode('wall');
      else if (key === 'd') activateMode('door');
      else if (key === 'n') activateMode('window');
      else if (key === 'm') activateMode('measure');
      else if (key === 'v' || key === 'escape') activateMode('select');
      else if (key === 'r') rotateSelected();
      else if (key === 'f') flipSelected();
      else if (key === 'delete' || key === 'backspace') deleteSelected();
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpacePressed(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  const handlePan = (dx: number, dy: number) => setPresent((project) => ({ ...project, viewport: { ...project.viewport, panX: project.viewport.panX + dx, panY: project.viewport.panY + dy } }));
  const handleZoomAt = (screen: Point2D, factor: number) => setPresent((project) => {
    const anchor = screenToWorld(screen, project.viewport); const scale = clampZoom(project.viewport.scale * factor);
    return { ...project, viewport: { ...project.viewport, scale, panX: screen.x - anchor.x * scale, panY: screen.y - anchor.y * scale } };
  });

  const exportAndNotify = (label: string) => { setExportNote(`Exported ${label} locally. If this saved desktop CAD overhead, support independent developer tooling with a coffee.`); };
  const exportSvgFile = () => { downloadText(exportSvg(displayProject), 'plancraft-plan.svg', 'image/svg+xml;charset=utf-8'); exportAndNotify('scale-aware SVG'); };
  const exportDxfFile = (version: 'r12' | 'r2000') => { downloadText(exportDxf(displayProject, version), `plancraft-${version}.dxf`, 'application/dxf;charset=utf-8'); exportAndNotify(`AutoCAD ${version.toUpperCase()} DXF`); };
  const exportPdfFile = async () => { downloadBytes(await exportPdf(displayProject, 'arch-d'), 'plancraft-arch-d.pdf', 'application/pdf'); exportAndNotify(`Arch D ${displayProject.scaleNotation} PDF`); };
  const backupJson = () => { downloadText(serializeProject(displayProject), 'plancraft-project.json', 'application/json;charset=utf-8'); exportAndNotify('lossless JSON backup'); };
  const restoreJson = async (file?: File) => {
    if (!file) return;
    try { const project = JSON.parse(await file.text()) as FloorplanProject; if (project.schemaVersion !== 1) throw new Error('Unsupported project schema.'); setHistory(loadProject(project)); setStatus('Restored local PlanCraft JSON backup.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not restore that JSON backup.'); }
  };

  const updateWall = (id: string, patch: Partial<WallSegment>) => commit('edit wall', (project) => ({ ...project, walls: project.walls.map((wall) => wall.id === id ? { ...wall, ...patch } : wall) }));
  const updateOpening = (wallId: string, openingId: string, patch: Partial<HostedOpening>) => commit('edit opening', (project) => ({ ...project, walls: project.walls.map((wall) => wall.id === wallId ? { ...wall, openings: wall.openings.map((opening) => opening.id === openingId ? { ...opening, ...patch } : opening) } : wall) }));
  const updateComponent = (id: string, patch: Partial<PlanComponent>) => commit('edit component', (project) => ({ ...project, components: project.components.map((component) => component.id === id ? { ...component, ...patch } : component) }));
  const updateMeta = (patch: Partial<Pick<FloorplanProject, 'name' | 'author' | 'scaleNotation'>>) => commit('edit project metadata', (project) => ({ ...project, ...patch }));
  const toggleLayer = (id: string, visible: boolean) => setPresent((project) => ({ ...project, layers: project.layers.map((layer) => layer.id === id ? { ...layer, visible } : layer) }));

  const categories = ['living', 'bedroom', 'dining', 'kitchen_bath', 'office', 'mep'] as const;

  return (
    <div className="plancraft" data-testid="floorplan-studio">
      <header className="plancraft-toolbar">
        <div><strong>PlanCraft Studio</strong><span>{mode.replaceAll('_', ' ')} · X {Math.round(pointerWorld?.x ?? 0)} mm · Y {Math.round(pointerWorld?.y ?? 0)} mm · {(history.present.viewport.scale * 100).toFixed(0)}%</span></div>
        <div className="plancraft-toolbar-actions">
          <button type="button" className="plancraft-button" disabled={!history.past.length} onClick={() => setHistory((current) => undoState(current))}>Undo</button>
          <button type="button" className="plancraft-button" disabled={!history.future.length} onClick={() => setHistory((current) => redoState(current))}>Redo</button>
          <label className="plancraft-check"><input type="checkbox" checked={snapping} onChange={(event) => setSnapping(event.target.checked)} /> Magnetic snap</label>
          <label>Grid <select value={history.present.viewport.gridMm} onChange={(event) => setPresent((project) => ({ ...project, viewport: { ...project.viewport, gridMm: Number(event.target.value) } }))}>{[10, 50, 100, 500, 1000].map((value) => <option key={value} value={value}>{value} mm</option>)}</select></label>
        </div>
      </header>

      <div className="plancraft-exportbar" aria-label="Export controls">
        <button type="button" className="plancraft-button" onClick={exportSvgFile}>Export SVG</button>
        <button type="button" className="plancraft-button" onClick={() => exportDxfFile('r12')}>Export DXF R12</button>
        <button type="button" className="plancraft-button" onClick={() => exportDxfFile('r2000')}>Export DXF R2000</button>
        <button type="button" className="plancraft-button" onClick={() => void exportPdfFile()}>Export PDF</button>
        <button type="button" className="plancraft-button" onClick={backupJson}>Backup JSON</button>
        <label className="plancraft-file-button">Restore JSON<input type="file" accept="application/json,.json" onChange={(event) => void restoreJson(event.target.files?.[0])} /></label>
        <a className="plancraft-coffee" href={COFFEE_URL} target="_blank" rel="noreferrer">☕ Buy me a coffee ($3)</a>
      </div>

      <div className="plancraft-shell">
        <aside className="plancraft-toolbox" aria-label="Drafting toolbox">
          <div className="plancraft-panel-heading"><span>Drafting tools</span><strong>W · D · N · M</strong></div>
          <div className="plancraft-tool-grid">
            <button type="button" aria-pressed={mode === 'select'} onClick={() => activateMode('select')}>Select & Transform <kbd>V</kbd></button>
            <button type="button" aria-pressed={mode === 'wall'} onClick={() => activateMode('wall')}>Continuous Wall <kbd>W</kbd></button>
            <button type="button" aria-pressed={mode === 'door'} onClick={() => activateMode('door')}>Parametric Door <kbd>D</kbd></button>
            <button type="button" aria-pressed={mode === 'window'} onClick={() => activateMode('window')}>Window Cutout <kbd>N</kbd></button>
            <button type="button" aria-pressed={mode === 'measure'} onClick={() => activateMode('measure')}>Dimension Tape <kbd>M</kbd></button>
            <button type="button" aria-pressed={mode === 'ada'} onClick={() => activateMode('ada')}>ADA 60&quot; Circle</button>
          </div>
          <div className="plancraft-library"><div className="plancraft-panel-heading"><span>Component library</span><strong>Parametric</strong></div>{categories.map((category) => <details key={category} open={category === 'living'}><summary>{category.replaceAll('_', ' & ')}</summary><div className="plancraft-symbol-grid">{COMPONENT_LIBRARY.filter((symbol) => symbol.category === category).map((symbol) => <button type="button" key={symbol.key} aria-pressed={mode === 'component' && selectedSymbol === symbol.key} onClick={() => { setSelectedSymbol(symbol.key); activateMode('component'); }}>{symbol.label}</button>)}</div></details>)}</div>
        </aside>

        <section className="plancraft-stage" aria-label="Floor plan viewport">
          <div className="plancraft-hud">
            <span>Scale {history.present.scaleNotation}</span><span>Grid {history.present.viewport.gridMm} mm</span><span>Worker {analysis.elapsedMs.toFixed(1)} ms</span><span>Snap {snapWorld ? 'locked' : 'free'}</span>
          </div>
          <FloorplanCanvas project={displayProject} analysis={analysis} mode={mode} pointerWorld={pointerWorld} snapWorld={snapWorld} draftStart={draftStart?.point} draftEnd={draftEnd} spacePressed={spacePressed} onWorldMove={handleWorldMove} onWorldClick={handleWorldClick} onPan={handlePan} onZoomAt={handleZoomAt} />
          <div className="plancraft-status" aria-live="polite"><span>{status}</span><span>Shift = angle lock · Space + drag = pan · wheel/pinch = zoom</span></div>
          <div className="plancraft-summary" aria-label="Plan summary">
            <div><span>Walls</span><strong data-testid="wall-count">{history.present.walls.length}</strong></div>
            <div><span>Rooms</span><strong data-testid="room-count">{analysis.rooms.length}</strong></div>
            <div><span>Openings</span><strong data-testid="opening-count">{openingCount}</strong></div>
            <div><span>Components</span><strong data-testid="component-count">{history.present.components.length}</strong></div>
            <div><span>Footprint</span><strong>{analysis.rooms.reduce((sum, room) => sum + room.areaSqMeters, 0).toFixed(1)} m²</strong></div>
          </div>
        </section>

        <FloorplanInspector project={displayProject} analysis={analysis} onProjectMeta={updateMeta} onWallUpdate={updateWall} onOpeningUpdate={updateOpening} onComponentUpdate={updateComponent} onDeleteSelected={deleteSelected} onToggleLayer={toggleLayer} />
      </div>

      {exportNote ? <div className="plancraft-toast" role="status">{exportNote} <a href={COFFEE_URL} target="_blank" rel="noreferrer">Support with a coffee</a></div> : null}
      <p className="plancraft-disclaimer">Clearance and ADA indicators are planning aids, not code-compliance certification. Verify final drawings against the codes and standards governing the project.</p>
    </div>
  );
};

export default FloorplanWorkspace;
