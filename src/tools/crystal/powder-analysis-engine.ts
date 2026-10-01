import { millerToCartesian, type MillerIndex } from './reciprocal-engine';
import type { PowderPattern, ProfilePoint } from './diffraction-engine';
import type { UnitCell } from './crystal-types';

const DEG_PER_RAD = 180 / Math.PI;
const DEFAULT_MAX_POINTS = 20_000;

export interface CagliotiParameters {
  readonly u: number;
  readonly v: number;
  readonly w: number;
}

export interface SampleBroadeningOptions {
  readonly crystalliteSizeNm?: number;
  readonly microstrain?: number;
  readonly scherrerK?: number;
}

export interface MultiPhaseInput {
  readonly id: string;
  readonly pattern: PowderPattern;
  readonly scale: number;
  readonly cell?: UnitCell;
  readonly preferredAxis?: MillerIndex;
  readonly marchParameter?: number;
}

export interface MultiPhaseProfileOptions extends SampleBroadeningOptions {
  readonly step: number;
  readonly eta?: number;
  readonly caglioti: CagliotiParameters;
  readonly maxPoints?: number;
}

export interface MultiPhaseProfile {
  readonly points: readonly ProfilePoint[];
  readonly phaseIds: readonly string[];
  readonly assumptions: readonly string[];
}

export interface PeakPickOptions {
  readonly minRelativeHeight?: number;
  readonly minSeparation?: number;
  readonly maxPeaks?: number;
}

export interface PickedPeak extends ProfilePoint {
  readonly relativeHeight: number;
}

export interface RietveldPhaseInput {
  readonly id: string;
  readonly scale: number;
  /** Number of formula units per unit cell. */
  readonly z: number | null;
  /** Formula mass in consistent mass units. */
  readonly formulaMass: number | null;
  /** Unit-cell volume in Å^3. */
  readonly cellVolume: number | null;
}

export interface RietveldPhaseFraction {
  readonly id: string;
  readonly weightFraction: number;
  readonly numerator: number;
}

function positiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function thetaRadians(twoTheta: number): number {
  finite(twoTheta, '2θ');
  if (twoTheta <= 0 || twoTheta >= 180) throw new RangeError('2θ must be greater than 0° and less than 180°.');
  return twoTheta * Math.PI / 360;
}

/**
 * Caglioti instrumental FWHM in degrees 2θ:
 * H² = U tan²θ + V tanθ + W.
 *
 * U/V/W must therefore be supplied in a degree-consistent parameterization.
 */
export function cagliotiFwhm(twoTheta: number, parameters: CagliotiParameters): number {
  const theta = thetaRadians(twoTheta);
  finite(parameters.u, 'Caglioti U');
  finite(parameters.v, 'Caglioti V');
  finite(parameters.w, 'Caglioti W');
  const tanTheta = Math.tan(theta);
  const variance = parameters.u * tanTheta * tanTheta + parameters.v * tanTheta + parameters.w;
  if (!(variance > 0)) {
    throw new RangeError(`Caglioti U/V/W produce a non-positive FWHM² at 2θ = ${twoTheta.toFixed(4)}°.`);
  }
  return Math.sqrt(variance);
}

/**
 * Isotropic size + microstrain broadening in degrees 2θ.
 * The terms follow the Scherrer/Williamson-Hall relation
 * β cosθ = Kλ/D + 2ε sinθ and are added in quadrature.
 */
export function sampleBroadeningFwhm(
  twoTheta: number,
  wavelengthAngstrom: number,
  options: SampleBroadeningOptions,
): number {
  const theta = thetaRadians(twoTheta);
  positiveFinite(wavelengthAngstrom, 'Wavelength');
  const k = options.scherrerK ?? 0.9;
  positiveFinite(k, 'Scherrer K');

  let sizeRadians = 0;
  if (options.crystalliteSizeNm !== undefined) {
    positiveFinite(options.crystalliteSizeNm, 'Crystallite size');
    const sizeAngstrom = options.crystalliteSizeNm * 10;
    sizeRadians = (k * wavelengthAngstrom) / (sizeAngstrom * Math.cos(theta));
  }

  let strainRadians = 0;
  if (options.microstrain !== undefined) {
    if (!Number.isFinite(options.microstrain) || options.microstrain < 0) {
      throw new RangeError('Microstrain must be a non-negative finite fraction.');
    }
    strainRadians = 2 * options.microstrain * Math.tan(theta);
  }

  return Math.hypot(sizeRadians, strainRadians) * DEG_PER_RAD;
}

/**
 * Standard March-Dollase preferred-orientation multiplier:
 * [r² cos²α + r⁻¹ sin²α]^(-3/2).
 */
export function marchDollaseFactor(
  cell: UnitCell,
  reflection: MillerIndex,
  preferredAxis: MillerIndex,
  r: number,
): number {
  positiveFinite(r, 'March-Dollase r');
  const reflectionVector = millerToCartesian(cell, reflection);
  const axisVector = millerToCartesian(cell, preferredAxis);
  const reflectionNorm = Math.hypot(...reflectionVector);
  const axisNorm = Math.hypot(...axisVector);
  if (!(reflectionNorm > 0) || !(axisNorm > 0)) {
    throw new RangeError('Preferred-orientation axis and reflection must be non-zero Miller indices.');
  }
  const cosine = Math.max(-1, Math.min(1,
    (reflectionVector[0] * axisVector[0]
      + reflectionVector[1] * axisVector[1]
      + reflectionVector[2] * axisVector[2]) / (reflectionNorm * axisNorm),
  ));
  const cos2 = cosine * cosine;
  const sin2 = Math.max(0, 1 - cos2);
  return (r * r * cos2 + sin2 / r) ** -1.5;
}

function gaussian(delta: number, fwhm: number): number {
  return Math.exp((-4 * Math.LN2 * delta * delta) / (fwhm * fwhm));
}

function lorentzian(delta: number, fwhm: number): number {
  return 1 / (1 + (4 * delta * delta) / (fwhm * fwhm));
}

function effectiveFwhm(
  twoTheta: number,
  wavelength: number,
  options: MultiPhaseProfileOptions,
): number {
  const instrument = cagliotiFwhm(twoTheta, options.caglioti);
  const sample = sampleBroadeningFwhm(twoTheta, wavelength, options);
  return Math.hypot(instrument, sample);
}

export function simulateMultiPhaseProfile(
  phases: readonly MultiPhaseInput[],
  options: MultiPhaseProfileOptions,
): MultiPhaseProfile {
  if (phases.length === 0) throw new RangeError('At least one powder phase is required.');
  positiveFinite(options.step, 'Profile step');
  const eta = options.eta ?? 0.5;
  if (!Number.isFinite(eta) || eta < 0 || eta > 1) {
    throw new RangeError('Pseudo-Voigt eta must be between 0 and 1.');
  }
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
  if (!Number.isSafeInteger(maxPoints) || maxPoints <= 0) {
    throw new RangeError('Profile point limit must be a positive integer.');
  }

  const active = phases.map((phase) => {
    if (!phase.id.trim()) throw new RangeError('Powder phase IDs must not be empty.');
    if (!Number.isFinite(phase.scale) || phase.scale < 0) {
      throw new RangeError(`Scale for phase ${phase.id} must be a non-negative finite number.`);
    }
    if (phase.marchParameter !== undefined) {
      if (!phase.cell || !phase.preferredAxis) {
        throw new RangeError(`Phase ${phase.id} needs a cell and preferred axis when March-Dollase correction is enabled.`);
      }
      positiveFinite(phase.marchParameter, `March-Dollase r for phase ${phase.id}`);
    }
    return phase;
  });

  const allReflections = active.flatMap((phase) => phase.pattern.reflections.map((reflection) => {
    const fwhm = effectiveFwhm(reflection.twoTheta, phase.pattern.wavelength, options);
    const orientation = phase.marchParameter === undefined
      ? 1
      : marchDollaseFactor(phase.cell!, reflection.hkl, phase.preferredAxis!, phase.marchParameter);
    return {
      position: reflection.twoTheta,
      intensity: reflection.intensity * phase.scale * orientation,
      fwhm,
    };
  }));
  if (allReflections.length === 0) {
    return {
      points: [],
      phaseIds: active.map((phase) => phase.id),
      assumptions: ['No simulated reflections were inside the requested diffraction range.'],
    };
  }

  const padding = Math.max(...allReflections.map((reflection) => reflection.fwhm)) * 5;
  const start = Math.max(0, Math.min(...allReflections.map((reflection) => reflection.position)) - padding);
  const end = Math.max(...allReflections.map((reflection) => reflection.position)) + padding;
  const count = Math.ceil((end - start) / options.step) + 1;
  if (count > maxPoints) {
    throw new RangeError(`Combined profile would contain ${count.toLocaleString()} points, above the ${maxPoints.toLocaleString()}-point limit.`);
  }

  const points: ProfilePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const twoTheta = start + index * options.step;
    let intensity = 0;
    for (const reflection of allReflections) {
      const delta = twoTheta - reflection.position;
      intensity += reflection.intensity * (
        eta * lorentzian(delta, reflection.fwhm)
        + (1 - eta) * gaussian(delta, reflection.fwhm)
      );
    }
    points.push({ twoTheta, intensity });
  }

  const assumptions = [
    'Instrumental FWHM uses the Caglioti relation H² = U tan²θ + V tanθ + W.',
    'Crystallite-size and isotropic microstrain widths use a Scherrer/Williamson-Hall approximation and are combined in quadrature with instrumental width.',
    'The line profile is pseudo-Voigt with a single user-supplied eta.',
  ];
  if (active.some((phase) => phase.marchParameter !== undefined)) {
    assumptions.push('Preferred orientation uses the March-Dollase multiplier [r² cos²α + r⁻¹ sin²α]^(-3/2).');
  }
  return { points, phaseIds: active.map((phase) => phase.id), assumptions };
}

export function pickProfilePeaks(
  points: readonly ProfilePoint[],
  options: PeakPickOptions = {},
): readonly PickedPeak[] {
  if (points.length < 3) return [];
  const minRelativeHeight = options.minRelativeHeight ?? 0.02;
  const minSeparation = options.minSeparation ?? 0;
  const maxPeaks = options.maxPeaks ?? 500;
  if (!Number.isFinite(minRelativeHeight) || minRelativeHeight < 0 || minRelativeHeight > 1) {
    throw new RangeError('Peak-picking relative-height threshold must be between 0 and 1.');
  }
  if (!Number.isFinite(minSeparation) || minSeparation < 0) {
    throw new RangeError('Peak-picking minimum separation must be non-negative.');
  }
  if (!Number.isSafeInteger(maxPeaks) || maxPeaks <= 0) {
    throw new RangeError('Peak-picking limit must be a positive integer.');
  }
  const maximum = Math.max(...points.map((point) => point.intensity));
  if (!(maximum > 0)) return [];

  const candidates: PickedPeak[] = [];
  for (let index = 1; index + 1 < points.length; index += 1) {
    const current = points[index]!;
    const relativeHeight = current.intensity / maximum;
    if (relativeHeight < minRelativeHeight) continue;
    if (current.intensity < points[index - 1]!.intensity || current.intensity < points[index + 1]!.intensity) continue;
    candidates.push({ ...current, relativeHeight });
  }

  const accepted: PickedPeak[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.intensity - a.intensity || a.twoTheta - b.twoTheta)) {
    if (accepted.some((peak) => Math.abs(peak.twoTheta - candidate.twoTheta) < minSeparation)) continue;
    accepted.push(candidate);
    if (accepted.length >= maxPeaks) break;
  }
  return accepted.sort((a, b) => a.twoTheta - b.twoTheta);
}

/**
 * Hill-Howard quantitative phase estimate:
 * Wp = Sp(ZMV)p / Σ Si(ZMV)i.
 * The calculation is intentionally gated on complete positive Z, M and V data.
 */
export function estimateRietveldPhaseFractions(
  phases: readonly RietveldPhaseInput[],
): readonly RietveldPhaseFraction[] {
  if (phases.length === 0) throw new RangeError('At least one phase is required for a phase-fraction estimate.');
  const weighted = phases.map((phase) => {
    positiveFinite(phase.scale, `Scale for phase ${phase.id}`);
    if (phase.z === null || phase.formulaMass === null || phase.cellVolume === null) {
      throw new RangeError(`Phase ${phase.id} requires scale, Z, formula mass and cell volume before a Hill-Howard phase fraction can be reported.`);
    }
    positiveFinite(phase.z, `Z for phase ${phase.id}`);
    positiveFinite(phase.formulaMass, `Formula mass for phase ${phase.id}`);
    positiveFinite(phase.cellVolume, `Cell volume for phase ${phase.id}`);
    return { id: phase.id, numerator: phase.scale * phase.z * phase.formulaMass * phase.cellVolume };
  });
  const denominator = weighted.reduce((sum, phase) => sum + phase.numerator, 0);
  positiveFinite(denominator, 'Phase-fraction denominator');
  return weighted.map((phase) => ({
    ...phase,
    weightFraction: phase.numerator / denominator,
  }));
}
