import { dSpacing, planeNormal, type MillerIndex } from './reciprocal-engine';
import type { Mat3, UnitCell, Vec3 } from './crystal-types';

const EPSILON = 1e-9;

export interface MorphologyFacetSpec {
  readonly hkl: MillerIndex;
  readonly included?: boolean;
  /** Optional positive multiplier applied to the method-specific plane distance. */
  readonly weight?: number;
  /** Surface energy used by Wulff construction, in caller-selected consistent units. */
  readonly energy?: number;
}

export interface MorphologyFace {
  readonly hkl: MillerIndex;
  readonly normal: Vec3;
  readonly dSpacing: number;
  readonly weighting: number;
  readonly suppliedEnergy?: number;
  readonly area: number;
  readonly relativeArea: number;
  readonly vertexIndices: readonly number[];
}

export interface MorphologyModel {
  readonly method: 'bfdh' | 'wulff';
  readonly vertices: readonly Vec3[];
  readonly faces: readonly MorphologyFace[];
  readonly assumptions: string;
}

interface HalfSpace {
  readonly hkl: MillerIndex;
  readonly normal: Vec3;
  readonly distance: number;
  readonly d: number;
  readonly weighting: number;
  readonly suppliedEnergy?: number;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const scale = (v: Vec3, factor: number): Vec3 => [v[0] * factor, v[1] * factor, v[2] * factor];

function normalize(v: Vec3): Vec3 {
  const length = norm(v);
  if (!Number.isFinite(length) || length <= EPSILON) throw new RangeError('Morphology plane normal is degenerate.');
  return scale(v, 1 / length);
}

function validateFacet(spec: MorphologyFacetSpec, index: number): void {
  if (!spec.hkl.every(Number.isInteger) || spec.hkl.every((value) => value === 0)) {
    throw new RangeError(`Morphology facet ${index + 1} must use a non-zero integer Miller index.`);
  }
  if (spec.weight !== undefined && (!Number.isFinite(spec.weight) || spec.weight <= 0)) {
    throw new RangeError(`Morphology facet ${index + 1} weight must be a positive finite number.`);
  }
}

function intersectThree(a: HalfSpace, b: HalfSpace, c: HalfSpace): Vec3 | null {
  const determinant = dot(a.normal, cross(b.normal, c.normal));
  if (Math.abs(determinant) <= EPSILON) return null;
  const bc = cross(b.normal, c.normal);
  const ca = cross(c.normal, a.normal);
  const ab = cross(a.normal, b.normal);
  return [
    (a.distance * bc[0] + b.distance * ca[0] + c.distance * ab[0]) / determinant,
    (a.distance * bc[1] + b.distance * ca[1] + c.distance * ab[1]) / determinant,
    (a.distance * bc[2] + b.distance * ca[2] + c.distance * ab[2]) / determinant,
  ];
}

function polygonArea(vertices: readonly Vec3[], ring: readonly number[]): number {
  if (ring.length < 3) return 0;
  const origin = vertices[ring[0]!]!;
  let area = 0;
  for (let index = 1; index + 1 < ring.length; index += 1) {
    const a = subtract(vertices[ring[index]!]!, origin);
    const b = subtract(vertices[ring[index + 1]!]!, origin);
    area += norm(cross(a, b)) / 2;
  }
  return area;
}

function orderFace(vertices: readonly Vec3[], indexes: readonly number[], normal: Vec3): number[] {
  const centroid: Vec3 = [
    indexes.reduce((sum, index) => sum + vertices[index]![0], 0) / indexes.length,
    indexes.reduce((sum, index) => sum + vertices[index]![1], 0) / indexes.length,
    indexes.reduce((sum, index) => sum + vertices[index]![2], 0) / indexes.length,
  ];
  const reference: Vec3 = Math.abs(normal[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(normal, reference));
  const v = cross(normal, u);
  return [...indexes].sort((left, right) => {
    const dl = subtract(vertices[left]!, centroid);
    const dr = subtract(vertices[right]!, centroid);
    return Math.atan2(dot(dl, v), dot(dl, u)) - Math.atan2(dot(dr, v), dot(dr, u));
  });
}

function buildFromHalfSpaces(
  method: MorphologyModel['method'],
  halfSpaces: readonly HalfSpace[],
  assumptions: string,
): MorphologyModel {
  if (halfSpaces.length < 4) {
    throw new RangeError('Morphology needs enough included facet orientations to bound a three-dimensional solid.');
  }

  const vertices: Vec3[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < halfSpaces.length; i += 1) {
    for (let j = i + 1; j < halfSpaces.length; j += 1) {
      for (let k = j + 1; k < halfSpaces.length; k += 1) {
        const point = intersectThree(halfSpaces[i]!, halfSpaces[j]!, halfSpaces[k]!);
        if (!point || !point.every(Number.isFinite)) continue;
        if (!halfSpaces.every((plane) => dot(plane.normal, point) <= plane.distance + 1e-7)) continue;
        const key = point.map((value) => value.toFixed(8)).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        vertices.push(point);
      }
    }
  }
  if (vertices.length < 4) {
    throw new RangeError('Included morphology facets do not form a bounded three-dimensional polyhedron.');
  }

  const draftFaces: Omit<MorphologyFace, 'relativeArea'>[] = [];
  for (const plane of halfSpaces) {
    const indexes = vertices
      .map((vertex, index) => ({ index, distance: Math.abs(dot(plane.normal, vertex) - plane.distance) }))
      .filter((entry) => entry.distance <= 1e-6)
      .map((entry) => entry.index);
    if (indexes.length < 3) continue;
    const ring = orderFace(vertices, indexes, plane.normal);
    const area = polygonArea(vertices, ring);
    if (!(area > EPSILON)) continue;
    draftFaces.push({
      hkl: plane.hkl,
      normal: plane.normal,
      dSpacing: plane.d,
      weighting: plane.weighting,
      ...(plane.suppliedEnergy === undefined ? {} : { suppliedEnergy: plane.suppliedEnergy }),
      area,
      vertexIndices: ring,
    });
  }
  if (draftFaces.length < 4) {
    throw new RangeError('Morphology construction produced too few active faces to define a solid.');
  }
  const totalArea = draftFaces.reduce((sum, face) => sum + face.area, 0);
  const faces: MorphologyFace[] = draftFaces.map((face) => ({
    ...face,
    relativeArea: face.area / totalArea,
  }));

  return { method, vertices, faces, assumptions };
}

function symmetricHalfSpaces(
  cell: UnitCell,
  specs: readonly MorphologyFacetSpec[],
  distanceFor: (spec: MorphologyFacetSpec, d: number, index: number) => {
    rawDistance: number;
    weighting: number;
    suppliedEnergy?: number;
  },
): HalfSpace[] {
  const included = specs
    .map((spec, index) => ({ spec, index }))
    .filter(({ spec }) => spec.included !== false);
  if (included.length === 0) throw new RangeError('At least one morphology facet must be included.');

  const raw = included.map(({ spec, index }) => {
    validateFacet(spec, index);
    const d = dSpacing(cell, spec.hkl);
    const detail = distanceFor(spec, d, index);
    if (!Number.isFinite(detail.rawDistance) || detail.rawDistance <= 0) {
      throw new RangeError(`Morphology facet ${index + 1} produced an invalid plane distance.`);
    }
    return { spec, d, ...detail };
  });
  const minimum = Math.min(...raw.map((entry) => entry.rawDistance));
  const planes: HalfSpace[] = [];
  for (const entry of raw) {
    const normal = normalize(planeNormal(cell, entry.spec.hkl));
    const distance = entry.rawDistance / minimum;
    const positive: HalfSpace = {
      hkl: entry.spec.hkl,
      normal,
      distance,
      d: entry.d,
      weighting: entry.weighting,
      ...(entry.suppliedEnergy === undefined ? {} : { suppliedEnergy: entry.suppliedEnergy }),
    };
    planes.push(positive, {
      ...positive,
      hkl: [-entry.spec.hkl[0], -entry.spec.hkl[1], -entry.spec.hkl[2]],
      normal: scale(normal, -1),
    });
  }
  return planes;
}

/**
 * Bravais–Friedel–Donnay–Harker-style geometry. The adopted growth-rate proxy
 * is proportional to 1/d(hkl); optional user weighting multiplies that proxy.
 * It is a morphology heuristic, not a surface-energy calculation.
 */
export function buildBfdhMorphology(
  cell: UnitCell,
  facets: readonly MorphologyFacetSpec[],
): MorphologyModel {
  const planes = symmetricHalfSpaces(cell, facets, (spec, d) => {
    const multiplier = spec.weight ?? 1;
    return { rawDistance: multiplier / d, weighting: multiplier / d };
  });
  return buildFromHalfSpaces(
    'bfdh',
    planes,
    'BFDH-style face distances use a growth-rate proxy proportional to 1/d(hkl), with optional positive user multipliers.',
  );
}

/**
 * Equilibrium Wulff construction. Plane distance is proportional to the
 * supplied positive surface energy (times an optional user multiplier).
 */
export function buildWulffMorphology(
  cell: UnitCell,
  facets: readonly MorphologyFacetSpec[],
): MorphologyModel {
  const planes = symmetricHalfSpaces(cell, facets, (spec, _d, index) => {
    if (spec.energy === undefined || !Number.isFinite(spec.energy) || spec.energy <= 0) {
      throw new RangeError(`Wulff facet ${index + 1} requires a positive finite surface energy.`);
    }
    const multiplier = spec.weight ?? 1;
    return {
      rawDistance: spec.energy * multiplier,
      weighting: multiplier,
      suppliedEnergy: spec.energy,
    };
  });
  return buildFromHalfSpaces(
    'wulff',
    planes,
    'Wulff plane distances are proportional to the supplied surface energies; all energies must use one consistent unit system.',
  );
}

function determinant3(matrix: Mat3): number {
  return matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1])
    - matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0])
    + matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]);
}

function transformPoint(matrix: Mat3, point: Vec3): Vec3 {
  return [
    matrix[0][0] * point[0] + matrix[0][1] * point[1] + matrix[0][2] * point[2],
    matrix[1][0] * point[0] + matrix[1][1] * point[1] + matrix[1][2] * point[2],
    matrix[2][0] * point[0] + matrix[2][1] * point[1] + matrix[2][2] * point[2],
  ];
}

function transformedFaceNormal(vertices: readonly Vec3[], ring: readonly number[], fallback: Vec3): Vec3 {
  if (ring.length < 3) return fallback;
  const a = subtract(vertices[ring[1]!]!, vertices[ring[0]!]!);
  const b = subtract(vertices[ring[2]!]!, vertices[ring[0]!]!);
  const candidate = cross(a, b);
  if (norm(candidate) <= EPSILON) return fallback;
  const normal = normalize(candidate);
  return dot(normal, fallback) < 0 ? scale(normal, -1) : normal;
}

/** Apply a non-singular twin/domain Cartesian transform to a morphology overlay. */
export function transformMorphology(model: MorphologyModel, matrix: Mat3): MorphologyModel {
  if (!matrix.flat().every(Number.isFinite) || Math.abs(determinant3(matrix)) <= EPSILON) {
    throw new RangeError('Morphology twin/domain transform must be a finite non-singular 3×3 matrix.');
  }
  const vertices = model.vertices.map((vertex) => transformPoint(matrix, vertex));
  const draft = model.faces.map((face) => {
    const area = polygonArea(vertices, face.vertexIndices);
    const fallback = normalize(transformPoint(matrix, face.normal));
    return {
      ...face,
      normal: transformedFaceNormal(vertices, face.vertexIndices, fallback),
      area,
    };
  });
  const totalArea = draft.reduce((sum, face) => sum + face.area, 0);
  const faces = draft.map((face) => ({ ...face, relativeArea: face.area / totalArea }));
  return {
    ...model,
    vertices,
    faces,
    assumptions: `${model.assumptions} A supplied twin/domain transform is overlaid geometrically; source facet metadata is retained.`,
  };
}
