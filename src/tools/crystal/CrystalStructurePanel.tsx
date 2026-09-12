import { useEffect, useMemo, useState } from 'react';
import {
  cartesianToFractional,
  cellVolume,
  fractionalToCartesian,
  validateCell,
} from './cell-engine';
import {
  addCrystalSite,
  deleteCrystalSite,
  duplicateCrystalSite,
  setCrystalCell,
  updateCrystalSite,
  wrapCrystalSites,
} from './document-engine';
import {
  commitCrystalHistory,
  redoCrystalHistory,
  resetCrystalHistory,
  undoCrystalHistory,
  type CrystalHistory,
} from './history-engine';
import { measureDistance } from './measurement-engine';
import { expandSupercell } from './periodic-engine';
import type { CrystalMeasurement } from './project-engine';
import type { CrystalSite, UnitCell, Vec3 } from './crystal-types';

type CoordinateMode = 'fractional' | 'cartesian';
type CellKey = keyof UnitCell;
type RepeatTuple = readonly [number, number, number];

const CELL_FIELDS: readonly { key: CellKey; label: string; unit: string }[] = [
  { key: 'a', label: 'Cell a', unit: 'Å' },
  { key: 'b', label: 'Cell b', unit: 'Å' },
  { key: 'c', label: 'Cell c', unit: 'Å' },
  { key: 'alpha', label: 'Cell α', unit: '°' },
  { key: 'beta', label: 'Cell β', unit: '°' },
  { key: 'gamma', label: 'Cell γ', unit: '°' },
];

const MAX_PHASE_ONE_SITES = 50_000;

export interface CrystalStructurePanelProps {
  readonly history: CrystalHistory;
  readonly onHistoryChange: (history: CrystalHistory) => void;
  readonly measurements: readonly CrystalMeasurement[];
  readonly onMeasurementsChange: (measurements: readonly CrystalMeasurement[]) => void;
}

function formatNumber(value: number, digits = 8): string {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

function formatCoordinate(value: number): string {
  return formatNumber(value, 8);
}

function coordinateVector(site: CrystalSite, cell: UnitCell, mode: CoordinateMode): Vec3 {
  return mode === 'fractional' ? site.fractional : fractionalToCartesian(site.fractional, cell);
}

function nextMeasurementId(measurements: readonly CrystalMeasurement[]): string {
  let max = 0;
  for (const measurement of measurements) {
    const match = /^measurement-(\d+)$/.exec(measurement.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `measurement-${max + 1}`;
}

function nextNewLabel(sites: readonly CrystalSite[]): string {
  const labels = new Set(sites.map((site) => site.label));
  let index = 1;
  while (labels.has(`New${index}`)) index += 1;
  return `New${index}`;
}

function parseRepeats(values: readonly string[]): RepeatTuple | null {
  const parsed = values.map((value) => Number(value));
  if (parsed.length !== 3 || parsed.some((value) => !Number.isSafeInteger(value) || value <= 0)) return null;
  return [parsed[0]!, parsed[1]!, parsed[2]!];
}

export default function CrystalStructurePanel({
  history,
  onHistoryChange,
  measurements,
  onMeasurementsChange,
}: CrystalStructurePanelProps) {
  const document = history.present;
  const [coordinateMode, setCoordinateMode] = useState<CoordinateMode>('fractional');
  const [cellDraft, setCellDraft] = useState<Record<CellKey, string>>(() => ({
    a: formatNumber(document.cell.a),
    b: formatNumber(document.cell.b),
    c: formatNumber(document.cell.c),
    alpha: formatNumber(document.cell.alpha),
    beta: formatNumber(document.cell.beta),
    gamma: formatNumber(document.cell.gamma),
  }));
  const [cellError, setCellError] = useState<string | null>(null);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [repeatDraft, setRepeatDraft] = useState<readonly [string, string, string]>(['1', '1', '1']);
  const [measurementA, setMeasurementA] = useState('');
  const [measurementB, setMeasurementB] = useState('');

  useEffect(() => {
    setCellDraft({
      a: formatNumber(document.cell.a),
      b: formatNumber(document.cell.b),
      c: formatNumber(document.cell.c),
      alpha: formatNumber(document.cell.alpha),
      beta: formatNumber(document.cell.beta),
      gamma: formatNumber(document.cell.gamma),
    });
    setCellError(null);
  }, [document.cell.a, document.cell.b, document.cell.c, document.cell.alpha, document.cell.beta, document.cell.gamma]);

  useEffect(() => {
    const validIds = new Set(document.sites.map((site) => site.id));
    setMeasurementA((current) => validIds.has(current) ? current : document.sites[0]?.id ?? '');
    setMeasurementB((current) => validIds.has(current) ? current : document.sites[1]?.id ?? document.sites[0]?.id ?? '');
  }, [document.sites]);

  const repeats = useMemo(() => parseRepeats(repeatDraft), [repeatDraft]);
  const supercellSiteCount = repeats
    ? document.sites.length * repeats[0] * repeats[1] * repeats[2]
    : null;
  const supercellAllowed = supercellSiteCount !== null
    && Number.isSafeInteger(supercellSiteCount)
    && supercellSiteCount <= MAX_PHASE_ONE_SITES;

  const commitDocument = (nextDocument: typeof document) => {
    onHistoryChange(commitCrystalHistory(history, nextDocument));
  };

  const changeCellField = (key: CellKey, text: string) => {
    const nextDraft = { ...cellDraft, [key]: text };
    setCellDraft(nextDraft);
    const nextCell: UnitCell = {
      a: Number(nextDraft.a),
      b: Number(nextDraft.b),
      c: Number(nextDraft.c),
      alpha: Number(nextDraft.alpha),
      beta: Number(nextDraft.beta),
      gamma: Number(nextDraft.gamma),
    };
    const validation = validateCell(nextCell);
    if (!validation.ok) {
      setCellError(validation.error);
      return;
    }
    setCellError(null);
    if (CELL_FIELDS.every((field) => nextCell[field.key] === document.cell[field.key])) return;
    commitDocument(setCrystalCell(document, nextCell));
  };

  const commitSiteCoordinate = (site: CrystalSite, axis: 0 | 1 | 2, text: string) => {
    const value = Number(text);
    if (!Number.isFinite(value)) {
      setSiteError('Site coordinates must be finite numbers.');
      return;
    }
    try {
      let fractional: Vec3;
      if (coordinateMode === 'fractional') {
        const next = [...site.fractional] as [number, number, number];
        next[axis] = value;
        fractional = next;
      } else {
        const cartesian = [...fractionalToCartesian(site.fractional, document.cell)] as [number, number, number];
        cartesian[axis] = value;
        fractional = cartesianToFractional(cartesian, document.cell);
      }
      setSiteError(null);
      commitDocument(updateCrystalSite(document, site.id, { fractional }));
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : 'Could not update the site coordinate.');
    }
  };

  const commitSiteText = (site: CrystalSite, key: 'label' | 'element', value: string) => {
    try {
      setSiteError(null);
      commitDocument(updateCrystalSite(document, site.id, { [key]: value }));
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : 'Could not update the site.');
    }
  };

  const commitOccupancy = (site: CrystalSite, value: string) => {
    const occupancy = Number(value);
    if (!Number.isFinite(occupancy)) {
      setSiteError('Site occupancy must be a finite number.');
      return;
    }
    try {
      setSiteError(null);
      commitDocument(updateCrystalSite(document, site.id, { occupancy }));
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : 'Could not update occupancy.');
    }
  };

  const addSite = () => {
    const label = nextNewLabel(document.sites);
    commitDocument(addCrystalSite(document, {
      label,
      element: 'C',
      fractional: [0, 0, 0],
      occupancy: 1,
    }));
  };

  const applySupercell = () => {
    if (!repeats || !supercellAllowed) return;
    try {
      commitDocument(expandSupercell(document, repeats, MAX_PHASE_ONE_SITES));
      setRepeatDraft(['1', '1', '1']);
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : 'Could not create the supercell.');
    }
  };

  const addDistanceMeasurement = () => {
    const a = document.sites.find((site) => site.id === measurementA);
    const b = document.sites.find((site) => site.id === measurementB);
    if (!a || !b) return;
    const value = measureDistance(a.fractional, b.fractional, document.cell);
    const measurement: CrystalMeasurement = {
      id: nextMeasurementId(measurements),
      kind: 'distance',
      siteIds: [a.id, b.id],
      value,
      unit: 'Å',
      label: `${a.label} ↔ ${b.label}`,
    };
    onMeasurementsChange([...measurements, measurement]);
  };

  return (
    <section className="crystal-structure-panel" aria-labelledby="crystal-build-heading">
      <div className="crystal-structure-panel__topbar">
        <div>
          <p className="eyebrow">Build & geometry</p>
          <h3 id="crystal-build-heading">Edit the structure</h3>
        </div>
        <div className="crystal-history-controls" aria-label="Structure history">
          <button
            type="button"
            disabled={history.past.length === 0}
            onClick={() => onHistoryChange(undoCrystalHistory(history))}
          >Undo</button>
          <button
            type="button"
            disabled={history.future.length === 0}
            onClick={() => onHistoryChange(redoCrystalHistory(history))}
          >Redo</button>
          <button type="button" onClick={() => onHistoryChange(resetCrystalHistory(history))}>Reset structure</button>
        </div>
      </div>

      <section className="crystal-editor-card" aria-labelledby="crystal-cell-heading">
        <div className="crystal-editor-card__heading">
          <div>
            <h4 id="crystal-cell-heading">Unit cell</h4>
            <p data-testid="crystal-cell-volume">Volume: {cellVolume(document.cell).toFixed(3)} Å³</p>
          </div>
        </div>
        <div className="crystal-cell-grid">
          {CELL_FIELDS.map(({ key, label, unit }) => (
            <label key={key}>
              {label} ({unit})
              <input
                type="number"
                step="any"
                value={cellDraft[key]}
                onChange={(event) => changeCellField(key, event.target.value)}
              />
            </label>
          ))}
        </div>
        {cellError ? <p className="crystal-editor-error" role="alert">{cellError}</p> : null}
      </section>

      <section className="crystal-editor-card" aria-labelledby="crystal-sites-heading">
        <div className="crystal-editor-card__heading crystal-editor-card__heading--wrap">
          <div>
            <h4 id="crystal-sites-heading">Atomic sites</h4>
            <p data-testid="crystal-site-count">{document.sites.length.toLocaleString()} sites</p>
          </div>
          <div className="crystal-site-actions">
            <label>
              Coordinate system
              <select value={coordinateMode} onChange={(event) => setCoordinateMode(event.target.value as CoordinateMode)}>
                <option value="fractional">Fractional</option>
                <option value="cartesian">Cartesian (Å)</option>
              </select>
            </label>
            <button type="button" onClick={addSite}>Add site</button>
            <button type="button" onClick={() => commitDocument(wrapCrystalSites(document))}>Wrap sites into cell</button>
          </div>
        </div>
        {siteError ? <p className="crystal-editor-error" role="alert">{siteError}</p> : null}
        <div className="crystal-site-table-wrap">
          <table className="crystal-site-table">
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Element</th>
                <th scope="col">x</th>
                <th scope="col">y</th>
                <th scope="col">z</th>
                <th scope="col">Occupancy</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {document.sites.map((site) => {
                const vector = coordinateVector(site, document.cell, coordinateMode);
                const modeLabel = coordinateMode === 'fractional' ? 'fractional' : 'Cartesian';
                return (
                  <tr key={site.id} data-testid={`crystal-site-row-${site.id}`}>
                    <td data-label="Label">
                      <input
                        aria-label={`${site.label} label`}
                        key={`${site.id}-label-${site.label}`}
                        defaultValue={site.label}
                        onBlur={(event) => {
                          if (event.target.value !== site.label) commitSiteText(site, 'label', event.target.value);
                        }}
                      />
                    </td>
                    <td data-label="Element">
                      <input
                        aria-label={`${site.label} element`}
                        key={`${site.id}-element-${site.element}`}
                        defaultValue={site.element}
                        onBlur={(event) => {
                          if (event.target.value !== site.element) commitSiteText(site, 'element', event.target.value);
                        }}
                      />
                    </td>
                    {[0, 1, 2].map((axis) => {
                      const coordinateAxis = axis as 0 | 1 | 2;
                      const axisName = ['x', 'y', 'z'][coordinateAxis]!;
                      const formatted = formatCoordinate(vector[coordinateAxis]);
                      return (
                        <td data-label={axisName} key={axisName}>
                          <input
                            type="number"
                            step="any"
                            aria-label={`${site.label} ${modeLabel} ${axisName}`}
                            key={`${site.id}-${coordinateMode}-${axisName}-${formatted}`}
                            defaultValue={formatted}
                            onBlur={(event) => {
                              if (event.target.value !== formatted) commitSiteCoordinate(site, coordinateAxis, event.target.value);
                            }}
                          />
                        </td>
                      );
                    })}
                    <td data-label="Occupancy">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max="1"
                        aria-label={`${site.label} occupancy`}
                        key={`${site.id}-occupancy-${site.occupancy}`}
                        defaultValue={formatNumber(site.occupancy)}
                        onBlur={(event) => {
                          if (Number(event.target.value) !== site.occupancy) commitOccupancy(site, event.target.value);
                        }}
                      />
                    </td>
                    <td data-label="Actions">
                      <div className="crystal-site-row-actions">
                        <button type="button" onClick={() => commitDocument(duplicateCrystalSite(document, site.id))}>
                          Duplicate {site.label}
                        </button>
                        <button type="button" onClick={() => commitDocument(deleteCrystalSite(document, site.id))}>
                          Delete {site.label}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="crystal-geometry-grid">
        <section className="crystal-editor-card" aria-labelledby="crystal-supercell-heading">
          <div className="crystal-editor-card__heading">
            <div>
              <h4 id="crystal-supercell-heading">Supercell</h4>
              <p>Preview the result before expanding the canonical structure.</p>
            </div>
          </div>
          <div className="crystal-repeat-grid">
            {(['a', 'b', 'c'] as const).map((axis, index) => (
              <label key={axis}>
                Repeat {axis}
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={repeatDraft[index]}
                  onChange={(event) => {
                    const next = [...repeatDraft] as [string, string, string];
                    next[index] = event.target.value;
                    setRepeatDraft(next);
                  }}
                />
              </label>
            ))}
          </div>
          <p data-testid="crystal-supercell-preview">
            {repeats && supercellSiteCount !== null
              ? `${repeats[0]} × ${repeats[1]} × ${repeats[2]} → ${supercellSiteCount.toLocaleString()} sites`
              : 'Enter positive whole-number repeats.'}
          </p>
          {supercellSiteCount !== null && supercellSiteCount > MAX_PHASE_ONE_SITES ? (
            <p className="crystal-editor-error" role="alert">
              This would create {supercellSiteCount.toLocaleString()} sites, above the Phase 1 limit of {MAX_PHASE_ONE_SITES.toLocaleString()}.
            </p>
          ) : null}
          <button type="button" disabled={!supercellAllowed} onClick={applySupercell}>Apply supercell</button>
        </section>

        <section className="crystal-editor-card" aria-labelledby="crystal-measurement-heading">
          <div className="crystal-editor-card__heading">
            <div>
              <h4 id="crystal-measurement-heading">Periodic distance</h4>
              <p>Distances use the minimum periodic image and are reported in ångström.</p>
            </div>
          </div>
          <div className="crystal-measurement-controls">
            <label>
              Measurement site A
              <select value={measurementA} onChange={(event) => setMeasurementA(event.target.value)}>
                {document.sites.map((site) => <option key={site.id} value={site.id}>{site.label}</option>)}
              </select>
            </label>
            <label>
              Measurement site B
              <select value={measurementB} onChange={(event) => setMeasurementB(event.target.value)}>
                {document.sites.map((site) => <option key={site.id} value={site.id}>{site.label}</option>)}
              </select>
            </label>
            <button type="button" disabled={!measurementA || !measurementB} onClick={addDistanceMeasurement}>
              Add distance measurement
            </button>
          </div>
          <div data-testid="crystal-measurement-list" className="crystal-measurement-list" aria-live="polite">
            {measurements.length === 0 ? <p>No measurements yet.</p> : (
              <ul>
                {measurements.map((measurement) => (
                  <li key={measurement.id}>
                    <span>{measurement.label ?? measurement.kind}: {measurement.value.toFixed(4)} {measurement.unit}</span>
                    <button
                      type="button"
                      onClick={() => onMeasurementsChange(measurements.filter((item) => item.id !== measurement.id))}
                    >Remove {measurement.label ?? measurement.kind}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
