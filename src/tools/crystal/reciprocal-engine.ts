import { cellToMatrix, reciprocalMatrix } from './cell-engine';
import type { Mat3, UnitCell, Vec3 } from './crystal-types';

const EPSILON = 1e-12;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const scale = (v: Vec3, f: number): Vec3 => [v[0] * f, v[1] * f, v[2] * f];

export type MillerIndex = readonly [number, number, number];

export interface ReciprocalLatticeParameters {
  readonly aStar: number;
  readonly bStar: number;
  readonly cStar: number;
  readonly alphaStar: number;
  readonly betaStar: number;
  readonly gammaStar: number;
}

function assertMiller(hkl: MillerIndex): void {
  if (!hkl.every(Number.isSafeInteger)) throw new RangeError('Miller indices must be integers.');
  if (hkl[0] === 0 && hkl[1] === 0 && hkl[2] === 0) throw new RangeError('Miller index (0 0 0) does not define a lattice plane.');
}

function angleDeg(u: Vec3, v: Vec3): number {
  const d = norm(u) * norm(v);
  if (!Number.isFinite(d) || d <= EPSILON) throw new RangeError('Reciprocal basis is degenerate.');
  const c = Math.min(1, Math.max(-1, dot(u, v) / d));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Reciprocal basis rows (a*, b*, c*) from the tested cell-engine. */
export function reciprocalBasis(cell: UnitCell): Mat3 {
  return reciprocalMatrix(cell);
}

export function reciprocalLatticeParameters(cell: UnitCell): ReciprocalLatticeParameters {
  const [aStar, bStar, cStar] = reciprocalMatrix(cell);
  return {
    aStar: norm(aStar),
    bStar: norm(bStar),
    cStar: norm(cStar),
    alphaStar: angleDeg(bStar, cStar),
    betaStar: angleDeg(aStar, cStar),
    gammaStar: angleDeg(aStar, bStar),
  };
}

/** Cartesian reciprocal-space vector for Miller index (h k l): h·a* + k·b* + l·c*. */
export function millerToCartesian(cell: UnitCell, hkl: MillerIndex): Vec3 {
  assertMiller(hkl);
  const [aStar, bStar, cStar] = reciprocalMatrix(cell);
  return [
    hkl[0] * aStar[0] + hkl[1] * bStar[0] + hkl[2] * cStar[0],
    hkl[0] * aStar[1] + hkl[1] * bStar[1] + hkl[2] * cStar[1],
    hkl[0] * aStar[2] + hkl[1] * bStar[2] + hkl[2] * cStar[2],
  ];
}

/** Unit-length cartesian normal of the (h k l) lattice plane. */
export function planeNormal(cell: UnitCell, hkl: MillerIndex): Vec3 {
  const g = millerToCartesian(cell, hkl);
  const length = norm(g);
  if (!Number.isFinite(length) || length <= EPSILON) throw new RangeError('Reciprocal vector is degenerate.');
  return scale(g, 1 / length);
}

/** d-spacing (Å) of the (h k l) lattice planes: 1 / |G_hkl|. */
export function dSpacing(cell: UnitCell, hkl: MillerIndex): number {
  const g = millerToCartesian(cell, hkl);
  const length = norm(g);
  if (!Number.isFinite(length) || length <= EPSILON) throw new RangeError('Reciprocal vector is degenerate.');
  return 1 / length;
}

export { cellToMatrix };
