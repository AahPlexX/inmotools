import { fractionalToCartesian } from './cell-engine';
import { minimumImageFractionalDelta, periodicDistance } from './periodic-engine';
import type { UnitCell, Vec3 } from './crystal-types';

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (vector: Vec3): number => Math.hypot(vector[0], vector[1], vector[2]);
const scale = (vector: Vec3, factor: number): Vec3 => [vector[0] * factor, vector[1] * factor, vector[2] * factor];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

function vectorBetween(from: Vec3, to: Vec3, cell: UnitCell): Vec3 {
  return fractionalToCartesian(minimumImageFractionalDelta(from, to), cell);
}

export function measureDistance(a: Vec3, b: Vec3, cell: UnitCell): number {
  return periodicDistance(a, b, cell);
}

export function measureAngle(a: Vec3, b: Vec3, c: Vec3, cell: UnitCell): number {
  const ba = vectorBetween(b, a, cell);
  const bc = vectorBetween(b, c, cell);
  const baLength = norm(ba);
  const bcLength = norm(bc);
  if (baLength <= 1e-12 || bcLength <= 1e-12) throw new RangeError('Angle requires three distinct positions.');
  return Math.acos(clamp(dot(ba, bc) / (baLength * bcLength))) * 180 / Math.PI;
}

export function measureDihedral(a: Vec3, b: Vec3, c: Vec3, d: Vec3, cell: UnitCell): number {
  const b0 = scale(vectorBetween(a, b, cell), -1);
  const b1 = vectorBetween(b, c, cell);
  const b2 = vectorBetween(c, d, cell);
  const b1Length = norm(b1);
  if (b1Length <= 1e-12 || norm(b0) <= 1e-12 || norm(b2) <= 1e-12) {
    throw new RangeError('Dihedral requires four positions with nonzero adjacent separations.');
  }
  const b1Unit = scale(b1, 1 / b1Length);
  const v = subtract(b0, scale(b1Unit, dot(b0, b1Unit)));
  const w = subtract(b2, scale(b1Unit, dot(b2, b1Unit)));
  const vLength = norm(v);
  const wLength = norm(w);
  if (vLength <= 1e-12 || wLength <= 1e-12) throw new RangeError('Dihedral is undefined for collinear adjacent vectors.');
  const x = dot(v, w);
  const y = dot(cross(b1Unit, v), w);
  return Math.atan2(y, x) * 180 / Math.PI;
}
