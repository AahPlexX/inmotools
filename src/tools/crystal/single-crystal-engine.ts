import { enumerateReflections } from './diffraction-engine';
import { reflectionsInBraggRange, type EwaldIntersection, type EwaldRangeOptions } from './ewald-engine';
import { millerToCartesian, type MillerIndex } from './reciprocal-engine';
import { structureFactorIntensity } from './structure-factor-engine';
import type { CrystalDocument, Vec3 } from './crystal-types';

const EPSILON = 1e-12;

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a finite number greater than zero.`);
}

export interface SingleCrystalReflection extends EwaldIntersection {
  readonly gVector: Vec3;
  /** |F(hkl)|² normalised so the strongest reflection is 1000. */
  readonly intensity: number;
}

export interface SingleCrystalPattern {
  readonly wavelength: number;
  readonly reflections: readonly SingleCrystalReflection[];
}

export interface SingleCrystalOptions extends Omit<EwaldRangeOptions, 'wavelength'> {
  readonly wavelength: number;
}

/**
 * Monochromatic single-crystal reflection list: every reflection inside the
 * limiting sphere (λ < 2d) with its reciprocal vector and |F|² intensity.
 * The stationary-crystal rotation sweep (which subset touches the sphere at a
 * given orientation) is a documented follow-up; this is the feasible set at
 * arbitrary orientation, which every orientation-specific subset draws from.
 */
export function simulateSingleCrystal(document: CrystalDocument, options: SingleCrystalOptions): SingleCrystalPattern {
  assertPositiveFinite(options.wavelength, 'Wavelength');
  const hits = reflectionsInBraggRange(document.cell, options);
  let maxIntensity = 0;
  const reflections = hits.map((hit) => {
    const intensity = structureFactorIntensity(document, hit.hkl);
    if (intensity > maxIntensity) maxIntensity = intensity;
    return { ...hit, gVector: millerToCartesian(document.cell, hit.hkl), intensity };
  });
  const scale = maxIntensity > EPSILON ? 1000 / maxIntensity : 0;
  return {
    wavelength: options.wavelength,
    reflections: reflections.map((r) => ({ ...r, intensity: r.intensity * scale })),
  };
}

export interface LaueReflection {
  readonly hkl: MillerIndex;
  readonly d: number;
  readonly gVector: Vec3;
  /** Wavelength (Å) at which this reflection satisfies the Laue condition. */
  readonly wavelength: number;
  /** |F(hkl)|² normalised so the strongest reflection is 1000. */
  readonly intensity: number;
}

export interface LauePattern {
  readonly minWavelength: number;
  readonly maxWavelength: number;
  readonly reflections: readonly LaueReflection[];
}

export interface LaueOptions {
  readonly minWavelength: number;
  readonly maxWavelength: number;
  readonly minDSpacing: number;
  readonly maxReflections?: number;
}

/**
 * Back-reflection Laue simulation for a stationary crystal with the incident
 * beam along +z. A reflection diffracts toward -z when G_z < 0, at wavelength
 * λ = -2·G_z·d² (from the Ewald condition |G| = 2 sinθ/λ with sinθ = -G_z/|G|
 * and |G| = 1/d). Reflections whose required λ falls outside the white-beam
 * band are omitted. Intensities use |F(hkl)|².
 */
export function simulateLaueBackReflection(document: CrystalDocument, options: LaueOptions): LauePattern {
  assertPositiveFinite(options.minWavelength, 'Minimum wavelength');
  assertPositiveFinite(options.maxWavelength, 'Maximum wavelength');
  assertPositiveFinite(options.minDSpacing, 'Minimum d-spacing');
  if (options.minWavelength >= options.maxWavelength) {
    throw new RangeError('The Laue wavelength band is empty: minimum must be below maximum.');
  }
  const base = enumerateReflections(document.cell, { minDSpacing: options.minDSpacing, maxReflections: options.maxReflections });
  let maxIntensity = 0;
  const reflections: LaueReflection[] = [];
  for (const reflection of base) {
    const g = millerToCartesian(document.cell, reflection.hkl);
    if (g[2] >= -EPSILON) continue;
    const wavelength = (-2 * g[2]) / (reflection.d > 0 ? (1 / reflection.d) ** 2 : Number.POSITIVE_INFINITY);
    if (wavelength < options.minWavelength || wavelength > options.maxWavelength) continue;
    const intensity = structureFactorIntensity(document, reflection.hkl);
    if (intensity > maxIntensity) maxIntensity = intensity;
    reflections.push({ hkl: reflection.hkl, d: reflection.d, gVector: g, wavelength, intensity });
  }
  const scale = maxIntensity > EPSILON ? 1000 / maxIntensity : 0;
  reflections.sort((a, b) => a.wavelength - b.wavelength);
  return {
    minWavelength: options.minWavelength,
    maxWavelength: options.maxWavelength,
    reflections: reflections.map((r) => ({ ...r, intensity: r.intensity * scale })),
  };
}
