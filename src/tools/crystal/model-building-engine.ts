import { cellToMatrix, fractionalToCartesian, reciprocalMatrix, validateCell } from './cell-engine';
import { addCrystalSite, deleteCrystalSite, updateCrystalSite } from './document-engine';
import { findPeriodicBondsWithDiagnostics } from './periodic-engine';
import type { CrystalDocument, CrystalSite, Mat3, UnitCell, Vec3 } from './crystal-types';

const EPSILON = 1e-10;
const UNIMODULAR_TOLERANCE = 1e-8;
const MAX_MODEL_SITES = 50_000;
const MAX_SLAB_CANDIDATES = 2_000_000;

type IntVec3 = readonly [number, number, number];

function assertFiniteMatrix(matrix: Mat3, label: string): void {
  if (!matrix.every((row) => row.every(Number.isFinite))) {
    throw new RangeError(`${label} matrix must contain only finite numbers.`);
  }
}

function determinant(matrix: Mat3): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

function inverse(matrix: Mat3): Mat3 {
  const det = determinant(matrix);
  if (!Number.isFinite(det) || Math.abs(det) <= EPSILON) {
    throw new RangeError('Basis transformation matrix is singular and has no inverse.');
  }
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  const scale = 1 / det;
  return [
    [(e * i - f * h) * scale, (c * h - b * i) * scale, (b * f - c * e) * scale],
    [(f * g - d * i) * scale, (a * i - c * g) * scale, (c * d - a * f) * scale],
    [(d * h - e * g) * scale, (b * g - a * h) * scale, (a * e - b * d) * scale],
  ];
}

function matrixMultiply(left: Mat3, right: Mat3): Mat3 {
  return left.map((row) => [
    row[0] * right[0][0] + row[1] * right[1][0] + row[2] * right[2][0],
    row[0] * right[0][1] + row[1] * right[1][1] + row[2] * right[2][1],
    row[0] * right[0][2] + row[1] * right[1][2] + row[2] * right[2][2],
  ] as Vec3) as unknown as Mat3;
}

function rowVectorMultiply(vector: Vec3, matrix: Mat3): Vec3 {
  return [
    vector[0] * matrix[0][0] + vector[1] * matrix[1][0] + vector[2] * matrix[2][0],
    vector[0] * matrix[0][1] + vector[1] * matrix[1][1] + vector[2] * matrix[2][1],
    vector[0] * matrix[0][2] + vector[1] * matrix[1][2] + vector[2] * matrix[2][2],
  ];
}

function columnTransform(matrix: Mat3, vector: Vec3): Vec3 {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function length(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function addVectors(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractVectors(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVector(vector: Vec3, scale: number): Vec3 {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function angleDegrees(a: Vec3, b: Vec3): number {
  const denominator = length(a) * length(b);
  if (!Number.isFinite(denominator) || denominator <= EPSILON) {
    throw new RangeError('Transformed basis contains a zero-length vector.');
  }
  const cosine = Math.min(1, Math.max(-1, dot(a, b) / denominator));
  return Math.acos(cosine) * 180 / Math.PI;
}

function matrixToCell(matrix: Mat3): UnitCell {
  assertFiniteMatrix(matrix, 'Lattice');
  const [a, b, c] = matrix;
  const cell: UnitCell = {
    a: length(a),
    b: length(b),
    c: length(c),
    alpha: angleDegrees(b, c),
    beta: angleDegrees(a, c),
    gamma: angleDegrees(a, b),
  };
  const validation = validateCell(cell);
  if (!validation.ok) throw new RangeError(validation.error);
  return cell;
}

function wrap(value: number): number {
  const result = value - Math.floor(value);
  return Math.abs(result - 1) <= Number.EPSILON || Object.is(result, -0) ? 0 : result;
}

function wrapVec(vector: Vec3): Vec3 {
  return [wrap(vector[0]), wrap(vector[1]), wrap(vector[2])];
}

function describeMatrix(matrix: Mat3): string {
  return matrix.map((row) => `[${row.map((value) => Number(value.toFixed(8))).join(', ')}]`).join(' ');
}

function gcdPair(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}

function reduceIntegerVector(vector: IntVec3): IntVec3 {
  const divisor = gcdPair(gcdPair(vector[0], vector[1]), vector[2]) || 1;
  return [vector[0] / divisor, vector[1] / divisor, vector[2] / divisor];
}

function integerSurfaceBasis(hkl: IntVec3): readonly [IntVec3, IntVec3] {
  const [h, k, l] = hkl;
  let first: IntVec3;
  if (h !== 0 || k !== 0) {
    const divisor = gcdPair(h, k) || 1;
    first = [k / divisor, -h / divisor, 0];
  } else {
    first = [1, 0, 0];
  }
  const second = reduceIntegerVector([
    k * first[2] - l * first[1],
    l * first[0] - h * first[2],
    h * first[1] - k * first[0],
  ]);
  return [first, second];
}

function latticeCombination(coefficients: IntVec3, basis: Mat3): Vec3 {
  return [
    coefficients[0] * basis[0][0] + coefficients[1] * basis[1][0] + coefficients[2] * basis[2][0],
    coefficients[0] * basis[0][1] + coefficients[1] * basis[1][1] + coefficients[2] * basis[2][1],
    coefficients[0] * basis[0][2] + coefficients[1] * basis[1][2] + coefficients[2] * basis[2][2],
  ];
}

function normalizeNearBoundary(value: number): number {
  if (Math.abs(value) <= 1e-9) return 0;
  if (Math.abs(value - 1) <= 1e-9) return 0;
  return value;
}

function fractionalKey(siteId: string, fractional: Vec3): string {
  const rounded = fractional.map((value) => Math.round(value * 1e9));
  return `${siteId}|${rounded.join('|')}`;
}

export function transformBasis(document: CrystalDocument, matrix: Mat3, originShift: Vec3 = [0, 0, 0]): CrystalDocument {
  assertFiniteMatrix(matrix, 'Basis transformation');
  if (!originShift.every(Number.isFinite)) throw new RangeError('Origin shift must contain only finite numbers.');
  const det = determinant(matrix);
  if (!Number.isFinite(det) || Math.abs(det) <= EPSILON) {
    throw new RangeError('Basis transformation matrix is singular.');
  }
  if (Math.abs(Math.abs(det) - 1) > UNIMODULAR_TOLERANCE) {
    throw new RangeError('Basis transformation must be unimodular (|determinant| = 1); use the supercell workflow for multiplicity-changing transforms.');
  }

  const oldBasis = cellToMatrix(document.cell);
  const newBasis = matrixMultiply(matrix, oldBasis);
  const newCell = matrixToCell(newBasis);
  const inverseMatrix = inverse(matrix);
  const sites = document.sites.map((site) => {
    const rebased = rowVectorMultiply(site.fractional, inverseMatrix);
    return {
      ...site,
      fractional: wrapVec([
        rebased[0] - originShift[0],
        rebased[1] - originShift[1],
        rebased[2] - originShift[2],
      ]),
    };
  });

  return {
    ...document,
    cell: newCell,
    sites,
    provenance: [
      ...document.provenance,
      {
        kind: 'basis-transform',
        label: 'Applied basis and origin transform',
        detail: `Basis ${describeMatrix(matrix)}; origin [${originShift.join(', ')}]`,
      },
    ],
  };
}

export function applyStrain(document: CrystalDocument, strain: Mat3): CrystalDocument {
  assertFiniteMatrix(strain, 'Strain');
  const deformation: Mat3 = [
    [1 + strain[0][0], strain[0][1], strain[0][2]],
    [strain[1][0], 1 + strain[1][1], strain[1][2]],
    [strain[2][0], strain[2][1], 1 + strain[2][2]],
  ];
  const det = determinant(deformation);
  if (!Number.isFinite(det) || Math.abs(det) <= EPSILON) {
    throw new RangeError('Strain produces a singular deformation and cannot define a three-dimensional cell.');
  }

  const oldBasis = cellToMatrix(document.cell);
  const deformedBasis = oldBasis.map((basisVector) => columnTransform(deformation, basisVector)) as unknown as Mat3;
  const newCell = matrixToCell(deformedBasis);
  return {
    ...document,
    cell: newCell,
    sites: document.sites.map((site) => ({ ...site, fractional: [...site.fractional] as Vec3 })),
    provenance: [
      ...document.provenance,
      { kind: 'strain', label: 'Applied homogeneous strain', detail: describeMatrix(strain) },
    ],
  };
}

export function createVacancy(document: CrystalDocument, siteId: string): CrystalDocument {
  const source = document.sites.find((site) => site.id === siteId);
  if (!source) throw new RangeError(`Site not found: ${siteId}`);
  const edited = deleteCrystalSite(document, siteId);
  return {
    ...edited,
    provenance: [
      ...edited.provenance,
      { kind: 'vacancy', label: `Created vacancy at ${source.label}`, detail: source.id },
    ],
  };
}

export function createSubstitution(document: CrystalDocument, siteId: string, element: string): CrystalDocument {
  if (!element.trim()) throw new RangeError('Substitution element cannot be empty.');
  const source = document.sites.find((site) => site.id === siteId);
  if (!source) throw new RangeError(`Site not found: ${siteId}`);
  const edited = updateCrystalSite(document, siteId, { element: element.trim() });
  return {
    ...edited,
    provenance: [
      ...edited.provenance,
      { kind: 'substitution', label: `Substituted ${source.label}: ${source.element} → ${element.trim()}`, detail: source.id },
    ],
  };
}

export function createInterstitial(document: CrystalDocument, site: Omit<CrystalSite, 'id'>): CrystalDocument {
  const edited = addCrystalSite(document, site);
  const added = edited.sites.at(-1)!;
  return {
    ...edited,
    provenance: [
      ...edited.provenance,
      { kind: 'interstitial', label: `Added interstitial ${added.label}`, detail: added.id },
    ],
  };
}

export function defectConcentration(before: CrystalDocument, after: CrystalDocument): number {
  if (before.sites.length === 0) {
    if (after.sites.length === 0) return 0;
    throw new RangeError('Defect concentration requires at least one reference site.');
  }
  const beforeById = new Map(before.sites.map((site) => [site.id, site]));
  const afterById = new Map(after.sites.map((site) => [site.id, site]));
  let defects = 0;

  for (const [id, site] of beforeById) {
    const candidate = afterById.get(id);
    if (!candidate) {
      defects += 1;
      continue;
    }
    if (candidate.element !== site.element || candidate.isotope !== site.isotope || candidate.occupancy !== site.occupancy) {
      defects += 1;
    }
  }
  for (const id of afterById.keys()) {
    if (!beforeById.has(id)) defects += 1;
  }
  return defects / before.sites.length;
}

export function compareMappedStructures(a: CrystalDocument, b: CrystalDocument): {
  cellDelta: UnitCell;
  siteDeltas: readonly { aSiteId: string; bSiteId: string; cartesianDelta: Vec3; distance: number }[];
} {
  const aIds = a.sites.map((site) => site.id);
  const bIds = b.sites.map((site) => site.id);
  if (new Set(aIds).size !== aIds.length || new Set(bIds).size !== bIds.length) {
    throw new RangeError('Structure mapping requires unique stable site IDs.');
  }
  const aSet = new Set(aIds);
  const bSet = new Set(bIds);
  if (aSet.size !== bSet.size || [...aSet].some((id) => !bSet.has(id))) {
    throw new RangeError('Structure mapping requires the same stable site IDs in both structures.');
  }

  const bById = new Map(b.sites.map((site) => [site.id, site]));
  const siteDeltas = a.sites.map((aSite) => {
    const bSite = bById.get(aSite.id)!;
    const aCartesian = fractionalToCartesian(aSite.fractional, a.cell);
    const bCartesian = fractionalToCartesian(bSite.fractional, b.cell);
    const cartesianDelta: Vec3 = [
      bCartesian[0] - aCartesian[0],
      bCartesian[1] - aCartesian[1],
      bCartesian[2] - aCartesian[2],
    ];
    return {
      aSiteId: aSite.id,
      bSiteId: bSite.id,
      cartesianDelta,
      distance: length(cartesianDelta),
    };
  });

  return {
    cellDelta: {
      a: b.cell.a - a.cell.a,
      b: b.cell.b - a.cell.b,
      c: b.cell.c - a.cell.c,
      alpha: b.cell.alpha - a.cell.alpha,
      beta: b.cell.beta - a.cell.beta,
      gamma: b.cell.gamma - a.cell.gamma,
    },
    siteDeltas,
  };
}

export function reconstructPeriodicMolecule(
  document: CrystalDocument,
  seedSiteId: string,
): readonly { siteId: string; image: IntVec3; fractional: Vec3 }[] {
  const seed = document.sites.find((site) => site.id === seedSiteId);
  if (!seed) throw new RangeError(`Site not found: ${seedSiteId}`);

  const adjacency = new Map<string, { siteId: string; shift: IntVec3 }[]>();
  for (const site of document.sites) adjacency.set(site.id, []);
  for (const bond of findPeriodicBondsWithDiagnostics(document).bonds) {
    adjacency.get(bond.aSiteId)?.push({ siteId: bond.bSiteId, shift: bond.imageShift });
    adjacency.get(bond.bSiteId)?.push({
      siteId: bond.aSiteId,
      shift: [-bond.imageShift[0], -bond.imageShift[1], -bond.imageShift[2]],
    });
  }
  const compareEdge = (a: { siteId: string; shift: IntVec3 }, b: { siteId: string; shift: IntVec3 }): number =>
    a.siteId.localeCompare(b.siteId)
      || a.shift[0] - b.shift[0]
      || a.shift[1] - b.shift[1]
      || a.shift[2] - b.shift[2];
  for (const edges of adjacency.values()) edges.sort(compareEdge);

  const siteById = new Map(document.sites.map((site) => [site.id, site]));
  const assigned = new Map<string, IntVec3>([[seedSiteId, [0, 0, 0]]]);
  const queue = [seedSiteId];
  const output: { siteId: string; image: IntVec3; fractional: Vec3 }[] = [];

  while (queue.length > 0) {
    const siteId = queue.shift()!;
    const site = siteById.get(siteId)!;
    const image = assigned.get(siteId)!;
    output.push({
      siteId,
      image,
      fractional: [
        site.fractional[0] + image[0],
        site.fractional[1] + image[1],
        site.fractional[2] + image[2],
      ],
    });
    for (const edge of adjacency.get(siteId) ?? []) {
      if (assigned.has(edge.siteId)) continue;
      assigned.set(edge.siteId, [
        image[0] + edge.shift[0],
        image[1] + edge.shift[1],
        image[2] + edge.shift[2],
      ]);
      queue.push(edge.siteId);
    }
  }
  return output;
}

export function createDomainOverlay(
  document: CrystalDocument,
  transform: Mat3,
): readonly { siteId: string; position: Vec3 }[] {
  assertFiniteMatrix(transform, 'Domain transformation');
  const det = determinant(transform);
  if (!Number.isFinite(det) || Math.abs(det) <= EPSILON) {
    throw new RangeError('Domain transformation matrix is singular.');
  }
  return document.sites.map((site) => ({
    siteId: site.id,
    position: columnTransform(transform, fractionalToCartesian(site.fractional, document.cell)),
  }));
}

export function buildSlab(
  document: CrystalDocument,
  options: { hkl: IntVec3; thickness: number; vacuum: number; offset: number },
): CrystalDocument {
  const [h, k, l] = options.hkl;
  if (![h, k, l].every(Number.isInteger) || (h === 0 && k === 0 && l === 0)) {
    throw new RangeError('Slab Miller indices (h,k,l) must be integers and cannot all be zero.');
  }
  if (!Number.isFinite(options.thickness) || options.thickness <= 0) {
    throw new RangeError('Slab thickness must be a positive finite distance in ångström.');
  }
  if (!Number.isFinite(options.vacuum) || options.vacuum < 0) {
    throw new RangeError('Slab vacuum must be a non-negative finite distance in ångström.');
  }
  if (!Number.isFinite(options.offset)) throw new RangeError('Slab offset must be a finite number.');

  const reciprocal = reciprocalMatrix(document.cell);
  const planeNormal: Vec3 = [
    h * reciprocal[0][0] + k * reciprocal[1][0] + l * reciprocal[2][0],
    h * reciprocal[0][1] + k * reciprocal[1][1] + l * reciprocal[2][1],
    h * reciprocal[0][2] + k * reciprocal[1][2] + l * reciprocal[2][2],
  ];
  const normalLength = length(planeNormal);
  if (!Number.isFinite(normalLength) || normalLength <= EPSILON) {
    throw new RangeError('Slab Miller indices do not define a valid reciprocal-plane normal.');
  }
  const normal = scaleVector(planeNormal, 1 / normalLength);
  const planeSpacing = 1 / normalLength;
  const totalNormalLength = options.thickness + options.vacuum;

  const [surfaceFirst, surfaceSecond] = integerSurfaceBasis(options.hkl);
  const directBasis = cellToMatrix(document.cell);
  const aSurface = latticeCombination(surfaceFirst, directBasis);
  let bSurface = latticeCombination(surfaceSecond, directBasis);
  const cSurface = scaleVector(normal, totalNormalLength);
  let slabBasis: Mat3 = [aSurface, bSurface, cSurface];
  if (determinant(slabBasis) < 0) {
    bSurface = scaleVector(bSurface, -1);
    slabBasis = [aSurface, bSurface, cSurface];
  }
  const slabCell = matrixToCell(slabBasis);
  const inverseSlab = inverse(slabBasis);
  const origin = scaleVector(normal, options.offset * planeSpacing);

  const minCellLength = Math.min(document.cell.a, document.cell.b, document.cell.c);
  const maxSurfaceCoefficient = Math.max(
    ...surfaceFirst.map(Math.abs),
    ...surfaceSecond.map(Math.abs),
  );
  const searchBound = Math.max(2, Math.ceil(options.thickness / minCellLength) + maxSurfaceCoefficient + Math.ceil(Math.abs(options.offset)) + 3);
  const side = searchBound * 2 + 1;
  const candidateCount = document.sites.length * side * side * side;
  if (!Number.isSafeInteger(candidateCount) || candidateCount > MAX_SLAB_CANDIDATES) {
    throw new RangeError(`Slab request would inspect ${candidateCount.toLocaleString()} site images; reduce the thickness or Miller-index complexity.`);
  }

  const sites: CrystalSite[] = [];
  const seen = new Set<string>();
  const tolerance = 1e-9;
  for (let i = -searchBound; i <= searchBound; i += 1) {
    for (let j = -searchBound; j <= searchBound; j += 1) {
      for (let q = -searchBound; q <= searchBound; q += 1) {
        for (const site of document.sites) {
          const imageFractional: Vec3 = [
            site.fractional[0] + i,
            site.fractional[1] + j,
            site.fractional[2] + q,
          ];
          const cartesian = fractionalToCartesian(imageFractional, document.cell);
          const slabFractionalRaw = rowVectorMultiply(subtractVectors(cartesian, origin), inverseSlab);
          let x = normalizeNearBoundary(slabFractionalRaw[0]);
          let y = normalizeNearBoundary(slabFractionalRaw[1]);
          const z = slabFractionalRaw[2];
          if (x < -tolerance || x >= 1 - tolerance || y < -tolerance || y >= 1 - tolerance) continue;
          if (z < -tolerance || z * totalNormalLength >= options.thickness - tolerance) continue;
          x = wrap(x);
          y = wrap(y);
          const fractional: Vec3 = [x, y, Math.max(0, z)];
          const key = fractionalKey(site.id, fractional);
          if (seen.has(key)) continue;
          seen.add(key);
          if (sites.length >= MAX_MODEL_SITES) {
            throw new RangeError(`Slab would exceed the ${MAX_MODEL_SITES.toLocaleString()}-site model limit.`);
          }
          sites.push({
            ...site,
            id: `${site.id}@slab-${sites.length + 1}`,
            fractional,
          });
        }
      }
    }
  }
  if (sites.length === 0) throw new RangeError('The requested slab contains no sites; adjust the thickness or offset.');

  return {
    ...document,
    id: `${document.id}-slab-${h}-${k}-${l}`,
    name: `${document.name} — (${h} ${k} ${l}) slab`,
    cell: slabCell,
    sites,
    provenance: [
      ...document.provenance,
      {
        kind: 'slab',
        label: `Built (${h} ${k} ${l}) slab`,
        detail: `Material ${options.thickness} Å; vacuum ${options.vacuum} Å; offset ${options.offset} × d(hkl)`,
      },
    ],
  };
}
