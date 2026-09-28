import { enumerateReflections, twoThetaFor, type LatticeCentering, type Reflection } from './diffraction-engine';
import { dSpacing, millerToCartesian, type MillerIndex } from './reciprocal-engine';
import type { UnitCell, Vec3 } from './crystal-types';

const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a finite number greater than zero.`);
}

export interface EwaldIntersection extends Reflection {
  /** |G_hkl| = 1/d in Å⁻¹ — the reciprocal-space scattering vector magnitude. */
  readonly scatteringVectorLength: number;
  /** True when the reciprocal-lattice point can touch the Ewald sphere (λ < 2d). */
  readonly diffracts: boolean;
  /** Bragg 2θ in degrees when diffracting, otherwise null. */
  readonly twoTheta: number | null;
}

export interface EwaldRangeOptions {
  readonly wavelength: number;
  readonly minDSpacing: number;
  readonly centering?: LatticeCentering;
  readonly maxReflections?: number;
}

/** Ewald-sphere intersection for one reflection at a given wavelength (Å). */
export function ewaldIntersection(cell: UnitCell, hkl: MillerIndex, wavelength: number): EwaldIntersection {
  assertPositiveFinite(wavelength, 'Wavelength');
  const d = dSpacing(cell, hkl);
  const scatteringVectorLength = norm(millerToCartesian(cell, hkl));
  const diffracts = wavelength < 2 * d;
  return {
    hkl,
    d,
    scatteringVectorLength,
    diffracts,
    twoTheta: diffracts ? twoThetaFor(wavelength, d) : null,
  };
}

/**
 * All enumerated reflections that can satisfy the Bragg condition (λ < 2d) for
 * the given wavelength — equivalently, the reciprocal-lattice points inside the
 * limiting sphere of radius 1/λ centered on the origin.
 */
export function reflectionsInBraggRange(cell: UnitCell, options: EwaldRangeOptions): readonly EwaldIntersection[] {
  assertPositiveFinite(options.wavelength, 'Wavelength');
  return enumerateReflections(cell, options)
    .map((reflection) => ewaldIntersection(cell, reflection.hkl, options.wavelength))
    .filter((intersection) => intersection.diffracts);
}
