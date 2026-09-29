import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { consumeFileInput } from '../../lib/file-input';
import {
  CrystalIsosurfacePreview,
  CrystalMorphologyPreview,
  CrystalSlicePreview,
  CrystalVoidPreview,
} from './CrystalAnalysisPreviews';
import {
  differenceFourierGrid,
  parseObservedReflections,
  rankResidualDensityPeaks,
  reflectionResiduals,
  type ObservedReflection,
} from './reflection-refinement-engine';
import { structureFactor } from './structure-factor-engine';
import {
  extractIsosurface,
  orthogonalSlice,
  parseCcp4Grid,
  parseCubeGrid,
  parseXsfGrid,
  type Isosurface,
  type OrthogonalAxis,
  type ScalarGrid,
} from './volumetric-engine';
import {
  analyzePeriodicVoids,
  isolateVoidComponent,
  type VoidAnalysisResult,
} from './void-analysis-engine';
import {
  buildBfdhMorphology,
  buildWulffMorphology,
  type MorphologyFacetSpec,
  type MorphologyModel,
} from './morphology-engine';
import type { CrystalDocument } from './crystal-types';

export interface CrystalAdvancedAnalysisPanelProps {
  readonly document: CrystalDocument;
}

type MorphologyMethod = 'bfdh' | 'wulff';

const DEFAULT_FACETS: readonly MorphologyFacetSpec[] = [
  { hkl: [1, 0, 0], included: true, weight: 1, energy: 1 },
  { hkl: [0, 1, 0], included: true, weight: 1, energy: 1 },
  { hkl: [0, 0, 1], included: true, weight: 1, energy: 1 },
];

function finiteNumber(text: string, label: string): number {
  const value = Number(text);
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be a finite number.`);
  return value;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function gridRange(grid: ScalarGrid): readonly [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of grid.values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

function defaultSurfaceLevel(grid: ScalarGrid): number {
  const [min, max] = gridRange(grid);
  if (min < 0 && max > 0) return max * 0.5;
  return min + (max - min) * 0.5;
}

function parseVolumeFile(file: File): Promise<ScalarGrid> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.map') || lower.endsWith('.mrc') || lower.endsWith('.ccp4')) {
    return file.arrayBuffer().then((buffer) => parseCcp4Grid(file.name, buffer));
  }
  return file.text().then((text) => lower.endsWith('.xsf')
    ? parseXsfGrid(file.name, text)
    : parseCubeGrid(file.name, text));
}

export default function CrystalAdvancedAnalysisPanel({ document }: CrystalAdvancedAnalysisPanelProps) {
  const reflectionInputRef = useRef<HTMLInputElement | null>(null);
  const volumeInputRef = useRef<HTMLInputElement | null>(null);

  const [reflections, setReflections] = useState<readonly ObservedReflection[] | null>(null);
  const [reflectionStatus, setReflectionStatus] = useState('No observed reflection file loaded.');

  const [grid, setGrid] = useState<ScalarGrid | null>(null);
  const [volumeStatus, setVolumeStatus] = useState('No scalar field loaded.');
  const [sliceAxis, setSliceAxis] = useState<OrthogonalAxis>('z');
  const [sliceIndex, setSliceIndex] = useState('0');
  const [positiveLevel, setPositiveLevel] = useState('0');
  const [positiveOpacity, setPositiveOpacity] = useState('0.7');
  const [negativeLevel, setNegativeLevel] = useState('0');
  const [negativeOpacity, setNegativeOpacity] = useState('0.45');
  const [surfaceStatus, setSurfaceStatus] = useState('Load a scalar field to inspect isosurfaces.');
  const [surfacePreview, setSurfacePreview] = useState<{
    readonly positive: Isosurface;
    readonly negative: Isosurface | null;
  } | null>(null);

  const [voidSpacing, setVoidSpacing] = useState('0.8');
  const [probeRadius, setProbeRadius] = useState('0.5');
  const [radiusScale, setRadiusScale] = useState('0.65');
  const [voidResult, setVoidResult] = useState<VoidAnalysisResult | null>(null);
  const [voidStatus, setVoidStatus] = useState('Void analysis has not been run.');
  const [selectedVoidId, setSelectedVoidId] = useState('');

  const [morphologyMethod, setMorphologyMethod] = useState<MorphologyMethod>('bfdh');
  const [facets, setFacets] = useState<readonly MorphologyFacetSpec[]>(DEFAULT_FACETS);
  const [morphology, setMorphology] = useState<MorphologyModel | null>(null);
  const [morphologyStatus, setMorphologyStatus] = useState('Morphology has not been built.');

  const reflectionAnalysis = useMemo(() => {
    if (!reflections) return null;
    try {
      const comparisons = reflections.map((reflection) => {
        const factor = structureFactor(document, reflection.hkl);
        const calculatedAmplitude = Math.hypot(factor.real, factor.imag);
        return {
          reflection,
          calculatedAmplitude,
          weight: reflection.sigma === undefined ? 1 : 1 / (reflection.sigma * reflection.sigma),
        };
      });
      const metrics = reflectionResiduals(comparisons.map((entry) => ({
        observedAmplitude: entry.reflection.observedAmplitude,
        calculatedAmplitude: entry.calculatedAmplitude,
        weight: entry.weight,
      })));
      const fourier = differenceFourierGrid(document, reflections, { nx: 8, ny: 8, nz: 8 });
      const extrema = rankResidualDensityPeaks(fourier, 5);
      return { comparisons, metrics, fourier, extrema } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Reflection analysis failed.' } as const;
    }
  }, [document, reflections]);

  const sliceOutcome = useMemo(() => {
    if (!grid) return null;
    try {
      const index = Number(sliceIndex);
      return { slice: orthogonalSlice(grid, sliceAxis, index) } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Slice calculation failed.' } as const;
    }
  }, [grid, sliceAxis, sliceIndex]);

  const selectedVoid = useMemo(() => {
    if (!voidResult || !selectedVoidId) return null;
    try {
      return isolateVoidComponent(voidResult, selectedVoidId);
    } catch {
      return null;
    }
  }, [selectedVoidId, voidResult]);

  const handleReflectionFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    consumeFileInput(input, async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = parseObservedReflections(file.name, await file.text());
        setReflections(parsed);
        setReflectionStatus(`Loaded ${parsed.length.toLocaleString()} observed reflections from ${file.name}.`);
      } catch (error) {
        setReflections(null);
        setReflectionStatus(`Could not load ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  };

  const handleVolumeFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    consumeFileInput(input, async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = await parseVolumeFile(file);
        const [min, max] = gridRange(parsed);
        const level = defaultSurfaceLevel(parsed);
        setGrid(parsed);
        setSurfacePreview(null);
        setSliceAxis('z');
        setSliceIndex('0');
        setPositiveLevel(String(level));
        setNegativeLevel(String(min < 0 ? min * 0.5 : min));
        setSurfaceStatus('Field loaded. Choose levels, then update field views.');
        setVolumeStatus(
          `Loaded ${parsed.name}: ${parsed.dimensions[0]} × ${parsed.dimensions[1]} × ${parsed.dimensions[2]} points · range ${min.toPrecision(4)} to ${max.toPrecision(4)}.`,
        );
      } catch (error) {
        setGrid(null);
        setSurfacePreview(null);
        setVolumeStatus(`Could not load ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        setSurfaceStatus('No field views are available.');
      }
    });
  };

  const updateFieldViews = () => {
    if (!grid) {
      setSurfaceStatus('Load a scalar field before updating field views.');
      return;
    }
    try {
      const positive = finiteNumber(positiveLevel, 'Positive isosurface level');
      const positiveOpacityValue = finiteNumber(positiveOpacity, 'Positive opacity');
      const negative = finiteNumber(negativeLevel, 'Negative isosurface level');
      const negativeOpacityValue = finiteNumber(negativeOpacity, 'Negative opacity');
      if (positiveOpacityValue < 0 || positiveOpacityValue > 1 || negativeOpacityValue < 0 || negativeOpacityValue > 1) {
        throw new RangeError('Isosurface opacity must be between 0 and 1.');
      }
      const positiveSurface = extractIsosurface(grid, positive);
      const negativeSurface = negative < 0 ? extractIsosurface(grid, negative) : null;
      setSurfacePreview({ positive: positiveSurface, negative: negativeSurface });
      setSurfaceStatus(
        `Positive surface: ${positiveSurface.triangles.length.toLocaleString()} triangles${negativeSurface ? `; negative surface: ${negativeSurface.triangles.length.toLocaleString()} triangles` : ''}. Opacity ${positiveOpacityValue} / ${negativeOpacityValue}.`,
      );
    } catch (error) {
      setSurfacePreview(null);
      setSurfaceStatus(error instanceof Error ? error.message : 'Could not build field views.');
    }
  };

  const runVoidAnalysis = () => {
    try {
      const result = analyzePeriodicVoids(document, {
        gridSpacing: finiteNumber(voidSpacing, 'Void grid spacing'),
        probeRadius: finiteNumber(probeRadius, 'Probe radius'),
        atomRadiusScale: finiteNumber(radiusScale, 'Atom radius scale'),
      });
      setVoidResult(result);
      const firstId = result.components[0]?.id ?? '';
      setSelectedVoidId(firstId);
      setVoidStatus(
        `Approximate void fraction ${formatPercent(result.voidFraction)} · accessible ${formatPercent(result.accessibleFraction)} · occupied ${formatPercent(result.occupiedFraction)} across ${result.gridPointCount.toLocaleString()} grid points.`,
      );
    } catch (error) {
      setVoidResult(null);
      setSelectedVoidId('');
      setVoidStatus(error instanceof Error ? error.message : 'Void analysis failed.');
    }
  };

  const updateFacet = (
    index: number,
    patch: Partial<MorphologyFacetSpec>,
  ) => {
    setFacets((current) => current.map((facet, facetIndex) =>
      facetIndex === index ? { ...facet, ...patch } : facet));
  };

  const buildMorphology = () => {
    try {
      const model = morphologyMethod === 'bfdh'
        ? buildBfdhMorphology(document.cell, facets)
        : buildWulffMorphology(document.cell, facets);
      setMorphology(model);
      setMorphologyStatus(
        `Built ${model.method.toUpperCase()} morphology with ${model.faces.length.toLocaleString()} faces and ${model.vertices.length.toLocaleString()} vertices.`,
      );
    } catch (error) {
      setMorphology(null);
      setMorphologyStatus(error instanceof Error ? error.message : 'Morphology construction failed.');
    }
  };

  return (
    <section
      className="crystal-structure-panel"
      data-testid="crystal-advanced-analysis-panel"
      aria-labelledby="crystal-advanced-analysis-heading"
    >
      <div className="crystal-panel-heading">
        <div>
          <h3 id="crystal-advanced-analysis-heading">Advanced analysis</h3>
          <p>Work with observed reflections, scalar fields, pore space, and crystal shape without sending data off this device.</p>
        </div>
      </div>

      <div className="crystal-analysis-grid">
        <section className="crystal-editor-card" aria-labelledby="crystal-reflection-analysis-heading">
          <div className="crystal-editor-card__heading">
            <div>
              <h4 id="crystal-reflection-analysis-heading">Reflection &amp; Fourier analysis</h4>
              <p>Compare local Fo data with the current model and inspect a model-phased difference-density grid.</p>
            </div>
          </div>
          <input
            ref={reflectionInputRef}
            data-testid="crystal-reflection-input"
            type="file"
            accept=".hkl,.txt,text/plain"
            onChange={handleReflectionFile}
            hidden
          />
          <button type="button" onClick={() => reflectionInputRef.current?.click()}>Open reflection data</button>
          <p role="status" data-testid="crystal-reflection-status">{reflectionStatus}</p>

          {reflectionAnalysis && 'error' in reflectionAnalysis ? (
            <p role="alert" className="crystal-editor-error">{reflectionAnalysis.error}</p>
          ) : reflectionAnalysis ? (
            <>
              <div className="crystal-analysis-summary" data-testid="crystal-reflection-metrics">
                <strong>R1 {reflectionAnalysis.metrics.r1.toFixed(5)}</strong>
                <span>wR2 {reflectionAnalysis.metrics.weightedR2.toFixed(5)}</span>
                <span>{reflectionAnalysis.metrics.formulae.r1}</span>
                <span>{reflectionAnalysis.metrics.formulae.weightedR2}</span>
              </div>
              <div className="crystal-analysis-table-wrap">
                <table className="crystal-analysis-table" data-testid="crystal-reflection-table">
                  <thead>
                    <tr><th>h k l</th><th>Fo</th><th>Fc</th><th>ΔF</th></tr>
                  </thead>
                  <tbody>
                    {reflectionAnalysis.comparisons.slice(0, 100).map(({ reflection, calculatedAmplitude }) => (
                      <tr key={reflection.hkl.join(',')}>
                        <td>({reflection.hkl.join(' ')})</td>
                        <td>{reflection.observedAmplitude.toFixed(4)}</td>
                        <td>{calculatedAmplitude.toFixed(4)}</td>
                        <td>{(reflection.observedAmplitude - calculatedAmplitude).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div data-testid="crystal-fourier-extrema" className="crystal-analysis-summary">
                <strong>Difference-density candidates</strong>
                <span>
                  Highest maximum {reflectionAnalysis.extrema.maxima[0]?.value.toPrecision(4) ?? 'none'} ·
                  lowest minimum {reflectionAnalysis.extrema.minima[0]?.value.toPrecision(4) ?? 'none'}
                </span>
                <span>{reflectionAnalysis.fourier.phaseNote}</span>
              </div>
            </>
          ) : null}
        </section>

        <section className="crystal-editor-card" aria-labelledby="crystal-volume-analysis-heading">
          <div className="crystal-editor-card__heading">
            <div>
              <h4 id="crystal-volume-analysis-heading">Volumetric fields</h4>
              <p>Open CUBE, XSF, or supported CCP4/MRC maps and inspect slices plus bounded isosurfaces.</p>
            </div>
          </div>
          <input
            ref={volumeInputRef}
            data-testid="crystal-volume-input"
            type="file"
            accept=".cube,.cub,.xsf,.map,.mrc,.ccp4,text/plain,application/octet-stream"
            onChange={handleVolumeFile}
            hidden
          />
          <button type="button" onClick={() => volumeInputRef.current?.click()}>Open scalar field</button>
          <p role="status" data-testid="crystal-volume-status">{volumeStatus}</p>

          {grid ? (
            <>
              <div className="crystal-analysis-controls">
                <label>
                  Slice axis
                  <select value={sliceAxis} onChange={(event) => {
                    setSliceAxis(event.target.value as OrthogonalAxis);
                    setSliceIndex('0');
                  }}>
                    <option value="x">X</option>
                    <option value="y">Y</option>
                    <option value="z">Z</option>
                  </select>
                </label>
                <label>
                  Slice index
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={sliceIndex}
                    onChange={(event) => setSliceIndex(event.target.value)}
                  />
                </label>
                <label>
                  Positive isosurface level
                  <input
                    type="number"
                    step="any"
                    value={positiveLevel}
                    onChange={(event) => setPositiveLevel(event.target.value)}
                  />
                </label>
                <label>
                  Positive opacity
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={positiveOpacity}
                    onChange={(event) => setPositiveOpacity(event.target.value)}
                  />
                </label>
                <label>
                  Negative isosurface level
                  <input
                    type="number"
                    step="any"
                    value={negativeLevel}
                    onChange={(event) => setNegativeLevel(event.target.value)}
                  />
                </label>
                <label>
                  Negative opacity
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={negativeOpacity}
                    onChange={(event) => setNegativeOpacity(event.target.value)}
                  />
                </label>
              </div>
              <button type="button" onClick={updateFieldViews}>Update field views</button>
              <p role="status" data-testid="crystal-isosurface-status">{surfaceStatus}</p>
              {surfacePreview ? (
                <CrystalIsosurfacePreview positive={surfacePreview.positive} negative={surfacePreview.negative} />
              ) : null}
              {sliceOutcome && 'error' in sliceOutcome ? (
                <p role="alert" className="crystal-editor-error">{sliceOutcome.error}</p>
              ) : sliceOutcome ? (
                <>
                  <CrystalSlicePreview slice={sliceOutcome.slice} />
                  <div className="crystal-analysis-table-wrap">
                  <table className="crystal-analysis-table" data-testid="crystal-volume-slice-table">
                    <caption>{sliceOutcome.slice.label} · {sliceOutcome.slice.width} × {sliceOutcome.slice.height}</caption>
                    <thead><tr><th>Sample</th><th>Value</th></tr></thead>
                    <tbody>
                      {sliceOutcome.slice.values.slice(0, 64).map((value, index) => (
                        <tr key={index}><td>{index + 1}</td><td>{value.toPrecision(6)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="crystal-editor-card" aria-labelledby="crystal-void-analysis-heading">
          <div className="crystal-editor-card__heading">
            <div>
              <h4 id="crystal-void-analysis-heading">Void &amp; cavity analysis</h4>
              <p>Estimate occupied, void, and probe-accessible fractions on a bounded periodic grid.</p>
            </div>
          </div>
          <div className="crystal-analysis-controls">
            <label>
              Void grid spacing (Å)
              <input type="number" min="0.1" step="0.1" value={voidSpacing} onChange={(event) => setVoidSpacing(event.target.value)} />
            </label>
            <label>
              Probe radius (Å)
              <input type="number" min="0" step="0.1" value={probeRadius} onChange={(event) => setProbeRadius(event.target.value)} />
            </label>
            <label>
              Atom radius scale
              <input type="number" min="0.1" step="0.05" value={radiusScale} onChange={(event) => setRadiusScale(event.target.value)} />
            </label>
          </div>
          <button type="button" onClick={runVoidAnalysis}>Analyze voids</button>
          <p role="status" data-testid="crystal-void-result">{voidStatus}</p>
          {voidResult ? (
            <>
              <p role="note">
                Grid {voidResult.dimensions.join(' × ')} · scaled covalent radii · periodic 6-neighbor connectivity.
              </p>
              <CrystalVoidPreview isolated={selectedVoid} resultDimensions={voidResult.dimensions} />
              {voidResult.components.length > 0 ? (
                <label>
                  Cavity component
                  <select value={selectedVoidId} onChange={(event) => setSelectedVoidId(event.target.value)}>
                    {voidResult.components.map((component) => (
                      <option value={component.id} key={component.id}>
                        {component.id} · {component.voxelCount.toLocaleString()} voxels
                      </option>
                    ))}
                  </select>
                </label>
              ) : <p>No separate void components were resolved at this grid and radius model.</p>}
              {selectedVoid ? (
                <p>
                  Selected {selectedVoid.component.id}: {selectedVoid.points.length.toLocaleString()} grid samples ·
                  {selectedVoid.component.accessible ? ' contains probe-accessible samples' : ' no probe-accessible samples'}.
                </p>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="crystal-editor-card" aria-labelledby="crystal-morphology-analysis-heading">
          <div className="crystal-editor-card__heading">
            <div>
              <h4 id="crystal-morphology-analysis-heading">Crystal morphology</h4>
              <p>Build a BFDH geometry estimate or a Wulff construction from explicit facet energies.</p>
            </div>
          </div>
          <label>
            Construction
            <select value={morphologyMethod} onChange={(event) => setMorphologyMethod(event.target.value as MorphologyMethod)}>
              <option value="bfdh">BFDH-style geometry</option>
              <option value="wulff">Wulff — supplied surface energies</option>
            </select>
          </label>
          <div className="crystal-analysis-table-wrap">
            <table className="crystal-analysis-table">
              <thead><tr><th>Facet</th><th>Use</th><th>Weight</th><th>Energy</th></tr></thead>
              <tbody>
                {facets.map((facet, index) => (
                  <tr key={facet.hkl.join(',')}>
                    <td>({facet.hkl.join(' ')})</td>
                    <td>
                      <input
                        aria-label={`Include facet ${facet.hkl.join(' ')}`}
                        type="checkbox"
                        checked={facet.included !== false}
                        onChange={(event) => updateFacet(index, { included: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Facet ${facet.hkl.join(' ')} weight`}
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={facet.weight ?? 1}
                        onChange={(event) => updateFacet(index, { weight: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Facet ${facet.hkl.join(' ')} surface energy`}
                        type="number"
                        min="0.01"
                        step="0.1"
                        value={facet.energy ?? 1}
                        disabled={morphologyMethod !== 'wulff'}
                        onChange={(event) => updateFacet(index, { energy: Number(event.target.value) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={buildMorphology}>Build morphology</button>
          <p role="status" data-testid="crystal-morphology-status">{morphologyStatus}</p>
          {morphology ? (
            <>
              <p role="note">{morphology.assumptions}</p>
              <CrystalMorphologyPreview model={morphology} />
              <div className="crystal-analysis-table-wrap">
                <table className="crystal-analysis-table" data-testid="crystal-morphology-table">
                  <thead><tr><th>Facet</th><th>d (Å)</th><th>Relative area</th><th>Normal</th></tr></thead>
                  <tbody>
                    {morphology.faces.map((face, index) => (
                      <tr key={`${face.hkl.join(',')}-${index}`}>
                        <td>({face.hkl.join(' ')})</td>
                        <td>{face.dSpacing.toFixed(4)}</td>
                        <td>{formatPercent(face.relativeArea)}</td>
                        <td>{face.normal.map((value) => value.toFixed(3)).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </section>
  );
}
