import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  STARTER_KNITTING_GAUGE,
  knittingRowDirection,
  setKnittingConstruction,
  setKnittingGauge,
} from './knitting-document-engine';
import { getKnittingSymbol } from './engines/symbol-library';
import { knittingCableSegment, paintKnittingSymbol } from './knitting-symbol-engine';
import { addKnittingYarnColor, analyzeKnittingFloats, paintKnittingColor, setKnittingFloatThreshold } from './knitting-float-engine';
import type {
  FiberCraftDocument,
  GridChart,
  LengthUnit,
  KnittingConstruction,
} from './fiber-craft-types';

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export function KnittingGridPanel({
  document,
  chart,
  onCommit,
  onStatus,
}: {
  document: FiberCraftDocument;
  chart: GridChart;
  onCommit: (next: FiberCraftDocument, message: string) => void;
  onStatus: (message: string) => void;
}) {
  const savedGauge = document.gauge ?? STARTER_KNITTING_GAUGE;
  const [stitches, setStitches] = useState(String(savedGauge.stitchCount));
  const [rows, setRows] = useState(String(savedGauge.rowCount));
  const [span, setSpan] = useState(String(savedGauge.span));
  const [unit, setUnit] = useState<LengthUnit>(savedGauge.unit);
  const [stitchTool, setStitchTool] = useState('knit');
  const [editingLayer, setEditingLayer] = useState<'stitch' | 'color'>('stitch');
  const [yarnColorId, setYarnColorId] = useState(document.palette[0]?.id ?? '');
  const [newYarnName, setNewYarnName] = useState('');
  const [newYarnHex, setNewYarnHex] = useState('#ab1234');
  const [floatThreshold, setFloatThreshold] = useState(String(document.settings?.knitting?.floatThreshold ?? 5));
  const [cableWidth, setCableWidth] = useState(1);
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
  const construction = document.settings?.knitting?.construction ?? 'flat';

  useEffect(() => {
    const gauge = document.gauge ?? STARTER_KNITTING_GAUGE;
    setStitches(String(gauge.stitchCount));
    setRows(String(gauge.rowCount));
    setSpan(String(gauge.span));
    setUnit(gauge.unit);
  }, [document.gauge]);

  useEffect(() => setFloatThreshold(String(document.settings?.knitting?.floatThreshold ?? 5)), [document.settings?.knitting?.floatThreshold]);

  const paletteById = useMemo(
    () => new Map(document.palette.map((color) => [color.id, color])),
    [document.palette],
  );
  const floatWarnings = useMemo(() => analyzeKnittingFloats(document), [document]);
  const flaggedCells = useMemo(() => new Set(floatWarnings.flatMap((warning) =>
    Array.from({ length: Math.abs(warning.toCol - warning.fromCol) - 1 }, (_, index) =>
      `${warning.row}:${Math.min(warning.fromCol, warning.toCol) + index + 1}`))), [floatWarnings]);

  const saveGauge = () => {
    try {
      const gauge = {
        stitchCount: Number(stitches),
        rowCount: Number(rows),
        span: Number(span),
        unit,
      };
      onCommit(
        setKnittingGauge(document, gauge),
        `Saved knitting gauge: ${formatNumber(gauge.stitchCount)} stitches and ${formatNumber(gauge.rowCount)} rows over ${formatNumber(gauge.span)} ${gauge.unit}.`,
      );
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Could not save the knitting gauge.');
    }
  };

  const gridStyle = {
    '--fiber-knit-aspect': chart.aspectRatio,
  } as CSSProperties;

  const selectedSymbol = stitchTool === 'erase' ? null
    : stitchTool === 'cable-left' || stitchTool === 'cable-right'
      ? `cable-${cableWidth}-${stitchTool === 'cable-left' ? 'left' : 'right'}`
      : stitchTool;
  const paint = (row: number, col: number, clear = false) => {
    try {
      if (editingLayer === 'color') {
        const colorId = clear ? null : yarnColorId || null;
        const next = paintKnittingColor(document, row, col, colorId);
        onCommit(next, colorId ? `Painted ${paletteById.get(colorId)?.label ?? 'yarn'} at row ${row + 1}, stitch ${col + 1}.` : `Cleared yarn color at row ${row + 1}, stitch ${col + 1}.`);
      } else {
        const symbolId = clear ? null : selectedSymbol;
        const next = paintKnittingSymbol(document, row, col, symbolId);
        onCommit(next, symbolId ? `Placed ${getKnittingSymbol(symbolId).name} at row ${row + 1}, stitch ${col + 1}.` : `Cleared row ${row + 1}, stitch ${col + 1}.`);
      }
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Could not edit this knitting stitch.');
    }
  };
  const moveFocus = (element: HTMLElement, row: number, col: number) => {
    const nextRow = Math.max(0, Math.min(chart.rows - 1, row));
    const nextCol = Math.max(0, Math.min(chart.cols - 1, col));
    setActiveCell({ row: nextRow, col: nextCol });
    element.closest('[role="grid"]')?.querySelector<HTMLElement>(`[data-testid="knitting-cell-${nextRow}-${nextCol}"]`)?.focus();
  };

  return (
    <section className="fiber-craft-canvas-panel fiber-knitting-panel" aria-labelledby="fiber-knitting-heading">
      <div className="fiber-craft-panel-heading">
        <div>
          <h3 id="fiber-knitting-heading">Gauge-corrected knitting grid</h3>
          <p>{chart.rows} rows × {chart.cols} stitches · proportions follow the saved swatch gauge</p>
        </div>
        <strong data-testid="knitting-gauge-summary">
          {formatNumber(savedGauge.stitchCount)} stitches × {formatNumber(savedGauge.rowCount)} rows over {formatNumber(savedGauge.span)} {savedGauge.unit}
        </strong>
      </div>

      <div className="fiber-knitting-gauge-controls" aria-label="Knitting gauge">
        <label className="fiber-craft-field" htmlFor="fiber-knitting-gauge-stitches">
          <span>Stitches in gauge</span>
          <input
            id="fiber-knitting-gauge-stitches"
            type="number"
            min="1"
            step="0.1"
            inputMode="decimal"
            value={stitches}
            onChange={(event) => setStitches(event.target.value)}
          />
        </label>
        <label className="fiber-craft-field" htmlFor="fiber-knitting-gauge-rows">
          <span>Rows in gauge</span>
          <input
            id="fiber-knitting-gauge-rows"
            type="number"
            min="1"
            step="0.1"
            inputMode="decimal"
            value={rows}
            onChange={(event) => setRows(event.target.value)}
          />
        </label>
        <label className="fiber-craft-field" htmlFor="fiber-knitting-gauge-span">
          <span>Gauge span</span>
          <input
            id="fiber-knitting-gauge-span"
            type="number"
            min="0.1"
            step="0.1"
            inputMode="decimal"
            value={span}
            onChange={(event) => setSpan(event.target.value)}
          />
        </label>
        <label className="fiber-craft-field" htmlFor="fiber-knitting-gauge-unit">
          <span>Gauge unit</span>
          <select
            id="fiber-knitting-gauge-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as LengthUnit)}
          >
            <option value="in">inches</option>
            <option value="cm">centimeters</option>
          </select>
        </label>
        <label className="fiber-craft-field" htmlFor="fiber-knitting-construction">
          <span>Construction</span>
          <select
            id="fiber-knitting-construction"
            value={construction}
            onChange={(event) => {
              const next = event.target.value as KnittingConstruction;
              try {
                onCommit(
                  setKnittingConstruction(document, next),
                  next === 'round' ? 'Set knitting chart to in-the-round reading.' : 'Set knitting chart to flat row reading.',
                );
              } catch (error) {
                onStatus(error instanceof Error ? error.message : 'Could not change knitting construction.');
              }
            }}
          >
            <option value="flat">Flat / turned rows</option>
            <option value="round">In the round</option>
          </select>
        </label>
        <button className="action-button secondary" type="button" onClick={saveGauge}>
          Save knitting gauge
        </button>
        <p className="fiber-craft-muted">
          Measure a swatch, then save its stitch and row counts. The grid reshapes to match the knitted fabric instead of forcing square graph-paper cells.
        </p>
      </div>

      <div className="fiber-knitting-symbol-controls" aria-label="Knitting stitch tools">
        <label className="fiber-craft-field" htmlFor="fiber-knitting-editing-layer">
          <span>Editing layer</span>
          <select id="fiber-knitting-editing-layer" value={editingLayer} onChange={(event) => setEditingLayer(event.target.value as 'stitch' | 'color')}>
            <option value="stitch">Stitch symbols</option>
            <option value="color">Yarn colors</option>
          </select>
        </label>
        {editingLayer === 'color' ? <>
          <label className="fiber-craft-field" htmlFor="fiber-knitting-yarn-color">
            <span>Yarn color</span>
            <select id="fiber-knitting-yarn-color" value={yarnColorId} onChange={(event) => setYarnColorId(event.target.value)}>
              {document.palette.map((color) => <option value={color.id} key={color.id}>{color.label}</option>)}
            </select>
          </label>
          <label className="fiber-craft-field" htmlFor="fiber-knitting-new-yarn-name">
            <span>New yarn name</span>
            <input id="fiber-knitting-new-yarn-name" value={newYarnName} maxLength={80} onChange={(event) => setNewYarnName(event.target.value)} />
          </label>
          <label className="fiber-craft-field" htmlFor="fiber-knitting-new-yarn-hex">
            <span>New yarn color</span>
            <input id="fiber-knitting-new-yarn-hex" type="color" value={newYarnHex} onChange={(event) => setNewYarnHex(event.target.value)} />
          </label>
          <button className="action-button secondary" type="button" onClick={() => {
            try {
              const next = addKnittingYarnColor(document, newYarnName, newYarnHex);
              setYarnColorId(next.palette[next.palette.length - 1].id);
              setNewYarnName('');
              onCommit(next, `Added yarn color ${next.palette[next.palette.length - 1].label}.`);
            } catch (error) { onStatus(error instanceof Error ? error.message : 'Could not add yarn color.'); }
          }}>Add yarn color</button>
        </> : <>
        <label className="fiber-craft-field" htmlFor="fiber-knitting-stitch-tool">
          <span>Stitch tool</span>
          <select id="fiber-knitting-stitch-tool" value={stitchTool} onChange={(event) => setStitchTool(event.target.value)}>
            <option value="knit">Knit (blank chart symbol)</option>
            <option value="purl">Purl (dot)</option>
            <option value="yarn-over">Yarn over</option>
            <option value="k2tog">K2tog</option>
            <option value="ssk">SSK</option>
            <option value="cable-left">Left-cross cable</option>
            <option value="cable-right">Right-cross cable</option>
            <option value="erase">Clear stitch</option>
          </select>
        </label>
        {(stitchTool === 'cable-left' || stitchTool === 'cable-right') && (
          <label className="fiber-craft-field" htmlFor="fiber-knitting-cable-width">
            <span>Cable stitches per side</span>
            <select id="fiber-knitting-cable-width" value={cableWidth} onChange={(event) => setCableWidth(Number(event.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((width) => <option value={width} key={width}>{width} over {width}</option>)}
            </select>
          </label>
        )}
        </>}
        <p className="fiber-craft-muted">Select a stitch or yarn color, then click a cell or focus it and press Enter/Space. Arrow keys move; Delete clears the active layer. Cable crosses occupy their full width and cannot run past the row edge.</p>
      </div>

      <div className="fiber-craft-grid-scroll fiber-knitting-scroll" tabIndex={0} aria-label="Scrollable gauge-corrected knitting chart">
        <div
          className="fiber-knitting-grid"
          role="grid"
          aria-label={`Knitting grid, ${chart.rows} rows by ${chart.cols} stitches`}
          aria-rowcount={chart.rows}
          aria-colcount={chart.cols}
          style={gridStyle}
        >
          {Array.from({ length: chart.rows }, (_, offset) => chart.rows - 1 - offset).map((row) => {
            const reading = knittingRowDirection(row, construction);
            const sideLabel = reading.side === 'right' ? 'RS' : 'WS';
            const directionLabel = reading.direction === 'right-to-left' ? 'right to left' : 'left to right';
            return (
            <div
              className="fiber-knitting-row"
              role="row"
              key={row}
              data-testid={`knitting-row-${row}`}
              data-side={reading.side}
              data-direction={reading.direction}
            >
              <div
                className="fiber-knitting-row-label"
                role="rowheader"
                aria-label={`Row ${row + 1}, ${reading.side} side, read ${directionLabel}`}
              >
                <span aria-hidden="true">{reading.direction === 'right-to-left' ? '←' : '→'}</span>
                <b>{row + 1}</b>
                <small>{sideLabel}</small>
              </div>
              {chart.cells
                .filter((cell) => cell.row === row)
                .toSorted((a, b) => a.col - b.col)
                .map((cell) => {
                  const color = cell.colorId ? paletteById.get(cell.colorId) : undefined;
                  const symbol = cell.symbolId ? getKnittingSymbol(cell.symbolId) : null;
                  const cable = knittingCableSegment(chart, cell.row, cell.col);
                  const glyph = cable
                    ? cable.index < cable.span / 2 ? '╲' : '╱'
                    : symbol?.glyph === 'blank' ? ''
                      : symbol?.glyph === 'dot' ? '•'
                        : symbol?.glyph === 'yo' ? '○'
                          : symbol?.glyph === 'k2tog' ? '╱'
                            : symbol?.glyph === 'ssk' ? '╲' : '';
                  return (
                    <div
                      className="fiber-knitting-cell"
                      role="gridcell"
                      aria-label={`Row ${cell.row + 1}, stitch ${cell.col + 1}${symbol ? `, ${symbol.name}` : ', uncharted'}${cable ? `, cable segment ${cable.index + 1} of ${cable.span}` : ''}${color ? `, ${color.label}` : ''}`}
                      data-testid={`knitting-cell-${cell.row}-${cell.col}`}
                      data-symbol={cell.symbolId ?? ''}
                      data-color={cell.colorId ?? ''}
                      data-float-warning={flaggedCells.has(`${cell.row}:${cell.col}`) ? 'true' : undefined}
                      key={`${cell.row}:${cell.col}`}
                      tabIndex={activeCell.row === cell.row && activeCell.col === cell.col ? 0 : -1}
                      onFocus={() => setActiveCell({ row: cell.row, col: cell.col })}
                      onClick={() => { setActiveCell({ row: cell.row, col: cell.col }); paint(cell.row, cell.col); }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); paint(cell.row, cell.col); return; }
                        if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); paint(cell.row, cell.col, true); return; }
                        const delta = event.key === 'ArrowRight' ? [0, 1] : event.key === 'ArrowLeft' ? [0, -1]
                          : event.key === 'ArrowDown' ? [-1, 0] : event.key === 'ArrowUp' ? [1, 0] : null;
                        if (delta) { event.preventDefault(); moveFocus(event.currentTarget, cell.row + delta[0], cell.col + delta[1]); }
                      }}
                      style={color ? { background: color.hex } : undefined}
                    >
                      {symbol ? <span aria-hidden="true">{glyph}</span> : null}
                    </div>
                  );
                })}
            </div>
            );
          })}
        </div>
      </div>

      <div className="fiber-craft-compiler-summary">
        <section aria-label="Float review" className="fiber-knitting-float-review">
          <h4>Stranded / intarsia float review</h4>
          <label className="fiber-craft-field" htmlFor="fiber-knitting-float-threshold"><span>Flag gaps longer than (stitches)</span>
            <input id="fiber-knitting-float-threshold" type="number" min="1" max="20" step="1" value={floatThreshold} onChange={(event) => setFloatThreshold(event.target.value)} />
          </label>
          <button className="action-button secondary" type="button" onClick={() => {
            try { onCommit(setKnittingFloatThreshold(document, Number(floatThreshold)), `Float review threshold saved at ${floatThreshold} stitches.`); }
            catch (error) { onStatus(error instanceof Error ? error.message : 'Could not save float threshold.'); }
          }}>Save float threshold</button>
          <p className="fiber-craft-muted">Only fully colored gaps between uses of the same yarn are checked. This planning alert is not a universal knitting limit; consider trapping a long stranded float or dividing an intarsia area into separate bobbins.</p>
          <p data-testid="knitting-float-summary">{floatWarnings.length} gap{floatWarnings.length === 1 ? '' : 's'} longer than {document.settings?.knitting?.floatThreshold ?? 5} stitches.</p>
          {floatWarnings.length > 0 && <ul>{floatWarnings.map((warning) => <li key={`${warning.row}:${warning.colorId}:${warning.fromCol}:${warning.toCol}`}>
            Row {warning.row + 1}: {paletteById.get(warning.colorId)?.label ?? warning.colorId} crosses {warning.stitchesBetween} stitches between stitch {warning.fromCol + 1} and {warning.toCol + 1} ({warning.direction}).
          </li>)}</ul>}
        </section>
        <p><strong>Stitch key:</strong> blank = knit on RS / purl on WS; • = purl on RS / knit on WS; ○ = yarn over; ╱ = k2tog; ╲ = SSK. A cable cross spans its labelled number of stitches; its crossing direction and width are retained in the project file.</p>
        <p data-testid="knitting-construction-summary">
          <strong>{construction === 'round' ? 'In the round' : 'Flat'}:</strong>{' '}
          {construction === 'round'
            ? 'every round reads right to left on the right side.'
            : 'right-side rows read right to left; wrong-side rows read left to right.'}
        </p>
        <p>
          <strong>Gauge preview:</strong> each stitch cell is {chart.aspectRatio.toFixed(2)}× as wide as it is tall.
        </p>
        <p className="fiber-craft-muted">
          The starter gauge is editable project data, not a yarn-weight recommendation. Use the gauge from your swatch or pattern for an accurate preview.
        </p>
      </div>
    </section>
  );
}
