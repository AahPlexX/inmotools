import { reciprocalMatrix } from './cell-engine';
import type { UnitCell, Vec3 } from './crystal-types';

const EPSILON = 1e-9;

export interface BrillouinZone {
  readonly vertices: readonly Vec3[];
  /** Faces as ordered rings of vertex indices, one per active bisector plane. */
  readonly faces: readonly (readonly number[])[];
  /** Polyhedron volume in Å⁻³. */
  readonly volume: number;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

interface Plane {
  readonly normal: Vec3;
  readonly offset: number;
}

/** Solve n·x = offset for three planes; null when the triple is degenerate. */
function intersectThree(p1: Plane, p2: Plane, p3: Plane): Vec3 | null {
  const [n1, n2, n3] = [p1.normal, p2.normal, p3.normal];
  const det = dot(n1, cross(n2, n3));
  if (Math.abs(det) <= EPSILON) return null;
  const c1 = cross(n2, n3);
  const c2 = cross(n3, n1);
  const c3 = cross(n1, n2);
  return [
    (p1.offset * c1[0] + p2.offset * c2[0] + p3.offset * c3[0]) / det,
    (p1.offset * c1[1] + p2.offset * c2[1] + p3.offset * c3[1]) / det,
    (p1.offset * c1[2] + p2.offset * c2[2] + p3.offset * c3[2]) / det,
  ];
}

/**
 * First Brillouin zone of the reciprocal lattice: the Wigner–Seitz cell around
 * the origin, i.e. the intersection of half-spaces  G·k <= |G|²/2  for the 26
 * nearest reciprocal-lattice vectors G = h·a* + k·b* + l·c*, (h,k,l) in
 * {-1,0,1}³ \ {0}. Vertices are found by triple-plane intersection; faces are
 * vertex rings lying on each active bisector plane. Bounded by construction
 * (26 planes, at most C(26,3) candidate vertices).
 */
export function firstBrillouinZone(cell: UnitCell): BrillouinZone {
  const [aStar, bStar, cStar] = reciprocalMatrix(cell);
  const planes: Plane[] = [];
  for (const h of [-1, 0, 1]) {
    for (const k of [-1, 0, 1]) {
      for (const l of [-1, 0, 1]) {
        if (h === 0 && k === 0 && l === 0) continue;
        const g: Vec3 = [
          h * aStar[0] + k * bStar[0] + l * cStar[0],
          h * aStar[1] + k * bStar[1] + l * cStar[1],
          h * aStar[2] + k * bStar[2] + l * cStar[2],
        ];
        planes.push({ normal: g, offset: dot(g, g) / 2 });
      }
    }
  }

  const satisfiesAll = (point: Vec3, tolerance: number): boolean =>
    planes.every((plane) => dot(plane.normal, point) <= plane.offset + tolerance);

  const vertices: Vec3[] = [];
  const vertexKey = (p: Vec3): string => p.map((v) => v.toFixed(7)).join(',');
  const seen = new Set<string>();
  for (let i = 0; i < planes.length; i += 1) {
    for (let j = i + 1; j < planes.length; j += 1) {
      for (let k = j + 1; k < planes.length; k += 1) {
        const point = intersectThree(planes[i]!, planes[j]!, planes[k]!);
        if (!point || !point.every(Number.isFinite)) continue;
        if (!satisfiesAll(point, 1e-7)) continue;
        const key = vertexKey(point);
        if (seen.has(key)) continue;
        seen.add(key);
        vertices.push(point);
      }
    }
  }
  if (vertices.length < 4) throw new RangeError('Brillouin-zone construction degenerated; the reciprocal basis may be singular.');

  const tolerance = 1e-6;
  const faces: number[][] = [];
  for (const plane of planes) {
    const onPlane: number[] = [];
    for (let index = 0; index < vertices.length; index += 1) {
      if (Math.abs(dot(plane.normal, vertices[index]!) - plane.offset) <= tolerance) onPlane.push(index);
    }
    if (onPlane.length < 3) continue;
    // Order the ring around the plane normal using a stable in-plane basis.
    const normalLength = norm(plane.normal);
    const unit: Vec3 = [plane.normal[0] / normalLength, plane.normal[1] / normalLength, plane.normal[2] / normalLength];
    const reference: Vec3 = Math.abs(unit[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = cross(unit, reference);
    const uLength = norm(u);
    const uUnit: Vec3 = [u[0] / uLength, u[1] / uLength, u[2] / uLength];
    const vUnit = cross(unit, uUnit);
    const cx = onPlane.reduce((sum, index) => sum + vertices[index]![0], 0) / onPlane.length;
    const cy = onPlane.reduce((sum, index) => sum + vertices[index]![1], 0) / onPlane.length;
    const cz = onPlane.reduce((sum, index) => sum + vertices[index]![2], 0) / onPlane.length;
    const centroid: Vec3 = [cx, cy, cz];
    onPlane.sort((left, right) => {
      const dl = subtract(vertices[left]!, centroid);
      const dr = subtract(vertices[right]!, centroid);
      return Math.atan2(dot(dl, vUnit), dot(dl, uUnit)) - Math.atan2(dot(dr, vUnit), dot(dr, uUnit));
    });
    faces.push(onPlane);
  }
  if (faces.length === 0) throw new RangeError('Brillouin-zone construction found no bounding faces.');

  // Volume by divergence theorem over face fans from each face's first vertex.
  let volume = 0;
  for (const face of faces) {
    const v0 = vertices[face[0]!]!;
    for (let i = 1; i + 1 < face.length; i += 1) {
      const v1 = vertices[face[i]!]!;
      const v2 = vertices[face[i + 1]!]!;
      volume += dot(v0, cross(v1, v2)) / 6;
    }
  }
  volume = Math.abs(volume);
  if (!Number.isFinite(volume) || volume <= 0) throw new RangeError('Brillouin-zone volume is degenerate.');

  return { vertices, faces, volume };
}
