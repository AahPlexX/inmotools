import { useMemo, useState } from 'react';
import {
  COUNTED_STITCH_KINDS,
  addCountedBackstitch,
  addCountedFrenchKnot,
  generateCountedThreadLegend,
  setCountedThreadStitch,
  type CountedStitchKind,
  type CountedThreadChart,
} from './engines/counted-thread-engine';
import type { ColorSlot, FiberCraftDocument } from './fiber-craft-types';

const STITCH_LABELS: Readonly<Record<CountedStitchKind, string>> = {
  'full-cross': 'Full cross',
  'half-forward': 'Half stitch /',
  'half-back': 'Half stitch \\',
  'quarter-nw': 'Quarter stitch NW',
  'quarter-ne': 'Quarter stitch NE',
  'quarter-sw': 'Quarter stitch SW',
  'quarter-se': 'Quarter stitch SE',
  'three-quarter-nw': 'Three-quarter stitch NW',
  'three-quarter-ne': 'Three-quarter stitch NE',
  'three-quarter-sw': 'Three-quarter stitch SW',
  'three-quarter-se': 'Three-quarter stitch SE',
};

const stitchMark = (kind: CountedStitchKind | null) => {
  if (!kind) return '';
  if (kind === 'full-cross') return '×';
  if (kind === 'half-forward') return '╱';
  if (kind === 'half-back') return '╲';
  if (kind.startsWith('quarter')) return '¼';
  return '¾';
};

export function CountedThreadWorkspace({ document, onCommit }: {
  document: FiberCraftDocument;
  onCommit: (document: FiberCraftDocument, message: string) => void;
}) {
  if (document.chart.kind !== 'counted-thread') return null;
  const chart: CountedThreadChart = document.chart;
  const [selectedStitch, setSelectedStitch] = useState<CountedStitchKind>('full-cross');
  const [selectedColor, setSelectedColor] = useState(document.palette[0]?.id ?? 'primary');
  const [knotRow, setKnotRow] = useState('0.5');
  const [knotCol, setKnotCol] = useState('0.5');
  const [backStartRow, setBackStartRow] = useState('0');
  const [backStartCol, setBackStartCol] = useState('0');
  const [backEndRow, setBackEndRow] = useState('1');
  const [backEndCol, setBackEndCol] = useState('1');
  const legend = useMemo(() => generateCountedThreadLegend(document), [document]);

  const paintCell = (row: number, col: number) => {
    const current = chart.cells.find((cell) => cell.row === row && cell.col === col);
    const erase = current?.stitchKind === selectedStitch && current.colorId === selectedColor;
    try {
      onCommit(
        setCountedThreadStitch(document, row, col, erase ? null : selectedStitch, erase ? null : selectedColor),
        erase ? `Cleared row ${row + 1}, column ${col + 1}.` : `Placed ${STITCH_LABELS[selectedStitch]} at row ${row + 1}, column ${col + 1}.`,
      );
    } catch (error) { throw error; }
  };

  const addKnot = () => onCommit(addCountedFrenchKnot(document, { row: Number(knotRow), col: Number(knotCol) }, selectedColor), 'Added a French knot.');
  const addBackstitch = () => onCommit(addCountedBackstitch(document, { row: Number(backStartRow), col: Number(backStartCol) }, { row: Number(backEndRow), col: Number(backEndCol) }, selectedColor), 'Added a backstitch line.');

  return (
    <>
      <section className="fiber-craft-canvas-panel" aria-labelledby="counted-thread-heading">
        <div className="fiber-craft-panel-heading"><div><h3 id="counted-thread-heading">Counted-thread grid</h3><p>{chart.rows} rows × {chart.cols} columns · full and fractional stitches</p></div><strong data-testid="counted-thread-summary">{chart.cells.filter((cell) => cell.stitchKind).length} stitches · {chart.knots.length} knots · {chart.backstitches.length} backstitches</strong></div>
        <div className="fiber-counted-grid-scroll" tabIndex={0} aria-label="Counted-thread chart grid">
          <div className="fiber-counted-grid" style={{ gridTemplateColumns: `repeat(${chart.cols}, 44px)` }} role="grid" aria-rowcount={chart.rows} aria-colcount={chart.cols}>
            {chart.cells.map((cell) => {
              const color = document.palette.find((entry) => entry.id === cell.colorId);
              const label = `Row ${cell.row + 1}, column ${cell.col + 1}, ${cell.stitchKind ? STITCH_LABELS[cell.stitchKind] : 'empty'}`;
              return <button key={`${cell.row}:${cell.col}`} className="fiber-counted-cell" type="button" role="gridcell" aria-label={label} title={label} style={color ? { '--counted-color': color.hex } as React.CSSProperties : undefined} onClick={() => paintCell(cell.row, cell.col)}><span aria-hidden="true">{stitchMark(cell.stitchKind)}</span></button>;
            })}
          </div>
        </div>
      </section>

      <aside className="fiber-craft-inspector" aria-label="Counted-thread chart inspector">
        <section><h3>Stitch</h3><label className="fiber-craft-field" htmlFor="fiber-counted-stitch"><span>Stitch type</span><select id="fiber-counted-stitch" value={selectedStitch} onChange={(event) => setSelectedStitch(event.target.value as CountedStitchKind)}>{COUNTED_STITCH_KINDS.map((kind) => <option key={kind} value={kind}>{STITCH_LABELS[kind]}</option>)}</select></label><label className="fiber-craft-field" htmlFor="fiber-counted-color"><span>Thread color</span><select id="fiber-counted-color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)}>{document.palette.map((color) => <option key={color.id} value={color.id}>{color.label}</option>)}</select></label><p className="fiber-craft-muted">Choose a stitch and select cells to place it. Select the same stitch again to clear that cell.</p></section>
        <section><h3>French knot</h3><div className="fiber-counted-coordinate-grid"><CoordinateField id="fiber-knot-row" label="Row point" value={knotRow} onChange={setKnotRow} max={chart.rows} /><CoordinateField id="fiber-knot-col" label="Column point" value={knotCol} onChange={setKnotCol} max={chart.cols} /></div><button className="action-button secondary fiber-craft-wide" type="button" onClick={addKnot}>Add French knot</button><p className="fiber-craft-muted">Points snap in half-cell increments.</p></section>
        <section><h3>Backstitch</h3><div className="fiber-counted-coordinate-grid"><CoordinateField id="fiber-back-start-row" label="Start row" value={backStartRow} onChange={setBackStartRow} max={chart.rows} /><CoordinateField id="fiber-back-start-col" label="Start column" value={backStartCol} onChange={setBackStartCol} max={chart.cols} /><CoordinateField id="fiber-back-end-row" label="End row" value={backEndRow} onChange={setBackEndRow} max={chart.rows} /><CoordinateField id="fiber-back-end-col" label="End column" value={backEndCol} onChange={setBackEndCol} max={chart.cols} /></div><button className="action-button secondary fiber-craft-wide" type="button" onClick={addBackstitch}>Add backstitch</button></section>
        <section><h3>Symbol key</h3>{legend.length === 0 ? <p className="fiber-craft-muted" data-testid="counted-thread-legend">Place a stitch to build the symbol key.</p> : <ul className="fiber-counted-legend" data-testid="counted-thread-legend">{legend.map((entry) => <li key={entry.colorId}><strong aria-hidden="true">{entry.symbol}</strong><span>{entry.label}{entry.code ? ` · ${entry.code}` : ''}</span><small>{entry.usageCount} used</small></li>)}</ul>}</section>
      </aside>
    </>
  );
}

function CoordinateField({ id, label, value, onChange, max }: { id: string; label: string; value: string; onChange: (value: string) => void; max: number }) {
  return <label className="fiber-craft-field" htmlFor={id}><span>{label}</span><input id={id} type="number" min="0" max={max} step="0.5" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
