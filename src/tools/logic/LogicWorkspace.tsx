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
import { clampInputCount, COMPONENT_CATEGORIES } from './component-library';
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
} from './circuit-model';
import { parseProject, projectFileName, renderSchematicSvg, serializeProject } from './export-engine';
import { LogicCanvas, type MenuAction } from './LogicCanvas';
import { LogicInspector } from './LogicInspector';
import type { ComponentType, DocumentHistory, LogicDocument, LogicLevel, PortRef, ThemeName, WirePoint } from './logic-types';
import { createInitialFrame, migrateFrame, readLevel, step } from './sim-engine';
import './LogicWorkspace.css';

const AUTOSAVE_KEY = 'inmotools_logic_workstation_autosave';

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);

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

/** The functional default keyboard bindings, shown in the toolbar's reference panel. */
const KEYBOARD_SHORTCUTS: ReadonlyArray<{ readonly keys: string; readonly action: string }> = [
  { keys: 'Space', action: 'Play or pause the simulation' },
  { keys: 'R', action: 'Rotate the current selection 90°' },
  { keys: 'Delete / Backspace', action: 'Delete the current selection' },
  { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
  { keys: 'Ctrl/Cmd + Shift + Z, or Ctrl/Cmd + Y', action: 'Redo' },
  { keys: 'Escape', action: 'Cancel an in-progress wire or component placement, or clear the selection' },
  { keys: 'Right-click (or long-press on touch)', action: 'Open a component’s rotate/flip/duplicate/delete menu' },
];

export default function LogicWorkspace() {
  const [history, setHistory] = useState<DocumentHistory>(loadInitialHistory);
  const documentRef = useRef<LogicDocument>(history.present);
  documentRef.current = history.present;

  const frameRef = useRef(createInitialFrame(history.present));
  const [, bumpFrame] = useReducer((count: number) => count + 1, 0);
  const liveButtonLevelsRef = useRef<Record<string, LogicLevel>>({});
  const pendingSwitchOverrideRef = useRef<Record<string, LogicLevel>>({});

  const [placingType, setPlacingType] = useState<ComponentType | null>(null);
  const [activeDock, setActiveDock] = useState<'none' | 'truth' | 'erc' | 'shortcuts'>('none');
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
    bumpFrame();
  }, []);

  useEffect(() => {
    if (!history.present.simulation.running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const elapsed = Math.min(250, now - last);
      last = now;
      // Nothing changes state on its own unless a clock is ticking or a
      // realistic-delay update is still pending, so skip the net rebuild and
      // React re-render on every idle frame instead of animating forever.
      const hasClock = documentRef.current.components.some((component) => component.type === 'CLOCK');
      if (hasClock || frameRef.current.pendingUpdates.length > 0) runStep(elapsed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [history.present.simulation.running, runStep]);

  const [cancelDraftWireToken, setCancelDraftWireToken] = useState(0);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === 'Escape') {
        setPlacingType(null);
        setCancelDraftWireToken((token) => token + 1);
        setHistory((prev) => (prev.present.selectedIds.length ? { ...prev, present: setSelection(prev.present, []) } : prev));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        setHistory((prev) => (event.shiftKey ? redo(prev) : undo(prev)));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        setHistory(redo);
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        setHistory((prev) => commit(prev, 'Toggle run', (doc) => setRunning(doc, !doc.simulation.running)));
        return;
      }
      if (event.key.toLowerCase() === 'r') {
        setHistory((prev) => (prev.present.selectedIds.length ? commit(prev, 'Rotate selection', (doc) => prev.present.selectedIds.reduce((next, id) => rotateComponent(next, id), doc)) : prev));
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        setHistory((prev) => (prev.present.selectedIds.length ? commit(prev, 'Delete selection', (doc) => removeComponents(doc, prev.present.selectedIds)) : prev));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleDropComponent = useCallback((type: ComponentType, worldX: number, worldY: number) => {
    setHistory((prev) => commit(prev, `Add ${type}`, (doc) => addComponent(doc, type, Math.round(worldX), Math.round(worldY))));
  }, []);

  const handleMoveComponent = useCallback((id: string, x: number, y: number, final: boolean) => {
    // Only the final position of a drag becomes an undo step; intermediate
    // pointer-move updates preview the move live without touching history,
    // so dragging one component across the canvas is one undo, not hundreds.
    setHistory((prev) => (final ? commit(prev, 'Move', (doc) => moveComponent(doc, id, x, y)) : { ...prev, present: moveComponent(prev.present, id, x, y) }));
  }, []);

  const handleSelect = useCallback((ids: string[]) => {
    // Selection is UI state, not a circuit edit; committing it would make
    // every click its own undo step ahead of the edit the user actually cares about.
    setHistory((prev) => ({ ...prev, present: setSelection(prev.present, ids) }));
  }, []);

  const handleAddWire = useCallback((from: PortRef, to: PortRef, waypoints: readonly WirePoint[]) => {
    setHistory((prev) => commit(prev, 'Wire', (doc) => addWire(doc, from, to, waypoints)));
  }, []);

  const handleToggleSwitch = useCallback((id: string) => {
    const current = readLevel(frameRef.current, id, 'Y');
    pendingSwitchOverrideRef.current[id] = current === 1 ? 0 : 1;
    runStep(0);
  }, [runStep]);

  const handlePressButton = useCallback((id: string, pressed: boolean) => {
    liveButtonLevelsRef.current = { ...liveButtonLevelsRef.current, [id]: pressed ? 1 : 0 };
    runStep(0);
  }, [runStep]);

  const handleViewportChange = useCallback((viewport: Partial<LogicDocument['viewport']>) => {
    setHistory((prev) => ({ ...prev, present: setViewport(prev.present, viewport) }));
  }, []);

  const buildContextActions = useCallback((componentId: string): MenuAction[] => [
    { key: 'rotate', label: 'Rotate 90°', onSelect: () => setHistory((prev) => commit(prev, 'Rotate', (doc) => rotateComponent(doc, componentId))) },
    { key: 'mirror', label: 'Flip horizontal', onSelect: () => setHistory((prev) => commit(prev, 'Flip', (doc) => mirrorComponent(doc, componentId))) },
    { key: 'duplicate', label: 'Duplicate', onSelect: () => setHistory((prev) => commit(prev, 'Duplicate', (doc) => duplicateComponent(doc, componentId))) },
    { key: 'delete', label: 'Delete', onSelect: () => setHistory((prev) => commit(prev, 'Delete', (doc) => removeComponent(doc, componentId))) },
  ], []);

  const doc = history.present;

  const truthAvailability = useMemo(() => checkTruthTableAvailability(doc), [doc]);
  const truthTable: TruthTable | null = useMemo(() => {
    if (activeDock !== 'truth' || !truthAvailability.ok) return null;
    try { return generateTruthTable(doc); } catch { return null; }
  }, [activeDock, truthAvailability.ok, doc]);
  const expressions = useMemo(() => (truthTable ? extractBooleanExpressions(truthTable) : []), [truthTable]);
  const ercFindings: ErcFinding[] = useMemo(() => (activeDock === 'erc' ? runElectricalRuleCheck(doc) : []), [activeDock, doc]);

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
    frameRef.current = createInitialFrame(fresh);
    resetLiveInteractions();
    bumpFrame();
    setPlacingType(null);
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
        frameRef.current = createInitialFrame(parsed);
        resetLiveInteractions();
        bumpFrame();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not open this project file.');
      }
    });
  };

  const handleExportSvg = () => downloadText(renderSchematicSvg(doc), projectFileName(doc, 'svg'), 'image/svg+xml');
  const handleExportProject = () => downloadText(serializeProject(doc), projectFileName(doc, 'circuit.json'), 'application/json');
  const handleExportTruthTableCsv = () => {
    try {
      const table = generateTruthTable(doc);
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
        <button type="button" onClick={() => setHistory((prev) => commit(prev, 'Toggle run', (d) => setRunning(d, !d.simulation.running)))} title="Play/pause (Space)">
          {doc.simulation.running ? 'Pause' : 'Run'}
        </button>
        <button type="button" onClick={() => runStep(0, true)} title="Advance one manual tick, including any clock">Step</button>
        <button type="button" onClick={() => setHistory((prev) => commit(prev, 'Delay mode', (d) => setDelayMode(d, d.simulation.delayMode === 'ideal' ? 'realistic' : 'ideal')))}>
          {doc.simulation.delayMode === 'ideal' ? 'Ideal delay' : 'Realistic delay'}
        </button>
        <span className="logic-toolbar-divider" aria-hidden="true" />
        <button type="button" onClick={() => setActiveDock((current) => (current === 'truth' ? 'none' : 'truth'))} aria-pressed={activeDock === 'truth'}>Truth table</button>
        <button type="button" onClick={() => setActiveDock((current) => (current === 'erc' ? 'none' : 'erc'))} aria-pressed={activeDock === 'erc'}>Check circuit (ERC)</button>
        <button type="button" onClick={() => setActiveDock((current) => (current === 'shortcuts' ? 'none' : 'shortcuts'))} aria-pressed={activeDock === 'shortcuts'}>Keyboard shortcuts</button>
        <span className="logic-toolbar-divider" aria-hidden="true" />
        <button type="button" onClick={handleExportSvg}>Export SVG</button>
        <button type="button" className="logic-mobile-only" onClick={() => setMobilePanel((current) => (current === 'palette' ? 'none' : 'palette'))}>Components</button>
        <button type="button" className="logic-mobile-only" onClick={() => setMobilePanel((current) => (current === 'inspector' ? 'none' : 'inspector'))}>Inspect</button>
      </div>

      {frameRef.current.hazards.length > 0 ? (
        <div className="logic-hazard-banner" role="status">
          {frameRef.current.hazards.map((hazard, index) => <span key={`${hazard.type}-${index}`}>{HAZARD_LABEL[hazard.type] ?? hazard.message}</span>)}
        </div>
      ) : null}

      <div className="logic-workspace-body">
        <nav className={`logic-palette ${mobilePanel === 'palette' ? 'sheet-open' : ''}`} aria-label="Component palette" data-testid="logic-palette">
          <div className="logic-sheet-header">
            <span>Components</span>
            <button type="button" className="logic-sheet-close" aria-label="Close component palette" onClick={() => setMobilePanel('none')}>Close</button>
          </div>
          {placingType ? (
            <p className="logic-palette-hint">Placing {placingType.replace(/_/g, ' ')} — click the canvas, or press Escape to stop.</p>
          ) : null}
          {COMPONENT_CATEGORIES.map((category) => (
            <div key={category.category} className="logic-palette-group">
              <h3>{category.label}</h3>
              <div className="logic-palette-grid">
                {category.types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={placingType === type ? 'logic-palette-button active' : 'logic-palette-button'}
                    onClick={() => { setPlacingType((current) => (current === type ? null : type)); setMobilePanel('none'); }}
                    title={`Place a ${type.replace(/_/g, ' ')}`}
                  >
                    {type.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <LogicCanvas
          document={doc}
          frame={frameRef.current}
          theme={doc.theme}
          placingType={placingType}
          onMoveComponent={handleMoveComponent}
          onSelect={handleSelect}
          onAddWire={handleAddWire}
          onToggleSwitch={handleToggleSwitch}
          onPressButton={handlePressButton}
          onViewportChange={handleViewportChange}
          onDropComponent={handleDropComponent}
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
            onRelabel={(id, label) => setHistory((prev) => commit(prev, 'Rename', (d) => relabelComponent(d, id, label)))}
            onUpdateParams={(id, params) => setHistory((prev) => commit(prev, 'Update parameters', (d) => updateComponentParams(d, id, params.inputCount !== undefined ? { ...params, inputCount: clampInputCount(params.inputCount) } : params)))}
            onUpdateMetadata={(metadata) => setHistory((prev) => commit(prev, 'Update metadata', (d) => updateMetadata(d, metadata)))}
            onSetTheme={(theme: ThemeName) => setHistory((prev) => commit(prev, 'Theme', (d) => setTheme(d, theme)))}
          />
        </div>
      </div>

      {activeDock === 'truth' ? (
        <section className="logic-dock" aria-label="Truth table" data-testid="logic-truth-table-dock">
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

      {activeDock === 'shortcuts' ? (
        <section className="logic-dock" aria-label="Keyboard shortcuts" data-testid="logic-shortcuts-dock">
          <dl className="logic-shortcut-list">
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <div className="logic-shortcut-row" key={shortcut.keys}>
                <dt>{shortcut.keys}</dt>
                <dd>{shortcut.action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {mobilePanel !== 'none' ? <button type="button" className="logic-mobile-backdrop" aria-label="Close panel" onClick={() => setMobilePanel('none')} /> : null}
    </div>
  );
}
