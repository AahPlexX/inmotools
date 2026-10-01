/**
 * Powder-pattern fitting (master design items 109-111).
 *
 * Model: y(x) = background0 + background1 * t + scale * sum_k I_k * PV(x - zero - 2theta_k)
 * with t running 0..1 across the observed trace and PV a pseudo-Voigt of full width `fwhm`
 * and mixing factor `eta` (0 = Gaussian, 1 = Lorentzian). Reflection positions and relative
 * intensities come from the structure once; lattice parameters are not refined here.
 *
 * Fit measures (displayed in-product with these formulas):
 *   Rp  = sum|yo - yc| / sum|yo|
 *   Rwp = sqrt( sum w (yo - yc)^2 / sum w yo^2 ),  w = 1 / max(yo, 0.01 * max(yo))
 */
import { simulatePowderPattern, type RadiationType } from './diffraction-engine';
import { fitLeastSquares, type FitOptions, type FitParameter, type FitResult } from './fit-engine';
import type { ObservedPattern } from './observed-pattern-engine';
import type { CrystalDocument } from './crystal-types';

export interface PowderModelParameters {
  readonly scale: number;
  readonly zero: number;
  readonly background0: number;
  readonly background1: number;
  readonly fwhm: number;
  readonly eta: number;
}

export interface PowderFitOverride {
  readonly value?: number;
  readonly free?: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface PowderFitOptions {
  readonly wavelength: number;
  readonly minDSpacing: number;
  readonly kind?: RadiationType;
  readonly overrides?: Readonly<Partial<Record<keyof PowderModelParameters, PowderFitOverride>>>;
  readonly fit?: FitOptions;
}

export interface PowderFitResult {
  readonly fit: FitResult;
  /** Names of the parameters that were free in this run, in fit order. */
  readonly activeParameters: readonly string[];
  readonly calculated: readonly number[];
  readonly rp: number;
  readonly rwp: number;
}

const NAMES: readonly (keyof PowderModelParameters)[] = ['scale', 'zero', 'background0', 'background1', 'fwhm', 'eta'];
const MIN_POINTS = 10;

/** Evaluate the powder model at each x (degrees 2theta). Requires at least two x values. */
export function evaluatePowderModel(
  reflections: readonly { readonly twoTheta: number; readonly intensity: number }[],
  model: PowderModelParameters,
  xs: readonly number[],
): number[] {
  if (xs.length < 2) throw new RangeError('Powder model needs at least two x positions.');
  if (!(model.fwhm > 0)) throw new RangeError('Powder model FWHM must be positive.');
  const first = xs[0]!;
  const span = xs[xs.length - 1]! - first || 1;
  const w2 = model.fwhm * model.fwhm;
  return xs.map((x) => {
    let peaks = 0;
    for (const reflection of reflections) {
      const dx = x - model.zero - reflection.twoTheta;
      const dx2 = dx * dx;
      peaks += reflection.intensity * (model.eta / (1 + (4 * dx2) / w2) + (1 - model.eta) * Math.exp((-4 * Math.LN2 * dx2) / w2));
    }
    return model.background0 + model.background1 * ((x - first) / span) + model.scale * peaks;
  });
}

const toModel = (values: readonly number[]): PowderModelParameters => ({
  scale: values[0]!, zero: values[1]!, background0: values[2]!, background1: values[3]!, fwhm: values[4]!, eta: values[5]!,
});

/**
 * Fit scale, zero shift, a linear background and profile width to an observed 2theta trace.
 *
 * @throws {RangeError} d-axis data, fewer than 10 points, or invalid overrides/bounds.
 */
export function fitPowderPattern(document: CrystalDocument, observed: ObservedPattern, options: PowderFitOptions): PowderFitResult {
  if (observed.xAxis !== 'twoTheta') throw new RangeError('Powder fitting needs an observed trace on the 2theta axis.');
  if (observed.peaks.length < MIN_POINTS) throw new RangeError(`Powder fitting needs at least ${MIN_POINTS} observed points.`);
  const xs = observed.peaks.map((point) => point.position);
  const yo = observed.peaks.map((point) => point.intensity);
  const pattern = simulatePowderPattern(document.cell, {
    kind: options.kind ?? 'xray',
    wavelength: options.wavelength,
    minDSpacing: options.minDSpacing,
    document,
  });
  if (!pattern.reflections.length) throw new RangeError('No reflections fall in the requested range, so nothing can be fitted.');

  // --- starting values: background at the trace minimum, scale from the peak-to-background height ---
  const maxObserved = Math.max(...yo);
  const minObserved = Math.min(...yo);
  const maxModel = Math.max(...pattern.reflections.map((reflection) => reflection.intensity)) || 1;
  const defaults: Record<keyof PowderModelParameters, FitParameter> = {
    scale: { name: 'scale', value: Math.max((maxObserved - minObserved) / maxModel, 1e-6), free: true, min: 0 },
    zero: { name: 'zero', value: 0, free: true, min: -1, max: 1 },
    background0: { name: 'background0', value: minObserved, free: true },
    background1: { name: 'background1', value: 0, free: true },
    fwhm: { name: 'fwhm', value: 0.2, free: true, min: 0.01, max: 5 },
    eta: { name: 'eta', value: 0.5, free: false, min: 0, max: 1 },
  };
  const parameters = NAMES.map((name) => ({ ...defaults[name], ...options.overrides?.[name] }));

  const fit = fitLeastSquares(
    parameters,
    (values) => {
      const calculated = evaluatePowderModel(pattern.reflections, toModel(values), xs);
      return calculated.map((value, index) => value - yo[index]!);
    },
    options.fit,
  );

  const calculated = evaluatePowderModel(pattern.reflections, toModel(fit.parameters.map((parameter) => parameter.value)), xs);
  const floor = 0.01 * maxObserved;
  let absError = 0;
  let absObserved = 0;
  let weightedError = 0;
  let weightedObserved = 0;
  yo.forEach((observedValue, index) => {
    const error = observedValue - calculated[index]!;
    const weight = 1 / Math.max(observedValue, floor, Number.MIN_VALUE);
    absError += Math.abs(error);
    absObserved += Math.abs(observedValue);
    weightedError += weight * error * error;
    weightedObserved += weight * observedValue * observedValue;
  });

  return {
    fit,
    activeParameters: parameters.filter((parameter) => parameter.free).map((parameter) => parameter.name),
    calculated,
    rp: absObserved > 0 ? absError / absObserved : Number.NaN,
    rwp: weightedObserved > 0 ? Math.sqrt(weightedError / weightedObserved) : Number.NaN,
  };
}
