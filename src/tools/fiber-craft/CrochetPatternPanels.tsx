import { useEffect, useMemo, useRef, useState } from 'react';
import { CYC_PROJECT_LEVELS, type CycProjectLevel } from './crochet-document-engine';
import {
  analyzeAmigurumiGrowth,
  compileC2CRows,
  compileCrochetWrittenPattern,
  compileFiletRows,
  validateCrochetPattern,
} from './engines/crochet-pattern-engine';
import {
  gridCountsForPhysicalSize,
  gridPhysicalDimensions,
  polarRoundPhysicalDimensions,
  roundStitchesForDiameter,
} from './engines/geometry-engine';
import {
  CYC_YARN_WEIGHT_STANDARDS,
  formatCrochetGaugeRange,
  formatHookRange,
  getYarnWeightStandard,
} from './engines/yarn-standard-library';
import type { CrochetDialect } from './engines/symbol-library';
import type { ColorSlot, FiberCraftDocument, GaugeSwatch, GridChart, LengthUnit } from './fiber-craft-types';

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
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const c2c = useMemo(() => compileC2CRows(chart), [chart]);
  const filet = useMemo(() => compileFiletRows(chart), [chart]);
  const filledBlocks = c2c.reduce((sum, row) => sum + row.filledBlocks, 0);
  const activeFilet = filet[activeRow] ?? filet[0];
  const paletteById = useMemo(() => new Map(palette.map((color) => [color.id, color])), [palette]);
  const activeComplete = completedSteps.includes(`row:${activeRow}`);

  const centerActiveRow = () => {
    const scroller = gridScrollRef.current;
    const row = activeRowRef.current;
    if (!scroller || !row) return;
    const top = row.offsetTop - Math.max(0, (scroller.clientHeight - row.clientHeight) / 2);
    const left = row.offsetLeft - Math.max(0, (scroller.clientWidth - row.clientWidth) / 2);
    scroller.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: 'auto' });
    row.focus({ preventScroll: true });
  };

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
          <button className="action-button secondary" type="button" onClick={centerActiveRow}>Center active row</button>
          <button className="action-button secondary" type="button" aria-pressed={activeComplete} onClick={() => onToggleRowComplete(activeRow)}>
            {activeComplete ? 'Mark row unfinished' : 'Mark row complete'}
          </button>
        </div>
      </div>

      <div ref={gridScrollRef} className="fiber-craft-grid-scroll" tabIndex={0} aria-label="Scrollable crochet chart grid">
        <div className="fiber-craft-grid" role="group" aria-label={`${chart.rows} by ${chart.cols} crochet grid`}>
          {Array.from({ length: chart.rows }, (_, row) => {
            const cells = chart.cells.filter((cell) => cell.row === row).toSorted((a, b) => a.col - b.col);
            const rowComplete = completedSteps.includes(`row:${row}`);
            return (
              <div
                ref={row === activeRow ? activeRowRef : undefined}
                className="fiber-craft-grid-row"
                data-active={row === activeRow ? 'true' : 'false'}
                data-complete={rowComplete ? 'true' : 'false'}
                key={row}
                tabIndex={row === activeRow ? -1 : undefined}
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
        <details className="fiber-craft-compiler-details">
          <summary>C2C row-by-row counts</summary>
          <ol className="fiber-craft-plain-list" data-testid="c2c-row-counts">
            {c2c.map((row) => (
              <li key={row.index}>C2C row {row.index + 1}: {row.filledBlocks} filled of {row.totalBlocks} {row.totalBlocks === 1 ? 'block' : 'blocks'}.</li>
            ))}
          </ol>
        </details>
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
          <input id="fiber-round-targets" value={targetText} inputMode="numeric" placeholder="6, 12, 18, 24" onChange={(event) => onTargetTextChange(event.target.value)} />
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
              <li key={round.round}>Round {round.round + 1}: {round.stitches} stitches{round.round > 0 ? ` (${round.delta >= 0 ? '+' : ''}${round.delta})` : ''} · {round.status.replace('-', ' ')}</li>
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
          {CYC_YARN_WEIGHT_STANDARDS.map((entry) => <option key={entry.weight} value={entry.weight}>{entry.weight} · {entry.name}</option>)}
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

const positiveNumber = (value: string): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatMeasurement = (value: number): string => value.toFixed(value >= 10 ? 1 : 2);

export function GaugeScalingPanel({ document, onSaveGauge }: {
  document: FiberCraftDocument;
  onSaveGauge: (gauge: GaugeSwatch) => void;
}) {
  const [stitchCount, setStitchCount] = useState(String(document.gauge?.stitchCount ?? 16));
  const [rowCount, setRowCount] = useState(String(document.gauge?.rowCount ?? 20));
  const [span, setSpan] = useState(String(document.gauge?.span ?? 4));
  const [unit, setUnit] = useState<LengthUnit>(document.gauge?.unit ?? 'in');
  const [desiredWidth, setDesiredWidth] = useState('');
  const [desiredHeight, setDesiredHeight] = useState('');
  const [desiredDiameter, setDesiredDiameter] = useState('');

  useEffect(() => {
    const gauge = document.gauge;
    if (!gauge) return;
    setStitchCount(String(gauge.stitchCount));
    setRowCount(String(gauge.rowCount));
    setSpan(String(gauge.span));
    setUnit(gauge.unit);
  }, [document.gauge]);

  const draftGauge = useMemo<GaugeSwatch | null>(() => {
    const stitches = positiveNumber(stitchCount);
    const rows = positiveNumber(rowCount);
    const measuredSpan = positiveNumber(span);
    if (stitches === null || rows === null || measuredSpan === null) return null;
    return { stitchCount: stitches, rowCount: rows, span: measuredSpan, unit };
  }, [rowCount, span, stitchCount, unit]);

  const current = useMemo(() => {
    if (!draftGauge) return null;
    if (document.chart.kind === 'grid') {
      const size = gridPhysicalDimensions(document.chart, draftGauge, unit);
      return { kind: 'grid' as const, ...size };
    }
    if (document.chart.kind === 'polar') {
      const size = polarRoundPhysicalDimensions(document.chart, document.chart.rounds - 1, draftGauge, unit);
      return { kind: 'round' as const, ...size };
    }
    return null;
  }, [document.chart, draftGauge, unit]);

  const recommendation = useMemo(() => {
    if (!draftGauge) return null;
    try {
      if (document.chart.kind === 'grid') {
        const width = positiveNumber(desiredWidth);
        const height = positiveNumber(desiredHeight);
        return width !== null && height !== null
          ? { kind: 'grid' as const, ...gridCountsForPhysicalSize(width, height, draftGauge, unit) }
          : null;
      }
      if (document.chart.kind === 'polar') {
        const diameter = positiveNumber(desiredDiameter);
        return diameter !== null
          ? { kind: 'round' as const, stitches: roundStitchesForDiameter(diameter, draftGauge, unit) }
          : null;
      }
      return null;
    } catch {
      return null;
    }
  }, [desiredDiameter, desiredHeight, desiredWidth, document.chart.kind, draftGauge, unit]);

  return (
    <section className="fiber-craft-analysis-card" aria-labelledby="fiber-gauge-heading">
      <div className="fiber-craft-analysis-heading">
        <div>
          <h3 id="fiber-gauge-heading">Gauge & finished size</h3>
          <p>Enter a measured swatch to translate between chart counts and finished project dimensions.</p>
        </div>
      </div>
      <label className="fiber-craft-field" htmlFor="fiber-gauge-stitches">
        <span>Stitches in measured span</span>
        <input id="fiber-gauge-stitches" type="number" min="0.01" step="0.01" inputMode="decimal" value={stitchCount} onChange={(event) => setStitchCount(event.target.value)} />
      </label>
      <label className="fiber-craft-field" htmlFor="fiber-gauge-rows">
        <span>Rows in measured span</span>
        <input id="fiber-gauge-rows" type="number" min="0.01" step="0.01" inputMode="decimal" value={rowCount} onChange={(event) => setRowCount(event.target.value)} />
      </label>
      <label className="fiber-craft-field" htmlFor="fiber-gauge-span">
        <span>Measured span</span>
        <input id="fiber-gauge-span" type="number" min="0.01" step="0.01" inputMode="decimal" value={span} onChange={(event) => setSpan(event.target.value)} />
      </label>
      <label className="fiber-craft-field" htmlFor="fiber-gauge-unit">
        <span>Gauge unit</span>
        <select id="fiber-gauge-unit" value={unit} onChange={(event) => setUnit(event.target.value as LengthUnit)}>
          <option value="in">inches</option>
          <option value="cm">centimeters</option>
        </select>
      </label>
      <button className="action-button fiber-craft-wide" type="button" disabled={!draftGauge} onClick={() => draftGauge && onSaveGauge(draftGauge)}>Save measured gauge</button>

      <div className="fiber-craft-reference-readout" data-testid="gauge-scaling">
        {current?.kind === 'grid' ? (
          <>
            <strong>Current chart size</strong>
            <span>{document.chart.kind === 'grid' ? `${document.chart.cols} columns × ${document.chart.rows} rows` : ''}</span>
            <span>≈ {formatMeasurement(current.width)} {unit} wide × {formatMeasurement(current.height)} {unit} tall</span>
          </>
        ) : current?.kind === 'round' ? (
          <>
            <strong>Outer round size</strong>
            <span>{current.stitches} stitches ≈ {formatMeasurement(current.circumference)} {unit} circumference</span>
            <span>≈ {formatMeasurement(current.diameter)} {unit} diameter</span>
          </>
        ) : <span>Enter positive swatch values to calculate finished size.</span>}
      </div>

      {document.chart.kind === 'grid' ? (
        <>
          <label className="fiber-craft-field" htmlFor="fiber-finished-width">
            <span>Desired finished width ({unit})</span>
            <input id="fiber-finished-width" type="number" min="0.01" step="0.01" inputMode="decimal" value={desiredWidth} onChange={(event) => setDesiredWidth(event.target.value)} />
          </label>
          <label className="fiber-craft-field" htmlFor="fiber-finished-height">
            <span>Desired finished height ({unit})</span>
            <input id="fiber-finished-height" type="number" min="0.01" step="0.01" inputMode="decimal" value={desiredHeight} onChange={(event) => setDesiredHeight(event.target.value)} />
          </label>
          {recommendation?.kind === 'grid' ? <p className="fiber-craft-good" data-testid="gauge-recommendation">Recommended chart: {recommendation.cols} columns × {recommendation.rows} rows.</p> : null}
        </>
      ) : document.chart.kind === 'polar' ? (
        <>
          <label className="fiber-craft-field" htmlFor="fiber-finished-diameter">
            <span>Desired finished diameter ({unit})</span>
            <input id="fiber-finished-diameter" type="number" min="0.01" step="0.01" inputMode="decimal" value={desiredDiameter} onChange={(event) => setDesiredDiameter(event.target.value)} />
          </label>
          {recommendation?.kind === 'round' ? <p className="fiber-craft-good" data-testid="gauge-recommendation">Recommended final round: {recommendation.stitches} stitches.</p> : null}
        </>
      ) : null}
    </section>
  );
}

export function PatternDetailsPanel({ document, onSaveClassification }: {
  document: FiberCraftDocument;
  onSaveClassification: (difficulty: CycProjectLevel, techniqueTags: readonly string[]) => void;
}) {
  const storedLevel = CYC_PROJECT_LEVELS.includes(document.metadata.difficulty as CycProjectLevel)
    ? document.metadata.difficulty as CycProjectLevel
    : 'Basic';
  const [difficulty, setDifficulty] = useState<CycProjectLevel>(storedLevel);
  const [tagText, setTagText] = useState(document.metadata.techniqueTags.join(', '));

  useEffect(() => {
    setDifficulty(CYC_PROJECT_LEVELS.includes(document.metadata.difficulty as CycProjectLevel)
      ? document.metadata.difficulty as CycProjectLevel
      : 'Basic');
    setTagText(document.metadata.techniqueTags.join(', '));
  }, [document.metadata.difficulty, document.metadata.techniqueTags]);

  const tags = tagText.split(/[,;\n]+/).map((tag) => tag.trim()).filter(Boolean);

  return (
    <section className="fiber-craft-analysis-card" aria-labelledby="fiber-pattern-details-heading">
      <div className="fiber-craft-analysis-heading">
        <div>
          <h3 id="fiber-pattern-details-heading">Pattern level & techniques</h3>
          <p>Classify the project with Craft Yarn Council project levels and your own technique tags.</p>
        </div>
      </div>
      <label className="fiber-craft-field" htmlFor="fiber-project-level">
        <span>Project level</span>
        <select id="fiber-project-level" value={difficulty} onChange={(event) => setDifficulty(event.target.value as CycProjectLevel)}>
          {CYC_PROJECT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      </label>
      <label className="fiber-craft-field" htmlFor="fiber-technique-tags">
        <span>Technique tags</span>
        <input id="fiber-technique-tags" value={tagText} placeholder="amigurumi, C2C, shaping" onChange={(event) => setTagText(event.target.value)} />
      </label>
      <button className="action-button fiber-craft-wide" type="button" onClick={() => onSaveClassification(difficulty, tags)}>Save pattern details</button>
      <div className="fiber-craft-reference-readout" data-testid="pattern-details-summary">
        <strong>{document.metadata.difficulty}</strong>
        <span>{document.metadata.techniqueTags.length > 0 ? document.metadata.techniqueTags.join(' · ') : 'No technique tags saved yet.'}</span>
      </div>
    </section>
  );
}
