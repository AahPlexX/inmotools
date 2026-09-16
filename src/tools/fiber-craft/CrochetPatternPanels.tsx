import { useEffect, useMemo, useState } from 'react';
import {
  analyzeAmigurumiGrowth,
  compileC2CRows,
  compileCrochetWrittenPattern,
  compileFiletRows,
  validateCrochetPattern,
} from './engines/crochet-pattern-engine';
import {
  CYC_YARN_WEIGHT_STANDARDS,
  formatCrochetGaugeRange,
  formatHookRange,
  getYarnWeightStandard,
} from './engines/yarn-standard-library';
import type { CrochetDialect } from './engines/symbol-library';
import type { ColorSlot, FiberCraftDocument, GridChart } from './fiber-craft-types';

export function CrochetGridPanel({
  chart,
  palette,
  selectedColor,
  activeRow,
  completedSteps,
  onActiveRowChange,
  onToggleCell,
  onToggleRowComplete,
}: {
  chart: GridChart;
  palette: readonly ColorSlot[];
  selectedColor: string;
  activeRow: number;
  completedSteps: readonly string[];
  onActiveRowChange: (row: number) => void;
  onToggleCell: (row: number, col: number) => void;
  onToggleRowComplete: (row: number) => void;
}) {
  const c2c = useMemo(() => compileC2CRows(chart), [chart]);
  const filet = useMemo(() => compileFiletRows(chart), [chart]);
  const filledBlocks = c2c.reduce((sum, row) => sum + row.filledBlocks, 0);
  const activeFilet = filet[activeRow] ?? filet[0];
  const paletteById = useMemo(() => new Map(palette.map((color) => [color.id, color])), [palette]);
  const activeComplete = completedSteps.includes(`row:${activeRow}`);

  return (
    <section className="fiber-craft-canvas-panel" aria-labelledby="fiber-grid-heading">
      <div className="fiber-craft-panel-heading">
        <div>
          <h3 id="fiber-grid-heading">C2C / filet grid</h3>
          <p>{chart.rows} rows × {chart.cols} columns · {filledBlocks} filled blocks</p>
        </div>
        <div className="fiber-craft-inline-controls">
          <label className="fiber-craft-field" htmlFor="fiber-active-grid-row">
            <span>Active row</span>
            <select id="fiber-active-grid-row" value={activeRow} onChange={(event) => onActiveRowChange(Number(event.target.value))}>
              {Array.from({ length: chart.rows }, (_, row) => <option key={row} value={row}>Row {row + 1}</option>)}
            </select>
          </label>
          <button
            className="action-button secondary"
            type="button"
            aria-pressed={activeComplete}
            onClick={() => onToggleRowComplete(activeRow)}
          >
            {activeComplete ? 'Mark row unfinished' : 'Mark row complete'}
          </button>
        </div>
      </div>

      <div className="fiber-craft-grid-scroll" tabIndex={0} aria-label="Scrollable crochet chart grid">
        <div className="fiber-craft-grid" role="group" aria-label={`${chart.rows} by ${chart.cols} crochet grid`}>
          {Array.from({ length: chart.rows }, (_, row) => {
            const cells = chart.cells.filter((cell) => cell.row === row).toSorted((a, b) => a.col - b.col);
            const rowComplete = completedSteps.includes(`row:${row}`);
            return (
              <div
                className="fiber-craft-grid-row"
                data-active={row === activeRow ? 'true' : 'false'}
                data-complete={rowComplete ? 'true' : 'false'}
                key={row}
                aria-label={`Row ${row + 1}${rowComplete ? ', complete' : ''}`}
              >
                <span className="fiber-craft-grid-row-label" aria-hidden="true">{row + 1}</span>
                {cells.map((cell) => {
                  const filled = cell.colorId !== null || cell.symbolId !== null;
                  const swatch = cell.colorId ? paletteById.get(cell.colorId) : undefined;
                  return (
                    <button
                      className="fiber-craft-grid-cell"
                      type="button"
                      key={`${cell.row}:${cell.col}`}
                      aria-pressed={filled}
                      aria-label={`Row ${cell.row + 1}, column ${cell.col + 1}, ${filled ? `filled${swatch ? ` with ${swatch.label}` : ''}` : 'open'}`}
                      title={`Row ${cell.row + 1}, column ${cell.col + 1}`}
                      style={filled ? { background: swatch?.hex ?? '#205bd6' } : undefined}
                      onClick={() => onToggleCell(cell.row, cell.col)}
                    >
                      {filled ? '●' : ''}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="fiber-craft-compiler-summary">
        <p data-testid="c2c-summary"><strong>C2C:</strong> {c2c.length} diagonal rows · {filledBlocks} filled blocks.</p>
        <p data-testid="filet-summary"><strong>Filet:</strong> {activeFilet?.text ?? 'No active row.'}</p>
        <p className="fiber-craft-muted">Paint color: {paletteById.get(selectedColor)?.label ?? selectedColor}. Select any cell to toggle it.</p>
      </div>
    </section>
  );
}

export function CrochetRoundInsights({
  document,
  dialect,
  targetText,
  onTargetTextChange,
  onApplyTargets,
}: {
  document: FiberCraftDocument;
  dialect: CrochetDialect;
  targetText: string;
  onTargetTextChange: (value: string) => void;
  onApplyTargets: () => void;
}) {
  const targetCounts = document.settings?.crochet?.targetRoundCounts ?? [];
  const written = useMemo(() => compileCrochetWrittenPattern(document, dialect), [dialect, document]);
  const findings = useMemo(() => validateCrochetPattern(document, targetCounts), [document, targetCounts]);
  const growth = useMemo(() => {
    if (document.chart.kind !== 'polar') return [];
    return analyzeAmigurumiGrowth(document.chart, targetCounts);
  }, [document, targetCounts]);

  return (
    <section className="fiber-craft-analysis-card" aria-labelledby="fiber-written-heading">
      <div className="fiber-craft-analysis-heading">
        <div>
          <h3 id="fiber-written-heading">Written pattern & shaping</h3>
          <p>Generated from the chart so the visual and written versions stay synchronized.</p>
        </div>
      </div>

      <div className="fiber-craft-target-editor">
        <label className="fiber-craft-field" htmlFor="fiber-round-targets">
          <span>Target stitches by round</span>
          <input
            id="fiber-round-targets"
            value={targetText}
            inputMode="numeric"
            placeholder="6, 12, 18, 24"
            onChange={(event) => onTargetTextChange(event.target.value)}
          />
        </label>
        <button className="action-button secondary" type="button" onClick={onApplyTargets}>Apply targets</button>
      </div>

      <div className="fiber-craft-insight-columns">
        <div>
          <h4>Instructions</h4>
          <ol className="fiber-craft-plain-list" data-testid="written-pattern">
            {written.map((round) => <li key={round.round}>{round.text}</li>)}
          </ol>
        </div>
        <div>
          <h4>Pattern check</h4>
          <div data-testid="pattern-validation">
            {findings.length === 0 ? <p className="fiber-craft-good">No stitch-count issues found.</p> : (
              <ul className="fiber-craft-plain-list">
                {findings.map((finding, index) => <li key={`${finding.round}:${finding.code}:${index}`}>{finding.message}</li>)}
              </ul>
            )}
          </div>
        </div>
        <div>
          <h4>Round growth</h4>
          <ul className="fiber-craft-plain-list" data-testid="amigurumi-growth">
            {growth.map((round) => (
              <li key={round.round}>
                Round {round.round + 1}: {round.stitches} stitches{round.round > 0 ? ` (${round.delta >= 0 ? '+' : ''}${round.delta})` : ''} · {round.status.replace('-', ' ')}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function YarnReferencePanel({
  document,
  onSaveReference,
}: {
  document: FiberCraftDocument;
  onSaveReference: (weight: number, materialClass: string, toolSize: string) => void;
}) {
  const persistedWeight = document.settings?.crochet?.yarnWeight;
  const [weight, setWeight] = useState(persistedWeight ?? 4);
  const [materialClass, setMaterialClass] = useState(document.metadata.materialClass);
  const [toolSize, setToolSize] = useState(document.metadata.toolSize);
  const standard = getYarnWeightStandard(weight);

  useEffect(() => {
    if (persistedWeight !== null && persistedWeight !== undefined) setWeight(persistedWeight);
  }, [persistedWeight]);

  useEffect(() => {
    setMaterialClass(document.metadata.materialClass);
    setToolSize(document.metadata.toolSize);
  }, [document.metadata.materialClass, document.metadata.toolSize]);

  const useStandard = () => {
    const nextMaterial = `${standard.weight} ${standard.name}`;
    const nextTool = formatHookRange(standard);
    setMaterialClass(nextMaterial);
    setToolSize(nextTool);
    onSaveReference(weight, nextMaterial, nextTool);
  };

  return (
    <section className="fiber-craft-analysis-card" aria-labelledby="fiber-yarn-heading">
      <div className="fiber-craft-analysis-heading">
        <div>
          <h3 id="fiber-yarn-heading">Yarn & hook reference</h3>
          <p>Craft Yarn Council guideline ranges. Check the yarn label and your own gauge swatch for the project.</p>
        </div>
      </div>
      <label className="fiber-craft-field" htmlFor="fiber-yarn-weight">
        <span>Yarn weight</span>
        <select id="fiber-yarn-weight" value={weight} onChange={(event) => setWeight(Number(event.target.value))}>
          {CYC_YARN_WEIGHT_STANDARDS.map((entry) => (
            <option key={entry.weight} value={entry.weight}>{entry.weight} · {entry.name}</option>
          ))}
        </select>
      </label>
      <div className="fiber-craft-reference-readout" data-testid="yarn-reference">
        <strong>{standard.name}</strong>
        <span>{formatCrochetGaugeRange(standard)}</span>
        <span>Hook guideline: {formatHookRange(standard)} ({standard.usHook})</span>
      </div>
      <button className="action-button secondary fiber-craft-wide" type="button" onClick={useStandard}>Use these project defaults</button>
      <label className="fiber-craft-field" htmlFor="fiber-material-class">
        <span>Project yarn / material</span>
        <input id="fiber-material-class" value={materialClass} onChange={(event) => setMaterialClass(event.target.value)} />
      </label>
      <label className="fiber-craft-field" htmlFor="fiber-tool-size">
        <span>Project hook</span>
        <input id="fiber-tool-size" value={toolSize} onChange={(event) => setToolSize(event.target.value)} />
      </label>
      <button className="action-button fiber-craft-wide" type="button" onClick={() => onSaveReference(weight, materialClass, toolSize)}>Save project reference</button>
    </section>
  );
}
