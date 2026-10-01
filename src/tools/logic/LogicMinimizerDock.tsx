import { useMemo, useState } from 'react';
import { checkTruthTableAvailability, generateTruthTable } from './analysis-engine';
import {
  cellMinterm,
  codeLabel,
  formatPosMinimized,
  formatSopMinimized,
  karnaughLayout,
  loopPieces,
  minimize,
  MAX_MINIMIZE_VARIABLES,
  MIN_MINIMIZE_VARIABLES,
  productLiterals,
  sumLiterals,
  type Implicant,
  type KarnaughLayout,
  type LoopPiece,
  type MinimizationResult,
} from './minimize-engine';
import type { LogicDocument, LogicLevel } from './logic-types';
import type { SynthesisSpec, TwoLevelForm } from './synthesis-engine';
import './LogicMinimizerDock.css';

export interface LogicMinimizerDockProps {
  readonly document: LogicDocument;
  readonly onGenerate: (spec: SynthesisSpec) => void;
  readonly onClose: () => void;
}

const CELL_WIDTH = 56;
const CELL_HEIGHT = 46;
const HEADER = 30;
const LAYER_GAP = 44;

/** Loop colors that stay distinguishable on the light, dark, and high-contrast themes. */
const LOOP_COLORS: readonly string[] = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d'];

const termText = (result: MinimizationResult, form: TwoLevelForm, implicant: Implicant): string => {
  if (form === 'sop') return productLiterals(result.variables, implicant).map((literal) => (literal.negated ? `${literal.variable}'` : literal.variable)).join('') || '1';
  return `(${sumLiterals(result.variables, implicant).map((literal) => (literal.negated ? `${literal.variable}'` : literal.variable)).join(' + ')})`;
};

interface MapProps {
  readonly layout: KarnaughLayout;
  readonly result: MinimizationResult;
  readonly form: TwoLevelForm;
}

/** One rectangle of a grouping loop, with a border only on the sides where the loop does not continue past the map edge. */
function LoopShape({ piece, color, inset }: { piece: LoopPiece; color: string; inset: number }) {
  const x = piece.col * CELL_WIDTH + inset;
  const y = piece.row * CELL_HEIGHT + inset;
  const width = piece.colSpan * CELL_WIDTH - inset * 2;
  const height = piece.rowSpan * CELL_HEIGHT - inset * 2;
  const r = 9;
  const closed = !piece.openTop && !piece.openBottom && !piece.openLeft && !piece.openRight;
  if (closed) return <rect x={x} y={y} width={width} height={height} rx={r} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={2.5} />;
  // A wrapping loop is drawn as open-sided pieces so it reads as continuing past the map edge.
  const left = piece.openLeft ? x - inset : x;
  const right = piece.openRight ? x + width + inset : x + width;
  const top = piece.openTop ? y - inset : y;
  const bottom = piece.openBottom ? y + height + inset : y + height;
  const segments: string[] = [];
  if (!piece.openTop) segments.push(`M${left},${top} H${right}`);
  if (!piece.openBottom) segments.push(`M${left},${bottom} H${right}`);
  if (!piece.openLeft) segments.push(`M${left},${top} V${bottom}`);
  if (!piece.openRight) segments.push(`M${right},${top} V${bottom}`);
  return (
    <g>
      <rect x={left} y={top} width={right - left} height={bottom - top} fill={color} fillOpacity={0.14} />
      <path d={segments.join(' ')} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

function KarnaughMap({ layout, result, form }: MapProps) {
  const variables = result.variables;
  const colNames = layout.colVariables.map((index) => variables[index]!).join('');
  const rowNames = layout.rowVariables.map((index) => variables[index]!).join('');
  const dontCare = new Set(result.dontCares);
  const onset = new Set(result.onset);
  const chosen = (form === 'sop' ? result.sop : result.pos).selected.map((index, order) => ({ implicant: (form === 'sop' ? result.sop : result.pos).primes[index]!, order }));

  const mapWidth = HEADER + layout.cols * CELL_WIDTH;
  const mapHeight = HEADER + layout.rows * CELL_HEIGHT;
  const totalHeight = layout.layers * mapHeight + (layout.layers - 1) * LAYER_GAP + 24;

  return (
    <svg
      className="logic-kmap-svg"
      viewBox={`0 0 ${mapWidth + 16} ${totalHeight}`}
      width={mapWidth + 16}
      height={totalHeight}
      role="img"
      aria-label={`Karnaugh map of ${variables.length} variables with ${chosen.length} grouping loop${chosen.length === 1 ? '' : 's'}`}
    >
      {Array.from({ length: layout.layers }, (_, layer) => (
        <g key={layer} transform={`translate(8, ${layer * (mapHeight + LAYER_GAP) + 20})`}>
          {layout.layerVariable !== undefined ? (
            <text x={HEADER} y={-6} className="logic-kmap-layer">{variables[layout.layerVariable]} = {layer}</text>
          ) : null}
          <text x={HEADER / 2} y={HEADER / 2 + 4} textAnchor="middle" className="logic-kmap-corner">{rowNames}\{colNames}</text>
          {layout.colCodes.map((code, col) => (
            <text key={`c${col}`} x={HEADER + col * CELL_WIDTH + CELL_WIDTH / 2} y={HEADER / 2 + 4} textAnchor="middle" className="logic-kmap-axis">
              {codeLabel(code, layout.colVariables.length)}
            </text>
          ))}
          {layout.rowCodes.map((code, row) => (
            <text key={`r${row}`} x={HEADER / 2} y={HEADER + row * CELL_HEIGHT + CELL_HEIGHT / 2 + 4} textAnchor="middle" className="logic-kmap-axis">
              {codeLabel(code, layout.rowVariables.length)}
            </text>
          ))}
          <g transform={`translate(${HEADER}, ${HEADER})`}>
            {Array.from({ length: layout.rows }, (_, row) =>
              Array.from({ length: layout.cols }, (_, col) => {
                const minterm = cellMinterm(layout, layer, row, col);
                const value = dontCare.has(minterm) ? 'X' : onset.has(minterm) ? '1' : '0';
                return (
                  <g key={`${row}-${col}`} transform={`translate(${col * CELL_WIDTH}, ${row * CELL_HEIGHT})`}>
                    <rect width={CELL_WIDTH} height={CELL_HEIGHT} className="logic-kmap-cell" />
                    <text x={5} y={12} className="logic-kmap-index">{minterm}</text>
                    <text x={CELL_WIDTH / 2} y={CELL_HEIGHT / 2 + 7} textAnchor="middle" className={`logic-kmap-value logic-kmap-value-${value}`}>{value}</text>
                  </g>
                );
              }),
            )}
            {chosen.flatMap(({ implicant, order }) =>
              loopPieces(layout, implicant)
                .filter((piece) => piece.layer === layer)
                .map((piece, pieceIndex) => (
                  <LoopShape key={`${order}-${pieceIndex}`} piece={piece} color={LOOP_COLORS[order % LOOP_COLORS.length]!} inset={3 + (order % 3) * 3} />
                )),
            )}
          </g>
        </g>
      ))}
    </svg>
  );
}

export function LogicMinimizerDock({ document: doc, onGenerate, onClose }: LogicMinimizerDockProps) {
  const [outputIndex, setOutputIndex] = useState(0);
  const [form, setForm] = useState<TwoLevelForm>('sop');
  const [treatUnresolvedAsDontCare, setTreatUnresolvedAsDontCare] = useState(false);

  const availability = useMemo(() => checkTruthTableAvailability(doc), [doc.components, doc.wires, doc.simulation.delayMode]);
  const table = useMemo(() => (availability.ok ? generateTruthTable(doc) : null), [availability.ok, doc.components, doc.wires, doc.simulation.delayMode]);

  const variableCount = table?.inputs.length ?? 0;
  const supported = table !== null && variableCount >= MIN_MINIMIZE_VARIABLES && variableCount <= MAX_MINIMIZE_VARIABLES;
  const output = table?.outputs[Math.min(outputIndex, (table?.outputs.length ?? 1) - 1)];

  const analysis = useMemo(() => {
    if (!table || !supported || !output) return null;
    const minterms: number[] = [];
    const dontCares: number[] = [];
    let unresolved = 0;
    table.rows.forEach((row, mask) => {
      const value: LogicLevel | undefined = row.outputs[output.componentId];
      if (value === 1) minterms.push(mask);
      else if (value !== 0) {
        unresolved += 1;
        if (treatUnresolvedAsDontCare) dontCares.push(mask);
      }
    });
    if (unresolved > 0 && !treatUnresolvedAsDontCare) return { unresolved, result: null as MinimizationResult | null };
    return { unresolved, result: minimize(table.inputs.map((input) => input.label), minterms, dontCares) };
  }, [table, supported, output, treatUnresolvedAsDontCare]);

  const result = analysis?.result ?? null;
  const layout = result ? karnaughLayout(result.variables.length) : null;
  const active = result ? (form === 'sop' ? result.sop : result.pos) : null;

  const generate = (target: TwoLevelForm) => {
    if (!result || !output || result.constant !== undefined) return;
    const chosen = target === 'sop' ? result.sop : result.pos;
    const terms = chosen.selected.map((index) => (target === 'sop' ? productLiterals(result.variables, chosen.primes[index]!) : sumLiterals(result.variables, chosen.primes[index]!)));
    onGenerate({ form: target, variables: result.variables, terms, outputLabel: `${output.label} (min)` });
  };

  let message: string | null = null;
  if (!availability.ok) message = availability.reason ?? 'A truth table is not available for this circuit.';
  else if (table && !supported) message = `The K-map solver works on ${MIN_MINIMIZE_VARIABLES} to ${MAX_MINIMIZE_VARIABLES} inputs; this circuit has ${variableCount}.`;

  return (
    <section className="logic-dock logic-minimizer" aria-label="Boolean minimizer and Karnaugh map" data-testid="logic-minimizer-dock">
      <div className="logic-minimizer-toolbar">
        <strong>Minimizer</strong>
        {table && table.outputs.length > 1 ? (
          <label className="logic-minimizer-field">
            <span>Output</span>
            <select value={Math.min(outputIndex, table.outputs.length - 1)} onChange={(event) => setOutputIndex(Number(event.target.value))}>
              {table.outputs.map((entry, index) => <option key={entry.componentId} value={index}>{entry.label}</option>)}
            </select>
          </label>
        ) : null}
        <div className="logic-minimizer-forms" role="group" aria-label="Form to show">
          <button type="button" aria-pressed={form === 'sop'} onClick={() => setForm('sop')}>Sum of products</button>
          <button type="button" aria-pressed={form === 'pos'} onClick={() => setForm('pos')}>Product of sums</button>
        </div>
        <button type="button" className="logic-minimizer-close" onClick={onClose} aria-label="Close the minimizer">Close</button>
      </div>

      {message ? <p className="logic-dock-message">{message}</p> : null}

      {analysis && analysis.unresolved > 0 && !treatUnresolvedAsDontCare ? (
        <div className="logic-minimizer-notice">
          <p className="logic-dock-message">{output?.label} is floating or contended for {analysis.unresolved} input combination{analysis.unresolved === 1 ? '' : 's'}, so it has no single Boolean function to minimize.</p>
          <button type="button" onClick={() => setTreatUnresolvedAsDontCare(true)}>Treat those rows as don&apos;t-cares</button>
        </div>
      ) : null}
      {analysis && treatUnresolvedAsDontCare ? (
        <label className="logic-minimizer-field">
          <input type="checkbox" checked onChange={() => setTreatUnresolvedAsDontCare(false)} />
          <span>Floating or contended rows are don&apos;t-cares</span>
        </label>
      ) : null}

      {result && layout && active ? (
        <>
          {result.constant !== undefined ? (
            <p className="logic-dock-message" data-testid="logic-minimizer-expression">{output?.label} = {result.constant}: the output is constant, so there is nothing to minimize.</p>
          ) : (
            <>
              <div className="logic-kmap-scroll">
                <KarnaughMap layout={layout} result={result} form={form} />
              </div>
              <p className="logic-minimizer-expression" data-testid="logic-minimizer-expression">
                {form === 'sop' ? formatSopMinimized(result, output!.label) : formatPosMinimized(result, output!.label)}
              </p>
              <p className="logic-minimizer-stats" data-testid="logic-minimizer-stats">
                {active.selected.length} term{active.selected.length === 1 ? '' : 's'}, {active.literalCount} literal{active.literalCount === 1 ? '' : 's'}
                {form === 'sop' ? ` (from ${result.onset.length} minterm${result.onset.length === 1 ? '' : 's'})` : ` (from ${result.offset.length} maxterm${result.offset.length === 1 ? '' : 's'})`}
                {active.exact ? '' : '. The cover is valid but was not proven minimal.'}
              </p>
              <ul className="logic-minimizer-legend" aria-label="Grouping loops">
                {active.selected.map((primeIndex, order) => (
                  <li key={primeIndex}>
                    <span className="logic-minimizer-swatch" style={{ background: LOOP_COLORS[order % LOOP_COLORS.length] }} aria-hidden="true" />
                    <code>{termText(result, form, active.primes[primeIndex]!)}</code>
                    {active.essential.includes(primeIndex) ? <em>essential</em> : null}
                  </li>
                ))}
              </ul>
              <details className="logic-minimizer-primes">
                <summary>Prime implicants ({active.primes.length})</summary>
                <table>
                  <thead><tr><th scope="col">Term</th><th scope="col">Covers</th><th scope="col">Role</th></tr></thead>
                  <tbody>
                    {active.primes.map((prime, index) => (
                      <tr key={index}>
                        <td><code>{termText(result, form, prime)}</code></td>
                        <td>{prime.covers.join(', ')}</td>
                        <td>{active.essential.includes(index) ? 'Essential' : active.selected.includes(index) ? 'Chosen' : 'Not needed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
              <div className="logic-minimizer-actions">
                <button type="button" onClick={() => generate('sop')}>Add minimized AND-OR circuit</button>
                <button type="button" onClick={() => generate('pos')}>Add minimized OR-AND circuit</button>
              </div>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
