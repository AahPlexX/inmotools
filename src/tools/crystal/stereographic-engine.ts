import { planeNormal, type MillerIndex } from './reciprocal-engine';
import type { UnitCell } from './crystal-types';

export interface StereographicPole {
  readonly hkl: MillerIndex;
  /** Stereographic coordinates on the primitive circle (radius 1 = equator). */
  readonly x: number;
  readonly y: number;
}

const norm = (v: readonly [number, number, number]): number => Math.hypot(v[0], v[1], v[2]);

/**
 * Stereographic projection of one lattice-plane pole onto the equatorial plane,
 * projected from the south pole of the unit sphere. The (001) plane normal maps
 * to the center; equatorial poles map onto the primitive circle (radius 1).
 * Radius for a pole at polar angle θ is tan(θ/2).
 *
 * The projection frame is derived from the direct metric: the plane normal is
 * expressed in the Cartesian frame already used by reciprocal-engine
 * (planeNormal returns a unit Cartesian vector), with z taken as the projection
 * axis. Poles exactly on the south pole (normal ≈ -z) are unprojectable and
 * rejected rather than mapped to infinity.
 */
export function stereographicPole(cell: UnitCell, hkl: MillerIndex): StereographicPole {
  const normal = planeNormal(cell, hkl);
  const nz = normal[2];
  if (nz <= -1 + 1e-12) {
    throw new RangeError('Pole lies on the projection point (south pole) and cannot be projected.');
  }
  const denominator = 1 + nz;
  return { hkl, x: normal[0] / denominator, y: normal[1] / denominator };
}

/** Batch projection; poles on the projection point are omitted from the result. */
export function stereographicProjection(cell: UnitCell, hkls: readonly MillerIndex[]): readonly StereographicPole[] {
  const poles: StereographicPole[] = [];
  for (const hkl of hkls) {
    const normal = planeNormal(cell, hkl);
    const length = norm(normal);
    if (length <= 1e-12) continue;
    const nz = normal[2];
    if (nz <= -1 + 1e-12) continue;
    const denominator = 1 + nz;
    poles.push({ hkl, x: normal[0] / denominator, y: normal[1] / denominator });
  }
  return poles;
}
