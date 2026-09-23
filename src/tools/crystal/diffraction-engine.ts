import { reciprocalMatrix } from './cell-engine';
import { dSpacing, type MillerIndex } from './reciprocal-engine';
import { structureFactorIntensity } from './structure-factor-engine';
import type { CrystalDocument, UnitCell, Vec3 } from './crystal-types';

const EPSILON = 1e-12;
const DEFAULT_MAX_REFLECTIONS = 10_000;

export type RadiationType = 'xray' | 'neutron' | 'electron';
export type LatticeCentering = 'P' | 'A' | 'B' | 'C' | 'I' | 'F' | 'R';

export interface Reflection {
  readonly hkl: MillerIndex;
  readonly d: number;
}

export interface PowderReflection extends Reflection {
  readonly twoTheta: number;
  readonly intensity: number;
  readonly multiplicity: number;
}

export interface PowderPattern {
  readonly kind: RadiationType;
  readonly wavelength: number;
  readonly reflections: readonly PowderReflection[];
  /** Which intensity model produced the pattern; 'kinematic' is the document-free fallback. */
  readonly intensityModel: 'kinematic' | 'structure-factor';
}

export interface EnumerateOptions {
  readonly minDSpacing: number;
  readonly centering?: LatticeCentering;
  readonly maxReflections?: number;
}

export interface PowderOptions {
  readonly kind: RadiationType;
  readonly wavelength: number;
  readonly minDSpacing: number;
  readonly centering?: LatticeCentering;
  readonly maxReflections?: number;
  /**
   * Optional full document. When provided and every site has a verified
   * scattering factor, intensities are weighted by |F(hkl)|²; otherwise the
   * pattern degrades uniformly to the kinematic multiplicity-only model.
   */
  readonly document?: CrystalDocument;
}

const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a finite number greater than zero.`);
}

/** Conventional centering systematic-absence rule; returns true when the reflection is allowed. */
export function centeringAllows(centering: LatticeCentering, h: number, k: number, l: number): boolean {
  switch (centering) {
    case 'P': return true;
    case 'A': return (k + l) % 2 === 0;
    case 'B': return (h + l) % 2 === 0;
    case 'C': return (h + k) % 2 === 0;
    case 'I': return (h + k + l) % 2 === 0;
    case 'F': {
      const parities = [h % 2 !== 0, k % 2 !== 0, l % 2 !== 0];
      return parities[0] === parities[1] && parities[1] === parities[2];
    }
    case 'R': return ((-h + k + l) % 3 + 3) % 3 === 0;
    default: {
      const unreachable: never = centering;
      throw new RangeError(`Unsupported lattice centering: ${String(unreachable)}`);
    }
  }
}

/** Bragg angle pair: 2θ in degrees for wavelength λ (Å) and d-spacing d (Å). */
export function twoThetaFor(wavelength: number, d: number): number {
  assertPositiveFinite(wavelength, 'Wavelength');
  assertPositiveFinite(d, 'd-spacing');
  const sinTheta = wavelength / (2 * d);
  if (sinTheta > 1 + EPSILON) {
    throw new RangeError(`No Bragg reflection exists: wavelength ${wavelength} Å exceeds 2d (${2 * d} Å).`);
  }
  return (2 * Math.asin(Math.min(1, sinTheta)) * 180) / Math.PI;
}

/**
 * Enumerate unique reflections with d >= minDSpacing, ordered by descending d.
 * Friedel mates (hkl / -h-k-l) are collapsed to a single entry since a powder
 * pattern cannot distinguish them.
 */
export function enumerateReflections(cell: UnitCell, options: EnumerateOptions): readonly Reflection[] {
  assertPositiveFinite(options.minDSpacing, 'Minimum d-spacing');
  const maxReflections = options.maxReflections ?? DEFAULT_MAX_REFLECTIONS;
  if (!Number.isSafeInteger(maxReflections) || maxReflections <= 0) {
    throw new RangeError('Reflection limit must be a positive integer.');
  }
  const centering = options.centering ?? 'P';

  const [aStar, bStar, cStar] = reciprocalMatrix(cell);
  const minReciprocalLength = Math.min(norm(aStar), norm(bStar), norm(cStar));
  if (!Number.isFinite(minReciprocalLength) || minReciprocalLength <= EPSILON) {
    throw new RangeError('Reciprocal basis is degenerate.');
  }
  const bound = Math.ceil(1 / (options.minDSpacing * minReciprocalLength));

  const seen = new Set<string>();
  const reflections: Reflection[] = [];
  for (let h = -bound; h <= bound; h += 1) {
    for (let k = -bound; k <= bound; k += 1) {
      for (let l = -bound; l <= bound; l += 1) {
        if (h === 0 && k === 0 && l === 0) continue;
        // Collapse Friedel pairs: keep only one of (hkl) and (-h-k-l).
        if (h < 0 || (h === 0 && k < 0) || (h === 0 && k === 0 && l < 0)) continue;
        if (!centeringAllows(centering, h, k, l)) continue;
        const key = `${h},${k},${l}`;
        if (seen.has(key)) continue;
        const d = dSpacing(cell, [h, k, l]);
        if (d + EPSILON < options.minDSpacing) continue;
        seen.add(key);
        reflections.push({ hkl: [h, k, l], d });
        if (reflections.length > maxReflections) {
          throw new RangeError(`Reflection enumeration exceeded the ${maxReflections.toLocaleString()}-reflection limit; raise minDSpacing.`);
        }
      }
    }
  }
  reflections.sort((left, right) => right.d - left.d);
  return reflections;
}

/** Number of symmetry-equivalent sign/permutation variants of |h|,|k|,|l| for a cubic metric. */
function cubicMultiplicity(h: number, k: number, l: number): number {
  const counts = new Map<number, number>();
  for (const value of [Math.abs(h), Math.abs(k), Math.abs(l)]) counts.set(value, (counts.get(value) ?? 0) + 1);
  let permutations = 6;
  for (const count of counts.values()) {
    for (let n = 2; n <= count; n += 1) permutations /= n;
  }
  const zeros = [...[h, k, l]].filter((value) => value === 0).length;
  const signs = 2 ** (3 - zeros);
  return permutations * signs;
}

function lorentzPolarization(kind: RadiationType, twoThetaDeg: number): number {
  const theta = (twoThetaDeg * Math.PI) / 360;
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  if (sinTheta <= EPSILON || cosTheta <= EPSILON) return 0;
  const lorentz = 1 / (sinTheta * sinTheta * cosTheta);
  return kind === 'neutron' ? lorentz : lorentz * (1 + Math.cos(2 * theta) ** 2) / 2;
}

/**
 * Simulate a powder pattern: Bragg positions from the cell, multiplicity and
 * Lorentz(±polarization), and |F(hkl)|² when a document with verified
 * scattering factors is provided; normalised to a max of 1000.
 */
export function simulatePowderPattern(cell: UnitCell, options: PowderOptions): PowderPattern {
  assertPositiveFinite(options.wavelength, 'Wavelength');
  const base = enumerateReflections(cell, options);

  let intensityFactor: ((hkl: MillerIndex) => number) | null = null;
  let intensityModel: 'kinematic' | 'structure-factor' = 'kinematic';
  if (options.document) {
    const document = options.document;
    try {
      structureFactorIntensity(document, [1, 0, 0]);
      intensityFactor = (hkl) => structureFactorIntensity(document, hkl);
      intensityModel = 'structure-factor';
    } catch {
      intensityFactor = null;
    }
  }

  const reflections: PowderReflection[] = [];
  let maxRaw = 0;
  for (const reflection of base) {
    if (options.wavelength >= 2 * reflection.d) continue;
    const twoTheta = twoThetaFor(options.wavelength, reflection.d);
    if (!(twoTheta > 0)) continue;
    const multiplicity = cubicMultiplicity(reflection.hkl[0], reflection.hkl[1], reflection.hkl[2]);
    const raw = multiplicity
      * lorentzPolarization(options.kind, twoTheta)
      * (intensityFactor ? intensityFactor(reflection.hkl) : 1);
    if (!Number.isFinite(raw) || raw < 0) continue;
    reflections.push({ ...reflection, twoTheta, intensity: raw, multiplicity });
    if (raw > maxRaw) maxRaw = raw;
  }
  const scale = maxRaw > EPSILON ? 1000 / maxRaw : 0;
  return {
    kind: options.kind,
    wavelength: options.wavelength,
    reflections: reflections.map((r) => ({ ...r, intensity: r.intensity * scale })),
    intensityModel,
  };
}

export type PowderProfileShape = 'gaussian' | 'lorentzian' | 'pseudo-voigt';

export interface ProfileOptions {
  readonly profileShape: PowderProfileShape;
  /** Full width at half maximum in degrees 2theta. */
  readonly fwhm: number;
  /** Sampling step in degrees 2theta. */
  readonly step: number;
  /** Pseudo-Voigt mixing factor (0 = pure Gaussian, 1 = pure Lorentzian). */
  readonly eta?: number;
  readonly maxPoints?: number;
}

export interface ProfilePoint {
  readonly twoTheta: number;
  readonly intensity: number;
}

const DEFAULT_MAX_PROFILE_POINTS = 20_000;

/**
 * Convolve a stick pattern with a peak-shape function into a continuous
 * profile, sampled over [min(2theta) - 5*FWHM, max(2theta) + 5*FWHM]. Bounded
 * by maxPoints (default 20k); exceeding the cap raises rather than truncating.
 */
export function broadenPowderPattern(pattern: PowderPattern, options: ProfileOptions): readonly ProfilePoint[] {
  assertPositiveFinite(options.fwhm, 'Profile FWHM');
  assertPositiveFinite(options.step, 'Profile step');
  const eta = options.eta ?? 0.5;
  if (options.profileShape === 'pseudo-voigt' && (eta < 0 || eta > 1)) {
    throw new RangeError('Pseudo-Voigt mixing factor eta must be between 0 and 1.');
  }
  const maxPoints = options.maxPoints ?? DEFAULT_MAX_PROFILE_POINTS;
  if (!Number.isSafeInteger(maxPoints) || maxPoints <= 0) {
    throw new RangeError('Profile point limit must be a positive integer.');
  }
  if (pattern.reflections.length === 0) return [];

  const gaussian = (x: number): number => Math.exp((-4 * Math.LN2 * x * x) / (options.fwhm * options.fwhm));
  const lorentzian = (x: number): number => 1 / (1 + (4 * x * x) / (options.fwhm * options.fwhm));
  const shape = (x: number): number => {
    switch (options.profileShape) {
      case 'gaussian': return gaussian(x);
      case 'lorentzian': return lorentzian(x);
      case 'pseudo-voigt': return eta * lorentzian(x) + (1 - eta) * gaussian(x);
    }
  };

  const positions = pattern.reflections.map((r) => r.twoTheta);
  const start = Math.max(0, Math.min(...positions) - 5 * options.fwhm);
  const end = Math.max(...positions) + 5 * options.fwhm;
  const pointCount = Math.ceil((end - start) / options.step) + 1;
  if (pointCount > maxPoints) {
    throw new RangeError(`Profile would contain ${pointCount.toLocaleString()} points, exceeding the ${maxPoints.toLocaleString()}-point limit; increase the step.`);
  }

  const points: ProfilePoint[] = new Array<ProfilePoint>(pointCount);
  for (let i = 0; i < pointCount; i += 1) {
    const twoTheta = start + i * options.step;
    let intensity = 0;
    for (const reflection of pattern.reflections) {
      intensity += reflection.intensity * shape(twoTheta - reflection.twoTheta);
    }
    points[i] = { twoTheta, intensity };
  }
  return points;
}
