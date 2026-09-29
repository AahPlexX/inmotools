import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from 'react';
import { downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import {
  checkTruthTableAvailability,
  extractBooleanExpressions,
  formatPos,
  formatSop,
  generateTruthTable,
  runElectricalRuleCheck,
  truthTableToCsv,
  type ErcFinding,
  type TruthTable,
} from './analysis-engine';
import { clampInputCount, COMPONENT_CATEGORIES, paletteLabel } from './component-library';
import { applyWordEdits, isMemoryType, mergeLive, withoutWrites, type WordEdit } from './memory-engine';
import { bitWidthOf, isRegisterType, isRippling, restoreRegisterRuntime } from './register-engine';
import {
  addComponent,
  addWire,
  commit,
  createHistory,
  createInitialDocument,
  duplicateComponent,
  loadDocument,
  mirrorComponent,
  moveComponent,
  redo,
  relabelComponent,
  removeComponent,
  removeComponents,
  rotateComponent,
  setDelayMode,
  setRunning,
  setSelection,
  setTheme,
  setViewport,
  undo,
  updateComponentParams,
  updateMetadata,
  wireProblem,
} from './circuit-model';
import { parseProject, projectFileName, renderSchematicSvg, serializeProject } from './export-engine';
import {
  channelCandidates,
  createSampleBuffer,
  normalizeChannels,
  recordSample,
  sameChannels,
  type AnalyzerChannel,
  type SampleBuffer,
} from './analyzer-engine';
import { LogicAnalyzerDock } from './LogicAnalyzerDock';
import { LogicMemoryDock } from './LogicMemoryDock';
import { applyAtPath, breadcrumbs, documentAtPath, encapsulateSelection, flattenDocument, pathPrefix, relabelSubcircuitPort, renameSubcircuit, scopeFrame, setSubcircuitIcon, trimPath } from './subcircuit-engine';
import { isPortMarker } from './subcircuit-ports';
import { LogicMinimizerDock } from './LogicMinimizerDock';
import { LogicPuzzleDock } from './LogicPuzzleDock';
import { LogicShortcutsDock } from './LogicShortcutsDock';
import { actionForEvent, DEFAULT_SHORTCUTS, parseShortcuts, serializeShortcuts, type ShortcutMap } from './shortcut-engine';
import { buildStarterDocument, type PuzzleLevel } from './puzzle-engine';
import { freeSpaceBelow, synthesizeTwoLevel, type SynthesisSpec } from './synthesis-engine';
import { LogicCanvas, type MenuAction } from './LogicCanvas';
import { LogicInspector } from './LogicInspector';
import type { ComponentType, DocumentHistory, LogicDocument, LogicLevel, PortRef, ThemeName, WirePoint } from './logic-types';
import { createInitialFrame, migrateFrame, readLevel, step } from './sim-engine';
import './LogicWorkspace.css';

const AUTOSAVE_KEY = 'inmotools_logic_workstation_autosave';
const SHORTCUTS_KEY = 'inmotools_logic_shortcuts';
/** The Junior Explorer view is at least this zoomed in, so parts read as large blocks. */
const JUNIOR_MIN_ZOOM = 1.35;

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);

/** A control that Space activates when it has focus, so Space there must not also trigger a shortcut. */
const isActivatable = (target: EventTarget | null): boolean =>
  target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || (target instanceof HTMLElement && target.tagName === 'SUMMARY');

const loadShortcuts = (): ShortcutMap => {
  try {
    return parseShortcuts(window.localStorage.getItem(SHORTCUTS_KEY));
  } catch {
    return DEFAULT_SHORTCUTS;
  }
};

const loadInitialHistory = (): DocumentHistory => {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (raw) return loadDocument(parseProject(raw));
  } catch {
    /* Corrupt or missing autosave data falls back to a fresh circuit. */
  }
  return createHistory(createInitialDocument());
};

const HAZARD_LABEL: Record<string, string> = {
  oscillation: 'This net is oscillating and could not settle under ideal zero-delay simulation.',
};

export default function LogicWorkspace() {
  const [history, setHistory] = useState<DocumentHistory>(loadInitialHistory);
  const documentRef = useRef<LogicDocument>(history.present);
  documentRef.current = history.present;

  // Which subcircuit is open: the ids of the subcircuit parts entered, outermost first. Every edit below is
  // written for a plain document and is applied to the circuit at this path (see `applyAtPath`).
  const [path, setPath] = useState<readonly string[]>([]);
  const activePath = useMemo(() => trimPath(history.present, path), [history.present, path]);
  const pathRef = useRef<readonly string[]>(activePath);
  pathRef.current = activePath;
  const scopedCommit = useCallback(
    (prev: DocumentHistory, label: string, updater: (document: LogicDocument) => LogicDocument): DocumentHistory =>
      commit(prev, label, (root) => applyAtPath(root, trimPath(root, pathRef.current), updater)),
    [],
  );
  const scopedPreview = useCallback(
    (prev: DocumentHistory, updater: (document: LogicDocument) => LogicDocument): DocumentHistory => ({ ...prev, present: applyAtPath(prev.present, trimPath(prev.present, pathRef.current), updater) }),
    [],
  );
  const scopedOf = useCallback((root: LogicDocument): LogicDocument => documentAtPath(root, trimPath(root, pathRef.current)), []);

  const frameRef = useRef(createInitialFrame(history.present));
  const [, bumpFrame] = useReducer((count: number) => count + 1, 0);
  // The analyzer records every simulation step whether or not its dock is open, so
  // opening it shows what already happened. The buffer is mutated in place as steps
  // arrive; a change of channels swaps in a fresh one.
  const juniorReturnRef = useRef<{ theme: ThemeName; zoom: number }>({ theme: 'light', zoom: 1 });
  const analyzerBufferRef = useRef<SampleBuffer>(createSampleBuffer([]));
  const analyzerChannelsRef = useRef<readonly AnalyzerChannel[]>([]);
  const [analyzerKeys, setAnalyzerKeys] = useState<readonly string[] | null>(null);
  const liveButtonLevelsRef = useRef<Record<string, LogicLevel>>({});
  const pendingSwitchOverrideRef = useRef<Record<string, LogicLevel>>({});

  const [shortcuts, setShortcutsState] = useState<ShortcutMap>(loadShortcuts);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const setShortcuts = useCallback((next: ShortcutMap) => {
    setShortcutsState(next);
    try {
      window.localStorage.setItem(SHORTCUTS_KEY, serializeShortcuts(next));
    } catch {
      /* A full or blocked store only means the choice is not remembered next visit. */
    }
  }, []);

  const [placingType, setPlacingType] = useState<ComponentType | null>(null);
  const [activeDock, setActiveDock] = useState<'none' | 'truth' | 'erc' | 'shortcuts' | 'analyzer' | 'minimizer' | 'puzzles' | 'memory'>('none');
  const [memoryFocusId, setMemoryFocusId] = useState<string | null>(null);
  // Set by an edit made outside the simulation (a memory word typed in the editor) so the next commit also takes one step
  // and every output that reads the changed contents follows at once, instead of waiting for the next switch or clock.
  const stepAfterEditRef = useRef(false);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'palette' | 'inspector'>('none');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    frameRef.current = migrateFrame(frameRef.current, history.present);
    bumpFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.present]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTOSAVE_KEY, serializeProject(history.present));
    } catch {
      /* Storage may be full or unavailable; autosave is best-effort. */
    }
  }, [history.present]);

  const runStep = useCallback((elapsedMs: number, forceClockStep = false) => {
    const interactions = { ...liveButtonLevelsRef.current, ...pendingSwitchOverrideRef.current };
    pendingSwitchOverrideRef.current = {};
    frameRef.current = step({ document: documentRef.current, previous: frameRef.current, elapsedMs, interactions, forceClockStep });
    if (!sameChannels(analyzerBufferRef.current.channels, analyzerChannelsRef.current)) {
      analyzerBufferRef.current = createSampleBuffer(analyzerChannelsRef.current);
    }
    const latestFrame = frameRef.current;
    recordSample(analyzerBufferRef.current, latestFrame.tick, (key) => latestFrame.portLevels[key] ?? 'Z');
    bumpFrame();
  }, []);

  useEffect(() => {
    if (!history.present.simulation.running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const elapsed = Math.min(250, now - last);
      last = now;
      // Nothing changes state on its own unless a clock is ticking, a
      // realistic-delay update is still pending, or a ripple counter still
      // has higher bits to settle, so skip the net rebuild and React
      // re-render on every idle frame instead of animating forever.
      // Parts inside subcircuits count too: the simulator runs the flattened circuit.
      const running = flattenDocument(documentRef.current);
      const hasClock = running.components.some((component) => component.type === 'CLOCK');
      const isRippleSettling = running.components.some((component) => {
        if (!isRegisterType(component.type)) return false;
        const width = bitWidthOf(component.params);
        return isRippling(restoreRegisterRuntime(frameRef.current.componentState[component.id], width), width);
      });
      if (hasClock || isRippleSettling || frameRef.current.pendingUpdates.length > 0) runStep(elapsed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [history.present.simulation.running, runStep]);

  useLayoutEffect(() => {
    if (!stepAfterEditRef.current) return;
    stepAfterEditRef.current = false;
    runStep(0);
  }, [history.present, runStep]);

  const [cancelDraftWireToken, setCancelDraftWireToken] = useState(0);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const action = actionForEvent(shortcutsRef.current, event);
      if (!action) return;
      // Space on a focused button or disclosure activates it; it must not also start or stop the simulation.
      if (event.key === ' ' && isActivatable(event.target)) return;

      switch (action) {
        case 'cancel':
          setPlacingType(null);
          setCancelDraftWireToken((token) => token + 1);
          setHistory((prev) => (scopedOf(prev.present).selectedIds.length ? scopedPreview(prev, (d) => setSelection(d, [])) : prev));
          break;
        case 'undo':
          event.preventDefault();
          setHistory(undo);
          break;
        case 'redo':
          event.preventDefault();
          setHistory(redo);
          break;
        case 'togglePlay':
          event.preventDefault();
          setHistory((prev) => scopedCommit(prev, 'Toggle run', (doc) => setRunning(doc, !doc.simulation.running)));
          break;
        case 'step':
          event.preventDefault();
          runStep(0, true);
          break;
        case 'rotate':
          setHistory((prev) => (scopedOf(prev.present).selectedIds.length ? scopedCommit(prev, 'Rotate selection', (doc) => doc.selectedIds.reduce((next, id) => rotateComponent(next, id), doc)) : prev));
          break;
        case 'mirror':
          setHistory((prev) => (scopedOf(prev.present).selectedIds.length ? scopedCommit(prev, 'Flip selection', (doc) => doc.selectedIds.reduce((next, id) => mirrorComponent(next, id), doc)) : prev));
          break;
        case 'duplicate':
          event.preventDefault();
          setHistory((prev) => (scopedOf(prev.present).selectedIds.length ? scopedCommit(prev, 'Duplicate selection', (doc) => doc.selectedIds.reduce((next, id) => duplicateComponent(next, id), doc)) : prev));
          break;
        case 'delete':
          setHistory((prev) => (scopedOf(prev.present).selectedIds.length ? scopedCommit(prev, 'Delete selection', (doc) => removeComponents(doc, doc.selectedIds)) : prev));
          break;
        case 'focusPalette':
          event.preventDefault();
          // On a narrow viewport the palette is a slide-over sheet, so open it before moving focus into it.
          setMobilePanel('palette');
          window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="logic-palette"] button.logic-palette-button')?.focus());
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [runStep]);

  const handleDropComponent = useCallback((type: ComponentType, worldX: number, worldY: number) => {
    setHistory((prev) => scopedCommit(prev, `Add ${type}`, (doc) => addComponent(doc, type, Math.round(worldX), Math.round(worldY))));
  }, []);

  const handleMoveComponent = useCallback((id: string, x: number, y: number, final: boolean) => {
    // Only the final position of a drag becomes an undo step; intermediate
    // pointer-move updates preview the move live without touching history,
    // so dragging one component across the canvas is one undo, not hundreds.
    setHistory((prev) => (final ? scopedCommit(prev, 'Move', (doc) => moveComponent(doc, id, x, y)) : scopedPreview(prev, (doc) => moveComponent(doc, id, x, y))));
  }, []);

  const handleSelect = useCallback((ids: string[]) => {
    // Selection is UI state, not a circuit edit; committing it would make
    // every click its own undo step ahead of the edit the user actually cares about.
    setHistory((prev) => scopedPreview(prev, (d) => setSelection(d, ids)));
  }, []);

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const handleAddWire = useCallback((from: PortRef, to: PortRef, waypoints: readonly WirePoint[]) => {
    // `addWire` quietly refuses a connection that cannot work; say why, so a bus of the wrong width is not a mystery.
    const problem = wireProblem(scopedOf(documentRef.current), from, to);
    if (problem) {
      showNotice(problem);
      return;
    }
    setNotice(null);
    setHistory((prev) => scopedCommit(prev, 'Wire', (doc) => addWire(doc, from, to, waypoints)));
  }, [showNotice]);

  // --- Memory editing: contents live in the part's parameters (saved, undoable); a running RAM's own writes are an overlay in the frame. ---

  const forgetLiveWrites = useCallback((componentId: string, addresses?: readonly number[]) => {
    // A memory inside a subcircuit lives in the simulator under the path of the parts entered to reach it.
    const key = `${pathPrefix(pathRef.current)}${componentId}`;
    const state = frameRef.current.componentState[key];
    if (!state?.memoryWrites) return;
    frameRef.current = {
      ...frameRef.current,
      componentState: { ...frameRef.current.componentState, [key]: { ...state, memoryWrites: withoutWrites(state.memoryWrites, addresses) } },
    };
  }, []);

  const handleMemoryEdit = useCallback((componentId: string, edits: readonly WordEdit[]): string | undefined => {
    const component = scopedOf(documentRef.current).components.find((candidate) => candidate.id === componentId);
    if (!component || !isMemoryType(component.type)) return 'That memory is no longer in the circuit.';
    const result = applyWordEdits(component.params, component.params.memoryCells ?? {}, edits);
    if (!result.ok) return result.reason;
    forgetLiveWrites(componentId, edits.map((edit) => edit.address));
    stepAfterEditRef.current = true;
    setHistory((prev) => scopedCommit(prev, 'Edit memory', (d) => updateComponentParams(d, componentId, { memoryCells: result.cells })));
    return undefined;
  }, [forgetLiveWrites]);

  const handleMemoryReplace = useCallback((componentId: string, cells: Record<string, number>, fill: number | undefined, label: string) => {
    forgetLiveWrites(componentId);
    stepAfterEditRef.current = true;
    setHistory((prev) => scopedCommit(prev, label, (d) => updateComponentParams(d, componentId, fill === undefined ? { memoryCells: cells } : { memoryCells: cells, memoryFill: fill })));
  }, [forgetLiveWrites]);

  const handleMemoryResetLive = useCallback((componentId: string) => {
    forgetLiveWrites(componentId);
    runStep(0);
  }, [forgetLiveWrites, runStep]);

  const handleMemoryKeepLive = useCallback((componentId: string) => {
    const component = scopedOf(documentRef.current).components.find((candidate) => candidate.id === componentId);
    if (!component || !isMemoryType(component.type)) return;
    const merged = mergeLive(component.params, frameRef.current.componentState[`${pathPrefix(pathRef.current)}${componentId}`]?.memoryWrites);
    forgetLiveWrites(componentId);
    setHistory((prev) => scopedCommit(prev, 'Keep live memory values', (d) => updateComponentParams(d, componentId, { memoryCells: merged })));
  }, [forgetLiveWrites]);

  const handleOpenMemoryEditor = useCallback((componentId: string) => {
    setMemoryFocusId(componentId);
    setActiveDock('memory');
  }, []);

  const handleGenerateCircuit = useCallback((spec: SynthesisSpec) => {
    setHistory((prev) => scopedCommit(prev, 'Add minimized circuit', (document) => {
      try {
        const built = synthesizeTwoLevel(document, spec, freeSpaceBelow(document.components));
        return setSelection(built.document, built.addedComponentIds);
      } catch {
        // A constant or malformed expression has nothing to draw; leave the circuit as it was.
        return document;
      }
    }));
  }, []);

  // The simulator names a part inside a subcircuit by the path of parts entered to reach it, so a switch or
  // button on screen is addressed with that path in front of its own id.
  const handleToggleSwitch = useCallback((id: string) => {
    const scopePrefix = pathPrefix(pathRef.current);
    const component = scopedOf(documentRef.current).components.find((candidate) => candidate.id === id);
    if (component?.type === 'PORT_IN' && scopePrefix !== '') {
      // Inside a subcircuit an input port is fed by whatever the subcircuit is plugged into.
      showNotice('This input comes from the circuit that uses this subcircuit. Toggle the switch that feeds it there.');
      return;
    }
    const current = readLevel(frameRef.current, `${scopePrefix}${id}`, 'Y');
    pendingSwitchOverrideRef.current[`${scopePrefix}${id}`] = current === 1 ? 0 : 1;
    runStep(0);
  }, [runStep, scopedOf, showNotice]);

  const handlePressButton = useCallback((id: string, pressed: boolean) => {
    const key = `${pathPrefix(pathRef.current)}${id}`;
    liveButtonLevelsRef.current = { ...liveButtonLevelsRef.current, [key]: pressed ? 1 : 0 };
    runStep(0);
  }, [runStep]);

  // --- Subcircuits: group a selection into one, open it, close it, and edit its name, icon and ports. ---

  const handleGroupSelection = useCallback(() => {
    const scoped = scopedOf(documentRef.current);
    const result = encapsulateSelection(scoped, scoped.selectedIds);
    if (!result.ok) {
      showNotice(result.reason);
      return;
    }
    setNotice(null);
    setHistory((prev) => scopedCommit(prev, 'Group into subcircuit', () => result.document));
  }, [scopedCommit, scopedOf, showNotice]);

  const handleOpenSubcircuit = useCallback((componentId: string) => {
    const scoped = scopedOf(documentRef.current);
    const component = scoped.components.find((candidate) => candidate.id === componentId);
    if (!component || component.type !== 'SUBCIRCUIT' || !component.params.subcircuit) return;
    setPath([...pathRef.current, componentId]);
    setNotice(null);
    setPlacingType(null);
  }, [scopedOf]);

  const handleCloseToDepth = useCallback((depth: number) => {
    setPath(pathRef.current.slice(0, depth));
    setNotice(null);
  }, []);

  const handleRenameSubcircuit = useCallback((id: string, name: string) => {
    setHistory((prev) => scopedCommit(prev, 'Rename subcircuit', (d) => {
      const renamed = renameSubcircuit(d, id, name);
      // The part's own label follows its name, as it does when the subcircuit is created.
      return { ...renamed, components: renamed.components.map((component) => (component.id === id && component.type === 'SUBCIRCUIT' ? { ...component, label: component.params.subcircuit?.name ?? component.label } : component)) };
    }));
  }, [scopedCommit]);
  const handleSetSubcircuitIcon = useCallback((id: string, icon: string) => setHistory((prev) => scopedCommit(prev, 'Subcircuit icon', (d) => setSubcircuitIcon(d, id, icon))), [scopedCommit]);
  const handleRelabelPort = useCallback((id: string, portId: string, label: string) => setHistory((prev) => scopedCommit(prev, 'Rename port', (d) => relabelSubcircuitPort(d, id, portId, label))), [scopedCommit]);


  const handleViewportChange = useCallback((viewport: Partial<LogicDocument['viewport']>) => {
    setHistory((prev) => scopedPreview(prev, (d) => setViewport(d, viewport)));
  }, []);

  const buildContextActions = useCallback((componentId: string): MenuAction[] => [
    ...(scopedOf(documentRef.current).components.find((candidate) => candidate.id === componentId)?.type === 'SUBCIRCUIT'
      ? [{ key: 'open', label: 'Open subcircuit', onSelect: () => handleOpenSubcircuit(componentId) }]
      : []),
    { key: 'rotate', label: 'Rotate 90°', onSelect: () => setHistory((prev) => scopedCommit(prev, 'Rotate', (doc) => rotateComponent(doc, componentId))) },
    { key: 'mirror', label: 'Flip horizontal', onSelect: () => setHistory((prev) => scopedCommit(prev, 'Flip', (doc) => mirrorComponent(doc, componentId))) },
    { key: 'duplicate', label: 'Duplicate', onSelect: () => setHistory((prev) => scopedCommit(prev, 'Duplicate', (doc) => duplicateComponent(doc, componentId))) },
    { key: 'delete', label: 'Delete', onSelect: () => setHistory((prev) => scopedCommit(prev, 'Delete', (doc) => removeComponent(doc, componentId))) },
  ], [handleOpenSubcircuit, scopedCommit, scopedOf]);

  const root = history.present;
  const doc = useMemo(() => documentAtPath(root, activePath), [root, activePath]);
  const prefix = pathPrefix(activePath);
  const viewFrame = scopeFrame(frameRef.current, prefix);
  const trail = useMemo(() => breadcrumbs(root, activePath), [root, activePath]);
  const selectedMemoryId = useMemo(() => {
    if (doc.selectedIds.length !== 1) return null;
    const selected = doc.components.find((component) => component.id === doc.selectedIds[0]);
    return selected && isMemoryType(selected.type) ? selected.id : null;
  }, [doc.selectedIds, doc.components]);

  // With "selected parts only" on, the table walks just the selected switches and LEDs, so unrelated parts on the same canvas stay out of it.
  const [truthScoped, setTruthScoped] = useState(false);
  const truthOptions = useMemo(() => (truthScoped ? { onlyIds: doc.selectedIds } : undefined), [truthScoped, doc.selectedIds]);
  const truthAvailability = useMemo(() => checkTruthTableAvailability(doc, truthOptions), [doc, truthOptions]);
  const truthTable: TruthTable | null = useMemo(() => {
    if (activeDock !== 'truth' || !truthAvailability.ok) return null;
    try { return generateTruthTable(doc, truthOptions); } catch { return null; }
  }, [activeDock, truthAvailability.ok, doc, truthOptions]);
  const expressions = useMemo(() => (truthTable ? extractBooleanExpressions(truthTable) : []), [truthTable]);
  const ercFindings: ErcFinding[] = useMemo(() => (activeDock === 'erc' ? runElectricalRuleCheck(doc) : []), [activeDock, doc]);

  // Which signals the analyzer captures follows the circuit (a deleted probe drops out, a new one joins
  // the default set); runStep reads the latest list through a ref so it never records a stale channel.
  const analyzerChannels = useMemo(() => normalizeChannels(flattenDocument(root), analyzerKeys), [root, analyzerKeys]);
  const analyzerCandidates = useMemo(() => channelCandidates(root), [root]);
  analyzerChannelsRef.current = analyzerChannels;
  if (!sameChannels(analyzerBufferRef.current.channels, analyzerChannels)) {
    analyzerBufferRef.current = createSampleBuffer(analyzerChannels);
  }

  // Replacing the live document without also dropping these would let a
  // held button or a queued switch toggle from the old circuit apply to
  // the new one if it happens to reuse a component id.
  const resetLiveInteractions = () => {
    liveButtonLevelsRef.current = {};
    pendingSwitchOverrideRef.current = {};
  };

  const handleNewProject = () => {
    if (!window.confirm('Start a new blank circuit? This replaces the one on screen, including its autosave and undo history, and cannot be undone. Use Save project first if you want to keep it.')) return;
    const fresh = createInitialDocument();
    setHistory(createHistory(fresh));
    setPath([]);
    frameRef.current = createInitialFrame(fresh);
    resetLiveInteractions();
    bumpFrame();
    setPlacingType(null);
  };

  const handleStartPuzzleLevel = (level: PuzzleLevel) => {
    if (!window.confirm(`Start the puzzle "${level.title}"? This replaces the circuit on screen, including its autosave and undo history, and cannot be undone. Use Save project first if you want to keep it.`)) return;
    const starter = buildStarterDocument(level);
    setHistory(createHistory(starter));
    setPath([]);
    frameRef.current = createInitialFrame(starter);
    resetLiveInteractions();
    bumpFrame();
    setPlacingType(null);
  };

  // One click into (and back out of) the large-format Junior Explorer look: the theme, plus a
  // larger view. Leaving restores the theme and zoom that were in use before.
  const handleToggleJunior = () => {
    const current = scopedOf(documentRef.current);
    if (current.theme === 'junior-explorer') {
      const { theme, zoom } = juniorReturnRef.current;
      setHistory((prev) => scopedCommit(prev, 'Leave Junior Explorer', (document) => setViewport(setTheme(document, theme), { zoom })));
      return;
    }
    juniorReturnRef.current = { theme: current.theme, zoom: current.viewport.zoom };
    setHistory((prev) => scopedCommit(prev, 'Junior Explorer', (document) => setViewport(setTheme(document, 'junior-explorer'), { zoom: Math.max(document.viewport.zoom, JUNIOR_MIN_ZOOM) })));
  };

  const handleOpenClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    consumeFileInput(input, async () => {
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = parseProject(text);
        setHistory(loadDocument(parsed));
        setPath([]);
        frameRef.current = createInitialFrame(parsed);
        resetLiveInteractions();
        bumpFrame();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not open this project file.');
      }
    });
  };

  const handleExportSvg = () => downloadText(renderSchematicSvg(doc), projectFileName(root, 'svg'), 'image/svg+xml');
  const handleExportProject = () => downloadText(serializeProject(root), projectFileName(root, 'circuit.json'), 'application/json');
  const handleExportTruthTableCsv = () => {
    try {
      const table = generateTruthTable(doc, truthOptions);
      downloadText(truthTableToCsv(table), projectFileName(doc, 'truth-table.csv'), 'text/csv;charset=utf-8');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Truth table unavailable.');
    }
  };

  return (
    <div className={`logic-workspace ${mobilePanel !== 'none' ? 'mobile-panel-open' : ''}`} data-theme={doc.theme} data-testid="logic-workspace">
      <div className="logic-toolbar" role="toolbar" aria-label="Circuit toolbar">
        <button type="button" onClick={handleNewProject}>New</button>
        <button type="button" onClick={handleOpenClick}>Open</button>
        <input ref={fileInputRef} type="file" accept="application/json,.circuit.json,.json" hidden onChange={handleFileChange} data-testid="logic-file-input" />
        <button type="button" onClick={handleExportProject}>Save project</button>
        <span className="logic-toolbar-divider" aria-hidden="true" />
        <button type="button" onClick={() => setHistory(undo)} disabled={history.past.length === 0} title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" onClick={() => setHistory(redo)} disabled={history.future.length === 0} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <span className="logic-toolbar-divider" aria-hidden="true" />
        <button type="button" onClick={() => setHistory((prev) => scopedCommit(prev, 'Toggle run', (d) => setRunning(d, !d.simulation.running)))} title="Play/pause (Space)">
          {doc.simulation.running ? 'Pause' : 'Run'}
        </button>
        <button type="button" onClick={() => runStep(0, true)} title="Advance one manual tick, including any clock">Step</button>
        <button type="button" onClick={() => setHistory((prev) => scopedCommit(prev, 'Delay mode', (d) => setDelayMode(d, d.simulation.delayMode === 'ideal' ? 'realistic' : 'ideal')))}>
          {doc.simulation.delayMode === 'ideal' ? 'Ideal delay' : 'Realistic delay'}
        </button>
        <span className="logic-toolbar-divider" aria-hidden="true" />
        <button type="button" onClick={handleGroupSelection} disabled={doc.selectedIds.length === 0 || doc.selectedIds.every((id) => isPortMarker(doc.components.find((component) => component.id === id)?.type ?? 'AND'))} title="Group the selected parts into one subcircuit">Group into subcircuit</button>
        <button type="button" onClick={() => setActiveDock((current) => (current === 'truth' ? 'none' : 'truth'))} aria-pressed={activeDock === 'truth'}>Truth table</button>
        <button type="button" onClick={() => setActiveDock((current) => (current === 'erc' ? 'none' : 'erc'))} aria-pressed={activeDock === 'erc'}>Check circuit (ERC)</button>
        <button type="button" onClick={handleToggleJunior} aria-pressed={doc.theme === 'junior-explorer'}>Junior Explorer</button>
        <button type="button" onClick={() => setActiveDock((current) => (current === 'puzzles' ? 'none' : 'puzzles'))} aria-pressed={activeDock === 'puzzles'}>Puzzles</button>
        <button type="button" onClick={() => setActiveDock((current) => (current === 'minimizer' ? 'none' : 'minimizer'))} aria-pressed={activeDock === 'minimizer'}>Minimize (K-map)</button>
        <button type="button" onClick={() => setActiveDock((current) => (current === 'analyzer' ? 'none' : 'analyzer'))} aria-pressed={activeDock === 'analyzer'}>Logic analyzer</button>
        <button type="button" onClick={() => { setMemoryFocusId(selectedMemoryId); setActiveDock((current) => (current === 'memory' ? 'none' : 'memory')); }} aria-pressed={activeDock === 'memory'}>Memory editor</button>
        <button type="button" onClick={() => setActiveDock((current) => (current === 'shortcuts' ? 'none' : 'shortcuts'))} aria-pressed={activeDock === 'shortcuts'}>Keyboard shortcuts</button>
        <span className="logic-toolbar-divider" aria-hidden="true" />
        <button type="button" onClick={handleExportSvg}>Export SVG</button>
        <button type="button" className="logic-mobile-only" onClick={() => setMobilePanel((current) => (current === 'palette' ? 'none' : 'palette'))}>Components</button>
        <button type="button" className="logic-mobile-only" onClick={() => setMobilePanel((current) => (current === 'inspector' ? 'none' : 'inspector'))}>Inspect</button>
      </div>

      {trail.length > 1 ? (
        <nav className="logic-breadcrumbs" aria-label="Circuit path" data-testid="logic-breadcrumbs">
          <button type="button" onClick={() => handleCloseToDepth(activePath.length - 1)}>Up one level</button>
          <ol>
            {trail.map((crumb, index) => (
              <li key={`${crumb.id ?? 'root'}-${index}`}>
                {index === trail.length - 1 ? (
                  <span aria-current="location">{crumb.label}</span>
                ) : (
                  <button type="button" onClick={() => handleCloseToDepth(index)}>{crumb.label}</button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {frameRef.current.hazards.length > 0 ? (
        <div className="logic-hazard-banner" role="status">
          {frameRef.current.hazards.map((hazard, index) => <span key={`${hazard.type}-${index}`}>{HAZARD_LABEL[hazard.type] ?? hazard.message}</span>)}
        </div>
      ) : null}

      {notice ? <p className="logic-notice" role="status" data-testid="logic-notice">{notice}</p> : null}

      <div className="logic-workspace-body">
        <nav className={`logic-palette ${mobilePanel === 'palette' ? 'sheet-open' : ''}`} aria-label="Component palette" data-testid="logic-palette">
          <div className="logic-sheet-header">
            <span>Components</span>
            <button type="button" className="logic-sheet-close" aria-label="Close component palette" onClick={() => setMobilePanel('none')}>Close</button>
          </div>
          {placingType ? (
            <p className="logic-palette-hint">Placing {paletteLabel(placingType)} — click the canvas, or press Escape to stop.</p>
          ) : null}
          {COMPONENT_CATEGORIES.map((category) => (
            <div key={category.category} className="logic-palette-group" data-category={category.category}>
              <h3>{category.label}</h3>
              <div className="logic-palette-grid">
                {category.types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={placingType === type ? 'logic-palette-button active' : 'logic-palette-button'}
                    onClick={() => { setPlacingType((current) => (current === type ? null : type)); setMobilePanel('none'); }}
                    title={`Place a ${paletteLabel(type)}`}
                  >
                    {paletteLabel(type)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <LogicCanvas
          document={doc}
          frame={viewFrame}
          theme={doc.theme}
          placingType={placingType}
          onMoveComponent={handleMoveComponent}
          onSelect={handleSelect}
          onAddWire={handleAddWire}
          onToggleSwitch={handleToggleSwitch}
          onPressButton={handlePressButton}
          onViewportChange={handleViewportChange}
          onDropComponent={handleDropComponent}
          onOpenComponent={handleOpenSubcircuit}
          buildContextActions={buildContextActions}
          cancelDraftWireToken={cancelDraftWireToken}
        />

        <div className={`logic-inspector-shell ${mobilePanel === 'inspector' ? 'sheet-open' : ''}`}>
          <div className="logic-sheet-header">
            <span>Inspector</span>
            <button type="button" className="logic-sheet-close" aria-label="Close inspector" onClick={() => setMobilePanel('none')}>Close</button>
          </div>
          <LogicInspector
            document={doc}
            onRelabel={(id, label) => setHistory((prev) => scopedCommit(prev, 'Rename', (d) => relabelComponent(d, id, label)))}
            onUpdateParams={(id, params) => setHistory((prev) => scopedCommit(prev, 'Update parameters', (d) => updateComponentParams(d, id, params.inputCount !== undefined ? { ...params, inputCount: clampInputCount(params.inputCount) } : params)))}
            onUpdateMetadata={(metadata) => setHistory((prev) => scopedCommit(prev, 'Update metadata', (d) => updateMetadata(d, metadata)))}
            onSetTheme={(theme: ThemeName) => setHistory((prev) => scopedCommit(prev, 'Theme', (d) => setTheme(d, theme)))}
            onOpenMemoryEditor={handleOpenMemoryEditor}
            onOpenSubcircuit={handleOpenSubcircuit}
            onRenameSubcircuit={handleRenameSubcircuit}
            onSetSubcircuitIcon={handleSetSubcircuitIcon}
            onRelabelPort={handleRelabelPort}
          />
        </div>
      </div>

      {activeDock === 'truth' ? (
        <section className="logic-dock" aria-label="Truth table" data-testid="logic-truth-table-dock">
          <label className="logic-field logic-field-inline">
            <input type="checkbox" checked={truthScoped} onChange={(event) => setTruthScoped(event.target.checked)} />
            <span>Selected parts only (select the switches and LEDs to include)</span>
          </label>
          {!truthAvailability.ok ? (
            <p className="logic-dock-message">{truthAvailability.reason}</p>
          ) : truthTable ? (
            <>
              <table className="logic-truth-table">
                <thead>
                  <tr>
                    {truthTable.inputs.map((input) => <th key={input.componentId}>{input.label}</th>)}
                    {truthTable.outputs.map((output) => <th key={output.componentId}>{output.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {truthTable.rows.map((row, index) => (
                    <tr key={index}>
                      {truthTable.inputs.map((input) => <td key={input.componentId}>{row.inputs[input.componentId]}</td>)}
                      {truthTable.outputs.map((output) => <td key={output.componentId}>{String(row.outputs[output.componentId])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="logic-boolean-expressions">
                {expressions.map((expression) => (
                  <div key={expression.outputComponentId}>
                    <p>{formatSop(expression)}</p>
                    <p>{formatPos(expression)}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={handleExportTruthTableCsv}>Export CSV</button>
            </>
          ) : null}
        </section>
      ) : null}

      {activeDock === 'erc' ? (
        <section className="logic-dock" aria-label="Electrical rule check results" data-testid="logic-erc-dock">
          {ercFindings.length === 0 ? (
            <p className="logic-dock-message">No floating inputs, output contention, or unbuffered combinational loops were found.</p>
          ) : (
            <ul className="logic-erc-list">
              {ercFindings.map((finding, index) => (
                <li key={index} className={`logic-erc-item logic-erc-${finding.type}`}>{finding.message}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {activeDock === 'puzzles' ? (
        <LogicPuzzleDock document={doc} onStartLevel={handleStartPuzzleLevel} onClose={() => setActiveDock('none')} />
      ) : null}

      {activeDock === 'minimizer' ? (
        <LogicMinimizerDock document={doc} onGenerate={handleGenerateCircuit} onClose={() => setActiveDock('none')} />
      ) : null}

      {activeDock === 'analyzer' ? (
        <LogicAnalyzerDock
          buffer={analyzerBufferRef.current}
          tick={frameRef.current.tick}
          candidates={analyzerCandidates}
          selectedKeys={analyzerKeys}
          delayMode={doc.simulation.delayMode}
          theme={doc.theme}
          onChannelsChange={(keys) => setAnalyzerKeys(keys)}
          onClose={() => setActiveDock('none')}
        />
      ) : null}

      {activeDock === 'memory' ? (
        <LogicMemoryDock
          key={memoryFocusId ?? 'first'}
          document={doc}
          frame={viewFrame}
          focusId={memoryFocusId}
          onEdit={handleMemoryEdit}
          onReplace={handleMemoryReplace}
          onResetLive={handleMemoryResetLive}
          onKeepLive={handleMemoryKeepLive}
          onClose={() => setActiveDock('none')}
        />
      ) : null}

      {activeDock === 'shortcuts' ? <LogicShortcutsDock shortcuts={shortcuts} onChange={setShortcuts} /> : null}

      {mobilePanel !== 'none' ? <button type="button" className="logic-mobile-backdrop" aria-label="Close panel" onClick={() => setMobilePanel('none')} /> : null}
    </div>
  );
}
