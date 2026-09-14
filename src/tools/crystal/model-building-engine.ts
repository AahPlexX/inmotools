import { cellToMatrix, fractionalToCartesian, validateCell } from './cell-engine';
import { addCrystalSite, deleteCrystalSite, updateCrystalSite } from './document-engine';
import type { CrystalDocument, CrystalSite, Mat3, UnitCell, Vec3 } from './crystal-types';

const EPSILON = 1e-10;
const UNIMODULAR_TOLERANCE = 1e-8;

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
