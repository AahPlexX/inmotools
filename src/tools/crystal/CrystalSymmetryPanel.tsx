import { useRef, useState } from 'react';
import { commitCrystalHistory, type CrystalHistory } from './history-engine';
import { analyzeCrystalSymmetry, inspectSymmetryBreak, standardizeCrystal, sweepSymmetryTolerance } from './symmetry-engine';
import type { CrystalDocument } from './crystal-types';
import type { CrystalSymmetryResult, SymmetrySweepPoint } from './symmetry-types';

const SWEEP_TOLERANCES = [1e-4, 1e-3, 1e-2] as const;
const DEFAULT_TOLERANCE = 1e-4;

type SymmetryStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface CrystalSymmetryPanelProps {
  readonly document: CrystalDocument;
  readonly history: CrystalHistory;
  readonly onHistoryChange: (history: CrystalHistory) => void;
}

export default function CrystalSymmetryPanel({ document, history, onHistoryChange }: CrystalSymmetryPanelProps) {
  const generationRef = useRef(0);
  const referenceRef = useRef<CrystalDocument | null>(null);
  const [status, setStatus] = useState<SymmetryStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CrystalSymmetryResult | null>(null);
  const [sweep, setSweep] = useState<readonly SymmetrySweepPoint[] | null>(null);
  const [breakSummary, setBreakSummary] = useState<string | null>(null);
  const [mode, setMode] = useState<'conventional' | 'primitive'>('conventional');
  const [preview, setPreview] = useState<CrystalDocument | null>(null);
  const isStale = result !== null && referenceRef.current !== document;

  const run = <T,>(action: () => Promise<T>, apply: (value: T) => void, failure: string) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setStatus('pending');
    setError(null);
    action()
      .then((value) => {
        if (generationRef.current !== generation) return;
        apply(value);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (generationRef.current !== generation) return;
        setError(reason instanceof Error ? reason.message : failure);
        setStatus('error');
      });
  };

  const detect = () => run(
    () => analyzeCrystalSymmetry(document, DEFAULT_TOLERANCE),
    (value) => {
      referenceRef.current = document;
      setResult(value);
      setPreview(null);
      setBreakSummary(null);
    },
    'Symmetry detection failed.',
  );

  const runSweep = () => run(
    () => sweepSymmetryTolerance(document, SWEEP_TOLERANCES),
    setSweep,
    'Tolerance sweep failed.',
  );

  const inspect = () => {
    const reference = referenceRef.current;
    if (!reference) {
      setError('Detect symmetry on the reference structure before inspecting a break.');
      setStatus('error');
      return;
    }
    run(
      () => inspectSymmetryBreak(reference, document, result?.tolerance ?? DEFAULT_TOLERANCE),
      (value) => {
        const offending = new Set(value.offendingSiteIds);
        const labels = document.sites.filter((site) => offending.has(site.id)).map((site) => site.label);
        setBreakSummary(`${value.broken.length} broken operations; offending sites: ${labels.join(', ') || 'none'}.`);
      },
      'Symmetry-break inspection failed.',
    );
  };

  const previewStandard = () => {
    if (!result || isStale) {
      setError('Structure changed since detection; re-run Detect symmetry.');
      setStatus('error');
      return;
    }
    setPreview(standardizeCrystal(document, result, mode));
    setStatus('ready');
  };

  const applyStandard = () => {
    if (!preview) return;
    onHistoryChange(commitCrystalHistory(history, preview));
    setPreview(null);
    setResult(null);
    referenceRef.current = null;
    setBreakSummary(null);
    setStatus('idle');
  };

  return (
    <section className="crystal-structure-panel" data-testid="crystal-symmetry-panel" aria-labelledby="crystal-symmetry-heading">
      <div className="crystal-panel-heading">
        <div>
          <h3 id="crystal-symmetry-heading">Symmetry</h3>
          <p>Detect space-group symmetry locally, sweep tolerance stability, inspect breaks, and standardize the cell.</p>
        </div>
      </div>

      <section className="crystal-editor-card" aria-labelledby="crystal-symmetry-detection-heading">
        <div className="crystal-editor-card__heading crystal-editor-card__heading--wrap">
          <div>
            <h4 id="crystal-symmetry-detection-heading">Detection</h4>
            <p role="status" data-testid="crystal-symmetry-status">
              {status === 'pending' ? 'Analyzing symmetry…' : null}
              {status === 'error' ? error : null}
              {status === 'ready' && !result ? 'Symmetry sweep ready.' : null}
              {status === 'idle' && !isStale ? 'No symmetry analysis has been run yet.' : null}
              {isStale ? 'Structure changed since detection; re-run Detect symmetry.' : null}
            </p>
          </div>
          <div className="crystal-symmetry-buttons">
            <button type="button" onClick={detect}>Detect symmetry</button>
            <button type="button" onClick={runSweep}>Run tolerance sweep</button>
            <button type="button" onClick={inspect}>Inspect symmetry break</button>
          </div>
        </div>

        {result ? (
          <div data-testid="crystal-symmetry-result">
            <p>
              {result.hmSymbol} (#{result.number}) · {result.pearsonSymbol} · {result.operations.length} operations ·{' '}
              {result.crystalSystem} {result.pointGroup} · Hall {result.hallNumber}
            </p>
            <ul data-testid="crystal-symmetry-operations">
              {result.operations.slice(0, 3).map((operation, index) => (
                <li key={`${operation.rotation.join('')}-${index}`}>
                  {index + 1}: [{operation.rotation.join(' ')}] + [{operation.translation.join(' ')}]
                </li>
              ))}
            </ul>
            <ul data-testid="crystal-symmetry-wyckoffs">
              {result.wyckoffs.map((wyckoff, index) => (
                <li key={`${wyckoff}-${index}`}>{wyckoff || '—'} · {result.siteSymmetrySymbols[index] ?? ''}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {sweep ? (
          <ul data-testid="crystal-symmetry-sweep">
            {sweep.map((point) => (
              <li key={point.tolerance}>
                {point.tolerance} → {point.hmSymbol} (#{point.number}), {point.operationCount} operations
              </li>
            ))}
          </ul>
        ) : null}

        {breakSummary ? <p data-testid="crystal-symmetry-break">{breakSummary}</p> : null}
      </section>

      <section className="crystal-editor-card" aria-labelledby="crystal-symmetry-standard-heading">
        <div className="crystal-editor-card__heading crystal-editor-card__heading--wrap">
          <div>
            <h4 id="crystal-symmetry-standard-heading">Cell standardization</h4>
            <label>
              Standardized cell
              <select value={mode} onChange={(event) => setMode(event.target.value as 'conventional' | 'primitive')}>
                <option value="conventional">Conventional</option>
                <option value="primitive">Primitive</option>
              </select>
            </label>
          </div>
          <div className="crystal-symmetry-buttons">
            <button type="button" onClick={previewStandard}>Preview standardized cell</button>
            <button type="button" onClick={applyStandard} disabled={!preview || isStale}>Apply standardized cell</button>
          </div>
        </div>
        {preview ? (
          <p data-testid="crystal-symmetry-standard-preview">
            {preview.name}: {preview.sites.length} site(s); a = {preview.cell.a.toFixed(3)} Å, b = {preview.cell.b.toFixed(3)} Å, c = {preview.cell.c.toFixed(3)} Å.
          </p>
        ) : null}
      </section>
    </section>
  );
}