import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  STARTER_KNITTING_GAUGE,
  setKnittingGauge,
} from './knitting-document-engine';
import { getKnittingSymbol } from './engines/symbol-library';
import type {
  FiberCraftDocument,
  GridChart,
  LengthUnit,
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

  useEffect(() => {
    const gauge = document.gauge ?? STARTER_KNITTING_GAUGE;
    setStitches(String(gauge.stitchCount));
    setRows(String(gauge.rowCount));
    setSpan(String(gauge.span));
    setUnit(gauge.unit);
  }, [document.gauge]);

  const paletteById = useMemo(
    () => new Map(document.palette.map((color) => [color.id, color])),
    [document.palette],
  );

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
        <button className="action-button secondary" type="button" onClick={saveGauge}>
          Save knitting gauge
        </button>
        <p className="fiber-craft-muted">
          Measure a swatch, then save its stitch and row counts. The grid reshapes to match the knitted fabric instead of forcing square graph-paper cells.
        </p>
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
          {Array.from({ length: chart.rows }, (_, row) => (
            <div className="fiber-knitting-row" role="row" key={row}>
              {chart.cells
                .filter((cell) => cell.row === row)
                .toSorted((a, b) => a.col - b.col)
                .map((cell) => {
                  const color = cell.colorId ? paletteById.get(cell.colorId) : undefined;
                  const symbol = cell.symbolId ? getKnittingSymbol(cell.symbolId) : null;
                  return (
                    <div
                      className="fiber-knitting-cell"
                      role="gridcell"
                      aria-label={`Row ${cell.row + 1}, stitch ${cell.col + 1}${symbol ? `, ${symbol.name}` : ', blank'}${color ? `, ${color.label}` : ''}`}
                      data-testid={`knitting-cell-${cell.row}-${cell.col}`}
                      key={`${cell.row}:${cell.col}`}
                      style={color ? { background: color.hex } : undefined}
                    >
                      {symbol ? <span aria-hidden="true">{symbol.abbreviation}</span> : null}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <div className="fiber-craft-compiler-summary">
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
