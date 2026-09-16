import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  addCountedBackstitch,
  addCountedFrenchKnot,
  countedStitchLabel,
  COUNTED_STITCH_KINDS,
  generateCountedThreadLegend,
  removeCountedBackstitch,
  removeCountedFrenchKnot,
  setCountedThreadPaletteIdentity,
  setCountedThreadStitch,
  type CountedStitchKind,
} from './engines/counted-thread-engine';
import type {
  CountedThreadChart,
  FiberCraftDocument,
} from './fiber-craft-types';

type CountedTool = CountedStitchKind | 'french-knot' | 'backstitch' | 'erase';

const TOOL_LABELS: Readonly<Record<CountedTool, string>> = {
  'full-cross': 'Full cross',
  'half-forward': 'Half cross /',
  'half-back': 'Half cross \\',
  'quarter-nw': 'Quarter ↖',
  'quarter-ne': 'Quarter ↗',
  'quarter-sw': 'Quarter ↙',
  'quarter-se': 'Quarter ↘',
  'three-quarter-nw': 'Three-quarter ↖',
  'three-quarter-ne': 'Three-quarter ↗',
  'three-quarter-sw': 'Three-quarter ↙',
  'three-quarter-se': 'Three-quarter ↘',
  'french-knot': 'French knot',
  'backstitch': 'Backstitch line',
  'erase': 'Erase cell',
};

const MARK_TEXT: Readonly<Record<CountedStitchKind, string>> = {
  'full-cross': '×',
  'half-forward': '╱',
  'half-back': '╲',
  'quarter-nw': '¼↖',
  'quarter-ne': '¼↗',
  'quarter-sw': '¼↙',
  'quarter-se': '¼↘',
  'three-quarter-nw': '¾↖',
  'three-quarter-ne': '¾↗',
  'three-quarter-sw': '¾↙',
  'three-quarter-se': '¾↘',
};

const pointKey = (row: number, col: number) => `${row}:${col}`;

export function CountedThreadPanel({
  document,
  chart,
  selectedColor,
  onSelectedColorChange,
  onCommit,
  onStatus,
}: {
  document: FiberCraftDocument;
  chart: CountedThreadChart;
  selectedColor: string;
  onSelectedColorChange: (colorId: string) => void;
  onCommit: (next: FiberCraftDocument, message: string) => void;
  onStatus: (message: string) => void;
}) {
  const [tool, setTool] = useState<CountedTool>('full-cross');
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
  const [backstitchStart, setBackstitchStart] = useState<{ row: number; col: number } | null>(null);
  const [flossBrand, setFlossBrand] = useState(() => document.palette.find((color) => color.id === selectedColor)?.paletteName ?? '');
  const [flossCode, setFlossCode] = useState(() => document.palette.find((color) => color.id === selectedColor)?.paletteCode ?? '');
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const legend = useMemo(() => generateCountedThreadLegend(document), [document]);
  const legendByColor = useMemo(
    () => new Map(legend.map((entry) => [entry.colorId, entry])),
    [legend],
  );

  const paletteById = useMemo(
    () => new Map(document.palette.map((color) => [color.id, color])),
    [document.palette],
  );

  useEffect(() => {
    const color = document.palette.find((entry) => entry.id === selectedColor);
    setFlossBrand(color?.paletteName ?? '');
    setFlossCode(color?.paletteCode ?? '');
  }, [document.palette, selectedColor]);

  const saveFlossIdentity = () => {
    try {
      onCommit(
        setCountedThreadPaletteIdentity(document, selectedColor, flossBrand, flossCode),
        flossBrand.trim() || flossCode.trim() ? 'Saved the selected floss identity.' : 'Cleared the selected floss identity.',
      );
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Could not save this floss identity.');
    }
  };

  const focusCell = (row: number, col: number) => {
    const next = {
      row: Math.max(0, Math.min(chart.rows - 1, row)),
      col: Math.max(0, Math.min(chart.cols - 1, col)),
    };
    setActiveCell(next);
    window.requestAnimationFrame(() => cellRefs.current.get(pointKey(next.row, next.col))?.focus());
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    col: number,
  ) => {
    let nextRow = row;
    let nextCol = col;
    switch (event.key) {
      case 'ArrowLeft': nextCol -= 1; break;
      case 'ArrowRight': nextCol += 1; break;
      case 'ArrowUp': nextRow -= 1; break;
      case 'ArrowDown': nextRow += 1; break;
      case 'Home':
        if (event.ctrlKey || event.metaKey) nextRow = 0;
        nextCol = 0;
        break;
      case 'End':
        if (event.ctrlKey || event.metaKey) nextRow = chart.rows - 1;
        nextCol = chart.cols - 1;
        break;
      default: return;
    }
    event.preventDefault();
    focusCell(nextRow, nextCol);
  };

  const applyTool = (row: number, col: number) => {
    const cellPoint = { row: row + 0.5, col: col + 0.5 };
    try {
      if (tool === 'erase') {
        onCommit(
          setCountedThreadStitch(document, row, col, null, null),
          `Cleared row ${row + 1}, column ${col + 1}.`,
        );
        return;
      }
      if (tool === 'french-knot') {
        onCommit(
          addCountedFrenchKnot(document, cellPoint, selectedColor),
          `Placed a French knot at row ${row + 1}, column ${col + 1}.`,
        );
        return;
      }
      if (tool === 'backstitch') {
        if (!backstitchStart) {
          setBackstitchStart(cellPoint);
          return;
        }
        onCommit(
          addCountedBackstitch(document, backstitchStart, cellPoint, selectedColor),
          'Added a backstitch line.',
        );
        setBackstitchStart(null);
        return;
      }
      onCommit(
        setCountedThreadStitch(document, row, col, tool, selectedColor),
        `Placed ${countedStitchLabel(tool).toLowerCase()} at row ${row + 1}, column ${col + 1}.`,
      );
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Could not edit this counted-thread cell.');
    }
  };

  const boardStyle = {
    '--fiber-counted-cols': chart.cols,
    '--fiber-counted-rows': chart.rows,
  } as CSSProperties;

  return (
    <section className="fiber-craft-canvas-panel fiber-counted-panel" aria-labelledby="fiber-counted-heading">
      <div className="fiber-craft-panel-heading">
        <div>
          <h3 id="fiber-counted-heading">Counted-thread chart</h3>
          <p>{chart.rows} rows × {chart.cols} columns · full, fractional, knot, and backstitch marks</p>
        </div>
        <strong>{chart.cells.filter((cell) => cell.stitchKind !== null).length} counted stitches</strong>
      </div>

      <div className="fiber-counted-tools" aria-label="Counted-thread drawing tools">
        <label className="fiber-craft-field" htmlFor="fiber-counted-tool">
          <span>Stitch / mark</span>
          <select
            id="fiber-counted-tool"
            value={tool}
            onChange={(event) => {
              setTool(event.target.value as CountedTool);
              setBackstitchStart(null);
            }}
          >
            {COUNTED_STITCH_KINDS.map((kind) => (
              <option key={kind} value={kind}>{TOOL_LABELS[kind]}</option>
            ))}
            <option value="french-knot">{TOOL_LABELS['french-knot']}</option>
            <option value="backstitch">{TOOL_LABELS.backstitch}</option>
            <option value="erase">{TOOL_LABELS.erase}</option>
          </select>
        </label>
        <label className="fiber-craft-field" htmlFor="fiber-counted-color">
          <span>Floss / palette color</span>
          <select
            id="fiber-counted-color"
            value={selectedColor}
            onChange={(event) => onSelectedColorChange(event.target.value)}
            disabled={tool === 'erase'}
          >
            {document.palette.map((color) => (
              <option key={color.id} value={color.id}>
                {color.label}{color.paletteCode ? ` · ${color.paletteCode}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="fiber-craft-field" htmlFor="fiber-counted-brand">
          <span>Floss brand / palette</span>
          <input id="fiber-counted-brand" type="text" value={flossBrand} onChange={(event) => setFlossBrand(event.target.value)} placeholder="DMC, Anchor, Madeira…" />
        </label>
        <label className="fiber-craft-field" htmlFor="fiber-counted-code">
          <span>Floss code</span>
          <input id="fiber-counted-code" type="text" value={flossCode} onChange={(event) => setFlossCode(event.target.value)} placeholder="e.g. 310" />
        </label>
        <button className="action-button secondary" type="button" onClick={saveFlossIdentity}>Save floss identity</button>
        {backstitchStart ? (
          <button
            className="action-button secondary"
            type="button"
            onClick={() => setBackstitchStart(null)}
          >
            Cancel line start
          </button>
        ) : null}
        <p className="fiber-craft-muted">
          {tool === 'backstitch'
            ? backstitchStart
              ? 'Choose the ending cell for this backstitch line.'
              : 'Choose a starting cell, then choose an ending cell.'
            : 'Arrow keys move one cell. Home and End move across a row; Ctrl/⌘ + Home or End jumps to a grid corner.'}
        </p>
      </div>

      <div className="fiber-craft-grid-scroll fiber-counted-scroll" tabIndex={-1}>
        <div className="fiber-counted-board" style={boardStyle}>
          <svg
            className="fiber-counted-overlay"
            viewBox={`0 0 ${chart.cols} ${chart.rows}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            data-testid="counted-thread-overlay"
          >
            {chart.backstitches.map((line) => (
              <line
                key={line.id}
                x1={line.start.col}
                y1={line.start.row}
                x2={line.end.col}
                y2={line.end.row}
                stroke={paletteById.get(line.colorId)?.hex ?? '#111827'}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {chart.knots.map((knot) => (
              <circle
                key={knot.id}
                cx={knot.point.col}
                cy={knot.point.row}
                r={0.11}
                fill={paletteById.get(knot.colorId)?.hex ?? '#111827'}
                stroke="var(--surface)"
                strokeWidth={0.08}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div
            className="fiber-counted-grid"
            role="grid"
            aria-label={`Counted-thread grid, ${chart.rows} rows by ${chart.cols} columns`}
            aria-rowcount={chart.rows}
            aria-colcount={chart.cols}
            data-testid="counted-thread-grid"
          >
            {Array.from({ length: chart.rows }, (_, row) => (
              <div className="fiber-counted-row" role="row" key={row}>
                {chart.cells
                  .filter((cell) => cell.row === row)
                  .map((cell) => {
                    const color = cell.colorId ? paletteById.get(cell.colorId) : undefined;
                    const colorSymbol = cell.colorId ? legendByColor.get(cell.colorId)?.symbol : undefined;
                    const label = cell.stitchKind
                      ? `${countedStitchLabel(cell.stitchKind)}, ${color?.label ?? cell.colorId ?? 'unknown color'}`
                      : 'empty';
                    return (
                      <div role="gridcell" key={cell.col}>
                        <button
                          ref={(element) => {
                            const key = pointKey(cell.row, cell.col);
                            if (element) cellRefs.current.set(key, element);
                            else cellRefs.current.delete(key);
                          }}
                          className="fiber-counted-cell"
                          type="button"
                          tabIndex={activeCell.row === cell.row && activeCell.col === cell.col ? 0 : -1}
                          aria-label={`Row ${cell.row + 1}, column ${cell.col + 1}, ${label}`}
                          onFocus={() => setActiveCell({ row: cell.row, col: cell.col })}
                          onKeyDown={(event) => handleKeyDown(event, cell.row, cell.col)}
                          onClick={() => applyTool(cell.row, cell.col)}
                          style={color ? { '--fiber-counted-mark-color': color.hex } as CSSProperties : undefined}
                        >
                          {cell.stitchKind ? (
                            <span className="fiber-counted-mark" aria-hidden="true">
                              <span>{MARK_TEXT[cell.stitchKind]}</span>
                              {colorSymbol ? <small>{colorSymbol}</small> : null}
                            </span>
                          ) : null}
                        </button>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fiber-counted-summary" data-testid="counted-thread-specialty-summary">
        <span>{chart.knots.length} French {chart.knots.length === 1 ? 'knot' : 'knots'}</span>
        <span>{chart.backstitches.length} backstitch {chart.backstitches.length === 1 ? 'line' : 'lines'}</span>
      </div>

      {(chart.knots.length > 0 || chart.backstitches.length > 0) ? (
        <details className="fiber-craft-compiler-details">
          <summary>Specialty mark cleanup</summary>
          <div className="fiber-counted-removals">
            {chart.knots.map((knot, index) => (
              <button
                key={knot.id}
                className="action-button secondary"
                type="button"
                onClick={() => onCommit(removeCountedFrenchKnot(document, knot.id), `Removed French knot ${index + 1}.`)}
              >
                Remove knot {index + 1}
              </button>
            ))}
            {chart.backstitches.map((line, index) => (
              <button
                key={line.id}
                className="action-button secondary"
                type="button"
                onClick={() => onCommit(removeCountedBackstitch(document, line.id), `Removed backstitch line ${index + 1}.`)}
              >
                Remove line {index + 1}
              </button>
            ))}
          </div>
        </details>
      ) : null}

      <section className="fiber-counted-legend" aria-labelledby="fiber-counted-legend-heading" data-testid="counted-thread-legend">
        <div>
          <h4 id="fiber-counted-legend-heading">Generated symbol key</h4>
          <p>Updates automatically from every color currently used by stitches, knots, and backstitch lines.</p>
        </div>
        {legend.length === 0 ? (
          <p className="fiber-craft-muted">Place a stitch or specialty mark to build the key.</p>
        ) : (
          <ul>
            {legend.map((entry) => (
              <li key={entry.colorId}>
                <b aria-hidden="true">{entry.symbol}</b>
                <i style={{ background: paletteById.get(entry.colorId)?.hex }} aria-hidden="true" />
                <span>
                  <strong>{entry.label}</strong>
                  <small>
                    {[entry.paletteName, entry.code].filter(Boolean).join(' · ') || 'Project color'}
                    {' · '}{entry.usageCount} {entry.usageCount === 1 ? 'mark' : 'marks'}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
