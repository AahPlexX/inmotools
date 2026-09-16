import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  addCrochetRound,
  createStarterCrochetDocument,
  crochetRoundProgress,
  setCrochetTargetRoundCounts,
  setCrochetYarnReference,
  switchCrochetChartMode,
  toggleCrochetGridCell,
  toggleCrochetProgressStep,
  workNextCrochetStitch,
} from './crochet-document-engine';
import { CrochetGridPanel, CrochetRoundInsights, YarnReferencePanel } from './CrochetPatternPanels';
import { polarNodeToCartesian } from './engines/geometry-engine';
import {
  CROCHET_SYMBOLS,
  crochetSymbolAbbreviation,
  crochetSymbolLabel,
  type CrochetDialect,
} from './engines/symbol-library';
import {
  commitFiberCraftHistory,
  createFiberCraftHistory,
  redoFiberCraftHistory,
  undoFiberCraftHistory,
  type FiberCraftHistory,
} from './history-engine';
import { createIndexedDbFiberCraftStore, type FiberCraftStore } from './persistence-engine';
import type { ColorSlot, FiberCraftDocument, PolarChart } from './fiber-craft-types';
import './fiber-craft-workspace.css';

type HistoryAction =
  | { readonly type: 'commit'; readonly document: FiberCraftDocument }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'replace'; readonly document: FiberCraftDocument };

const historyReducer = (history: FiberCraftHistory, action: HistoryAction): FiberCraftHistory => {
  switch (action.type) {
    case 'commit': return commitFiberCraftHistory(history, action.document);
    case 'undo': return undoFiberCraftHistory(history);
    case 'redo': return redoFiberCraftHistory(history);
    case 'replace': return createFiberCraftHistory(action.document);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
};

function CrochetCanvas({
  chart,
  palette,
  dialect,
  activeRound,
  completedSteps,
}: {
  chart: PolarChart;
  palette: readonly ColorSlot[];
  dialect: CrochetDialect;
  activeRound: number;
  completedSteps: readonly string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const spacing = Math.min(width, height) / (2 * (Math.max(chart.rounds, 1) + 1));
    const nodeRadius = Math.max(10, Math.min(20, spacing * 0.3));

    context.clearRect(0, 0, width, height);
    context.fillStyle = '#fbfcfd';
    context.fillRect(0, 0, width, height);
    for (let round = 0; round < chart.rounds; round += 1) {
      const complete = completedSteps.includes(`round:${round}`);
      context.beginPath();
      context.arc(centerX, centerY, (round + 1) * spacing, 0, Math.PI * 2);
      context.lineWidth = round === activeRound ? 5 : complete ? 3 : 2;
      context.strokeStyle = round === activeRound ? '#205bd6' : complete ? '#087a55' : '#d7dde3';
      context.setLineDash(complete ? [10, 6] : []);
      context.stroke();
    }
    context.setLineDash([]);

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '600 18px ui-sans-serif, system-ui, sans-serif';
    for (const node of chart.nodes) {
      const point = polarNodeToCartesian(node, spacing);
      const x = centerX + point.x;
      const y = centerY + point.y;
      const swatch = node.colorId ? palette.find((color) => color.id === node.colorId) : undefined;
      context.beginPath();
      context.arc(x, y, nodeRadius, 0, Math.PI * 2);
      context.fillStyle = swatch?.hex ?? '#ffffff';
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = node.symbolId ? '#101820' : '#aeb8c2';
      context.stroke();
      if (node.symbolId) {
        context.fillStyle = '#101820';
        context.fillText(crochetSymbolAbbreviation(node.symbolId, dialect), x, y);
      }
    }
  }, [activeRound, chart, completedSteps, dialect, palette]);

  return (
    <canvas
      ref={canvasRef}
      className="fiber-craft-canvas"
      width={960}
      height={720}
      aria-label={`Crochet round chart. Round ${activeRound + 1} is active.`}
      data-testid="crochet-round-canvas"
    >
      Crochet round chart with {chart.rounds} rounds. Round {activeRound + 1} is active.
    </canvas>
  );
}

export default function FiberCraftWorkspace() {
  const [history, dispatch] = useReducer(
    historyReducer,
    undefined,
    () => createFiberCraftHistory(createStarterCrochetDocument()),
  );
  const [dialect, setDialect] = useState<CrochetDialect>('us');
  const [activeRound, setActiveRound] = useState(0);
  const [activeGridRow, setActiveGridRow] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState('sc-dc');
  const [selectedColor, setSelectedColor] = useState('primary');
  const [newRoundStitches, setNewRoundStitches] = useState('6');
  const [targetText, setTargetText] = useState('6');
  const [status, setStatus] = useState('Preparing local autosave…');
  const [storageReady, setStorageReady] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<FiberCraftDocument | null>(null);
  const storeRef = useRef<FiberCraftStore | null>(null);

  const document = history.present;
  const roundChart = document.chart.kind === 'polar' ? document.chart : null;
  const gridChart = document.chart.kind === 'grid' ? document.chart : null;
  const progress = useMemo(
    () => roundChart ? crochetRoundProgress(document, Math.min(activeRound, Math.max(0, roundChart.rounds - 1))) : null,
    [activeRound, document, roundChart],
  );

  useEffect(() => {
    if (typeof indexedDB === 'undefined') {
      setStatus('Local autosave is unavailable in this browser. Current work remains on screen.');
      return;
    }
    const store = createIndexedDbFiberCraftStore();
    storeRef.current = store;
    let active = true;
    void store.load().then((saved) => {
      if (!active) return;
      if (saved) {
        setPendingRestore(saved);
        setStatus('A local draft is available to restore.');
      } else {
        setStatus('Ready. Changes save locally in this browser.');
      }
      setStorageReady(true);
    }).catch(() => {
      if (!active) return;
      setStatus('Local autosave is unavailable in this browser. Current work remains on screen.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storageReady || pendingRestore || !storeRef.current) return;
    const timer = window.setTimeout(() => {
      const store = storeRef.current;
      if (!store) return;
      void store.save(document).then(() => {
        setStatus('Saved locally in this browser.');
      }).catch(() => {
        setStatus('Could not save locally. Current work remains on screen.');
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [document, pendingRestore, storageReady]);

  useEffect(() => {
    if (roundChart && activeRound >= roundChart.rounds) setActiveRound(Math.max(0, roundChart.rounds - 1));
    if (gridChart && activeGridRow >= gridChart.rows) setActiveGridRow(Math.max(0, gridChart.rows - 1));
  }, [activeGridRow, activeRound, gridChart, roundChart]);

  useEffect(() => {
    setTargetText((document.settings?.crochet?.targetRoundCounts ?? []).join(', '));
  }, [document.settings?.crochet?.targetRoundCounts]);

  const commit = (next: FiberCraftDocument, message: string) => {
    dispatch({ type: 'commit', document: next });
    setStatus(message);
  };

  const placeNextStitch = () => {
    if (!roundChart) return;
    try {
      const next = workNextCrochetStitch(document, activeRound, selectedSymbol, selectedColor);
      commit(next, `Placed ${crochetSymbolLabel(selectedSymbol, dialect)} in round ${activeRound + 1}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not place this stitch.');
    }
  };

  const addRound = () => {
    if (!roundChart) return;
    const count = Number(newRoundStitches);
    try {
      const next = addCrochetRound(document, count);
      commit(next, `Added round ${roundChart.rounds + 1} with ${count} stitches.`);
      setActiveRound(roundChart.rounds);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add this round.');
    }
  };

  const changeChartMode = (mode: 'round' | 'grid') => {
    if ((mode === 'round' && roundChart) || (mode === 'grid' && gridChart)) return;
    const next = switchCrochetChartMode(document, mode);
    commit(next, mode === 'round'
      ? 'Opened a fresh round chart. Undo restores the previous chart.'
      : 'Opened a fresh C2C / filet grid. Undo restores the previous chart.');
    if (mode === 'round') setActiveRound(0);
    else setActiveGridRow(0);
  };

  const toggleGridCell = (row: number, col: number) => {
    try {
      commit(toggleCrochetGridCell(document, row, col, selectedColor), `Updated row ${row + 1}, column ${col + 1}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not update this grid cell.');
    }
  };

  const toggleProgress = (stepId: string, label: string) => {
    try {
      const wasComplete = document.completedSteps.includes(stepId);
      commit(toggleCrochetProgressStep(document, stepId), `${label} marked ${wasComplete ? 'unfinished' : 'complete'}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not update progress.');
    }
  };

  const applyTargets = () => {
    try {
      const values = targetText.trim() === ''
        ? []
        : targetText.split(/[\s,;]+/).filter(Boolean).map((token) => Number(token));
      commit(setCrochetTargetRoundCounts(document, values), values.length > 0
        ? `Saved ${values.length} round-shaping targets.`
        : 'Cleared round-shaping targets.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save round targets.');
    }
  };

  const saveYarnReference = (weight: number, materialClass: string, toolSize: string) => {
    try {
      commit(setCrochetYarnReference(document, weight, materialClass, toolSize), 'Saved the project yarn and hook reference.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the yarn reference.');
    }
  };

  const restoreDraft = () => {
    if (!pendingRestore) return;
    dispatch({ type: 'replace', document: pendingRestore });
    if (pendingRestore.chart.kind === 'polar') setActiveRound(Math.min(activeRound, pendingRestore.chart.rounds - 1));
    if (pendingRestore.chart.kind === 'grid') setActiveGridRow(Math.min(activeGridRow, pendingRestore.chart.rows - 1));
    setPendingRestore(null);
    setStatus('Restored the last local session.');
  };

  const startFresh = () => {
    setPendingRestore(null);
    setStatus('Started with the current fresh chart. Changes will save locally.');
  };

  return (
    <>
      <div className="workspace-header fiber-craft-header">
        <div>
          <h2>Crochet pattern workspace</h2>
          <p>Round, C2C, and filet charting with synchronized instructions and browser-local recovery.</p>
        </div>
        <span className="fiber-craft-local-badge">Local draft</span>
      </div>
      <div className="workspace-body fiber-craft-workspace">
        {pendingRestore ? (
          <section className="fiber-craft-restore" aria-labelledby="fiber-restore-title">
            <div>
              <h3 id="fiber-restore-title">Continue your last local session?</h3>
              <p>A browser-local Fiber Craft draft was found. Restoring does not upload or replace a file on disk.</p>
            </div>
            <div className="fiber-craft-actions">
              <button className="action-button" type="button" onClick={restoreDraft}>Restore last session</button>
              <button className="action-button secondary" type="button" onClick={startFresh}>Start fresh</button>
            </div>
          </section>
        ) : null}

        <div className="fiber-craft-toolbar" role="toolbar" aria-label="Crochet chart history, mode, and terminology">
          <button className="action-button secondary" type="button" disabled={history.past.length === 0} onClick={() => dispatch({ type: 'undo' })}>Undo</button>
          <button className="action-button secondary" type="button" disabled={history.future.length === 0} onClick={() => dispatch({ type: 'redo' })}>Redo</button>
          <label>
            <span>Chart mode</span>
            <select value={roundChart ? 'round' : 'grid'} onChange={(event) => changeChartMode(event.target.value as 'round' | 'grid')}>
              <option value="round">Round / amigurumi</option>
              <option value="grid">C2C / filet grid</option>
            </select>
          </label>
          <label>
            <span>Terminology</span>
            <select value={dialect} onChange={(event) => setDialect(event.target.value as CrochetDialect)}>
              <option value="us">US</option>
              <option value="uk">UK</option>
            </select>
          </label>
          {roundChart ? (
            <label>
              <span>Active round</span>
              <select value={activeRound} onChange={(event) => setActiveRound(Number(event.target.value))}>
                {Array.from({ length: roundChart.rounds }, (_, round) => (
                  <option key={round} value={round}>Round {round + 1}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="fiber-craft-main">
          {roundChart ? (
            <section className="fiber-craft-canvas-panel" aria-labelledby="fiber-chart-heading">
              <div className="fiber-craft-panel-heading">
                <div>
                  <h3 id="fiber-chart-heading">Round chart</h3>
                  <p>{roundChart.rounds} {roundChart.rounds === 1 ? 'round' : 'rounds'} · {roundChart.nodes.length} stitch positions</p>
                </div>
                <strong data-testid="active-round-progress">{progress?.worked ?? 0} of {progress?.total ?? 0} stitches worked</strong>
              </div>
              <CrochetCanvas
                chart={roundChart}
                palette={document.palette}
                dialect={dialect}
                activeRound={activeRound}
                completedSteps={document.completedSteps}
              />
            </section>
          ) : gridChart ? (
            <CrochetGridPanel
              chart={gridChart}
              palette={document.palette}
              selectedColor={selectedColor}
              activeRow={activeGridRow}
              completedSteps={document.completedSteps}
              onActiveRowChange={setActiveGridRow}
              onToggleCell={toggleGridCell}
              onToggleRowComplete={(row) => toggleProgress(`row:${row}`, `Row ${row + 1}`)}
            />
          ) : null}

          <aside className="fiber-craft-inspector" aria-label="Crochet chart inspector">
            {roundChart ? (
              <>
                <section>
                  <h3>Stitch</h3>
                  <label className="fiber-craft-field" htmlFor="fiber-stitch-symbol">
                    <span>Stitch symbol</span>
                    <select id="fiber-stitch-symbol" value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
                      {CROCHET_SYMBOLS.map((symbol) => (
                        <option key={symbol.id} value={symbol.id}>
                          {crochetSymbolLabel(symbol.id, dialect)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fiber-craft-field" htmlFor="fiber-stitch-color">
                    <span>Palette color</span>
                    <select id="fiber-stitch-color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)}>
                      {document.palette.map((color) => <option key={color.id} value={color.id}>{color.label}</option>)}
                    </select>
                  </label>
                  <button className="action-button fiber-craft-wide" type="button" onClick={placeNextStitch} disabled={(progress?.total ?? 0) > 0 && progress?.worked === progress?.total}>Place next stitch</button>
                </section>

                <section>
                  <h3>Add a round</h3>
                  <label className="fiber-craft-field" htmlFor="fiber-round-stitches">
                    <span>Stitches in new round</span>
                    <input id="fiber-round-stitches" type="number" min="1" max="10000" step="1" inputMode="numeric" value={newRoundStitches} onChange={(event) => setNewRoundStitches(event.target.value)} />
                  </label>
                  <button className="action-button secondary fiber-craft-wide" type="button" onClick={addRound}>Add round</button>
                  <button
                    className="action-button secondary fiber-craft-wide"
                    type="button"
                    aria-pressed={document.completedSteps.includes(`round:${activeRound}`)}
                    onClick={() => toggleProgress(`round:${activeRound}`, `Round ${activeRound + 1}`)}
                  >
                    {document.completedSteps.includes(`round:${activeRound}`) ? 'Mark round unfinished' : 'Mark round complete'}
                  </button>
                </section>
              </>
            ) : (
              <section>
                <h3>Mesh paint</h3>
                <label className="fiber-craft-field" htmlFor="fiber-grid-color">
                  <span>Palette color</span>
                  <select id="fiber-grid-color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)}>
                    {document.palette.map((color) => <option key={color.id} value={color.id}>{color.label}</option>)}
                  </select>
                </label>
                <p className="fiber-craft-muted">Select cells in the grid to switch between open and filled mesh blocks.</p>
              </section>
            )}

            <section>
              <h3>Palette</h3>
              <div className="fiber-craft-swatches" aria-label="Project palette">
                {document.palette.map((color) => (
                  <span key={color.id} title={`${color.label}: ${color.hex}`}>
                    <i style={{ background: color.hex }} aria-hidden="true" />
                    {color.label}
                  </span>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <div className="fiber-craft-analysis-grid">
          {roundChart ? (
            <CrochetRoundInsights
              document={document}
              dialect={dialect}
              targetText={targetText}
              onTargetTextChange={setTargetText}
              onApplyTargets={applyTargets}
            />
          ) : null}
          <YarnReferencePanel document={document} onSaveReference={saveYarnReference} />
        </div>

        <p className="fiber-craft-status" role="status" aria-live="polite">{status}</p>
      </div>
    </>
  );
}
