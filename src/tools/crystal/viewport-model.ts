import { cellToMatrix, fractionalToCartesian } from './cell-engine';
import { getElementReference } from './element-data';
import { coordinationEnvironment } from './local-environment-engine';
import { findPeriodicBondsWithDiagnostics } from './periodic-engine';
import type { CrystalDocument, CrystalSite, Mat3, Vec3 } from './crystal-types';

export type CrystalRepresentation = 'ball-stick' | 'sticks' | 'space-fill' | 'points' | 'wireframe';

export interface RenderClipPlane {
  readonly normal: Vec3;
  readonly offset: number;
}

export interface CrystalRenderOptions {
  readonly representation: CrystalRepresentation;
  readonly selectedSiteIds: ReadonlySet<string>;
  readonly bondTolerance: number;
  readonly maxBonds: number;
  readonly hiddenSiteIds?: ReadonlySet<string>;
  readonly isolatedSiteIds?: ReadonlySet<string>;
  readonly elementFilter?: ReadonlySet<string>;
  readonly polyhedronCenterIds?: ReadonlySet<string>;
  readonly ellipsoidProbability?: number;
  readonly magneticVectors?: readonly RenderVector[];
  readonly clip?: RenderClipPlane | null;
}

export interface RenderAtom {
  readonly siteId: string;
  readonly label: string;
  readonly element: string;
  readonly position: Vec3;
  readonly radius: number;
  readonly color: `#${string}`;
  readonly selected: boolean;
}

export interface RenderBond {
  readonly id: string;
  readonly aSiteId: string;
  readonly bSiteId: string;
  readonly start: Vec3;
  readonly end: Vec3;
  readonly radius: number;
}

export interface RenderPolyhedron {
  readonly centerSiteId: string;
  readonly vertices: readonly Vec3[];
  readonly distortion: number | null;
}

export interface RenderEllipsoid {
  readonly siteId: string;
  readonly axes: Vec3;
  readonly orientation: Mat3;
  readonly probability: number;
}

export interface RenderVector {
  readonly siteId: string;
  readonly start: Vec3;
  readonly end: Vec3;
  readonly label: string;
}

export interface CrystalRenderModel {
  readonly atoms: readonly RenderAtom[];
  readonly bonds: readonly RenderBond[];
  readonly cellEdges: readonly (readonly [Vec3, Vec3])[];
  readonly polyhedra: readonly RenderPolyhedron[];
  readonly ellipsoids: readonly RenderEllipsoid[];
  readonly vectors: readonly RenderVector[];
  readonly diagnostics: readonly string[];
  readonly modelKey: string;
}

export const defaultRenderOptions: CrystalRenderOptions = {
  representation: 'ball-stick',
  selectedSiteIds: new Set<string>(),
  bondTolerance: 1.15,
  maxBonds: 50_000,
  ellipsoidProbability: 0.5,
};

const FALLBACK_COLOR = '#B0B0B0' as const;
const FALLBACK_RADIUS = 0.6;
const MIN_POLYHEDRON_VERTICES = 4;
const MAX_RENDER_VECTORS = 50_000;
const EIGEN_EPSILON = 1e-12;
const ADP_EPSILON = 1e-10;
const ELLIPSOID_SIGMA_SCALES: readonly (readonly [number, number])[] = [
  [0.5, 1.538],
  [0.9, 2.5],
  [0.99, 3.368],
];

function representationRadius(referenceRadius: number, representation: CrystalRepresentation): number {
  switch (representation) {
    case 'space-fill':
      return Math.max(0.18, referenceRadius);
    case 'points':
      return 0.1;
    case 'sticks':
      return Math.max(0.12, Math.min(0.24, referenceRadius * 0.16));
    case 'wireframe':
      return Math.max(0.08, Math.min(0.16, referenceRadius * 0.1));
    case 'ball-stick':
    default:
      return Math.max(0.18, Math.min(0.55, referenceRadius * 0.35));
  }
}

function bondRadius(representation: CrystalRepresentation): number {
  return representation === 'wireframe' ? 0.035 : representation === 'sticks' ? 0.11 : 0.075;
}

function includeBonds(representation: CrystalRepresentation): boolean {
  return representation === 'ball-stick' || representation === 'sticks' || representation === 'wireframe';
}

function buildCellEdges(document: CrystalDocument): readonly (readonly [Vec3, Vec3])[] {
  const [a, b, c] = cellToMatrix(document.cell);
  const origin: Vec3 = [0, 0, 0];
  const ab: Vec3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const ac: Vec3 = [a[0] + c[0], a[1] + c[1], a[2] + c[2]];
  const bc: Vec3 = [b[0] + c[0], b[1] + c[1], b[2] + c[2]];
  const abc: Vec3 = [ab[0] + c[0], ab[1] + c[1], ab[2] + c[2]];

  return [
    [origin, a], [origin, b], [origin, c],
    [a, ab], [a, ac],
    [b, ab], [b, bc],
    [c, ac], [c, bc],
    [ab, abc], [ac, abc], [bc, abc],
  ];
}

function validateOptions(options: CrystalRenderOptions): void {
  if (!Number.isFinite(options.bondTolerance) || options.bondTolerance <= 0) {
    throw new RangeError('Viewport bond tolerance must be a positive finite number.');
  }
  if (!Number.isSafeInteger(options.maxBonds) || options.maxBonds <= 0) {
    throw new RangeError('Viewport bond limit must be a positive integer.');
  }
  if (options.ellipsoidProbability !== undefined
    && (!Number.isFinite(options.ellipsoidProbability) || options.ellipsoidProbability <= 0 || options.ellipsoidProbability >= 1)) {
    throw new RangeError('Viewport ellipsoid probability must be a finite number between 0 and 1.');
  }
  if (options.clip !== undefined && options.clip !== null) {
    const { normal, offset } = options.clip;
    if (!normal.every(Number.isFinite) || !Number.isFinite(offset)) {
      throw new RangeError('Viewport clip plane must be finite.');
    }
    if (Math.hypot(normal[0], normal[1], normal[2]) <= 1e-12) {
      throw new RangeError('Viewport clip plane normal must be a non-zero vector.');
    }
  }
}

function symmetricEigen(matrix: Mat3): { values: Vec3; vectors: Mat3 } {
  const a: number[][] = [
    [matrix[0][0], matrix[0][1], matrix[0][2]],
    [matrix[1][0], matrix[1][1], matrix[1][2]],
    [matrix[2][0], matrix[2][1], matrix[2][2]],
  ];
  const v: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 32; sweep += 1) {
    const offDiagonal = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (offDiagonal <= EIGEN_EPSILON) break;
    for (let p = 0; p < 2; p += 1) {
      for (let q = p + 1; q < 3; q += 1) {
        const apq = a[p][q];
        if (Math.abs(apq) <= EIGEN_EPSILON) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k += 1) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k += 1) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k += 1) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = [0, 1, 2].sort((left, right) => a[right][right] - a[left][left]);
  return {
    values: [a[order[0]][order[0]], a[order[1]][order[1]], a[order[2]][order[2]]],
    vectors: [
      [v[0][order[0]], v[1][order[0]], v[2][order[0]]],
      [v[0][order[1]], v[1][order[1]], v[2][order[1]]],
      [v[0][order[2]], v[1][order[2]], v[2][order[2]]],
    ],
  };
}

function ellipsoidSigmaScale(probability: number): number {
  const minimum = ELLIPSOID_SIGMA_SCALES[0];
  const maximum = ELLIPSOID_SIGMA_SCALES[ELLIPSOID_SIGMA_SCALES.length - 1];
  const clamped = Math.min(maximum[0], Math.max(minimum[0], probability));
  for (let index = 1; index < ELLIPSOID_SIGMA_SCALES.length; index += 1) {
    const [highProbability, highScale] = ELLIPSOID_SIGMA_SCALES[index];
    const [lowProbability, lowScale] = ELLIPSOID_SIGMA_SCALES[index - 1];
    if (clamped <= highProbability) {
      const ratio = (clamped - lowProbability) / (highProbability - lowProbability);
      return lowScale + ratio * (highScale - lowScale);
    }
  }
  return maximum[1];
}

function isVisibleSite(site: CrystalSite, options: CrystalRenderOptions): boolean {
  if (options.hiddenSiteIds?.has(site.id)) return false;
  if (options.isolatedSiteIds && options.isolatedSiteIds.size > 0 && !options.isolatedSiteIds.has(site.id)) return false;
  if (options.elementFilter && options.elementFilter.size > 0 && !options.elementFilter.has(site.element)) return false;
  return true;
}

function clipRetains(point: Vec3, clip: RenderClipPlane | null | undefined): boolean {
  if (!clip) return true;
  const length = Math.hypot(clip.normal[0], clip.normal[1], clip.normal[2]);
  const signed = (point[0] * clip.normal[0] + point[1] * clip.normal[1] + point[2] * clip.normal[2]) / length - clip.offset;
  return signed <= 1e-12;
}

function shiftedCartesian(site: CrystalSite, image: readonly [number, number, number], document: CrystalDocument): Vec3 {
  return fractionalToCartesian(
    [site.fractional[0] + image[0], site.fractional[1] + image[1], site.fractional[2] + image[2]],
    document.cell,
  );
}

function buildPolyhedra(
  document: CrystalDocument,
  options: CrystalRenderOptions,
  isVisible: (site: CrystalSite) => boolean,
): readonly RenderPolyhedron[] {
  const polyhedra: RenderPolyhedron[] = [];
  for (const centerId of options.polyhedronCenterIds ?? []) {
    const center = document.sites.find((site) => site.id === centerId);
    if (!center || !isVisible(center)) continue;
    if (!clipRetains(fractionalToCartesian(center.fractional, document.cell), options.clip)) continue;
    const { neighbors } = coordinationEnvironment(document, centerId);
    if (neighbors.length < MIN_POLYHEDRON_VERTICES) continue;
    const vertices = neighbors.map((neighbor) => {
      const site = document.sites.find((candidate) => candidate.id === neighbor.siteId);
      return site ? shiftedCartesian(site, neighbor.image, document) : null;
    }).filter((vertex): vertex is Vec3 => vertex !== null);
    if (vertices.length < MIN_POLYHEDRON_VERTICES) continue;
    const distances = neighbors.map((neighbor) => neighbor.distance);
    const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    const variance = distances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / distances.length;
    polyhedra.push({
      centerSiteId: centerId,
      vertices,
      distortion: mean > 0 ? Math.sqrt(variance) / mean : null,
    });
  }
  return polyhedra;
}

function buildEllipsoids(
  document: CrystalDocument,
  options: CrystalRenderOptions,
  isVisible: (site: CrystalSite) => boolean,
): readonly RenderEllipsoid[] {
  const probability = options.ellipsoidProbability ?? 0.5;
  const scale = ellipsoidSigmaScale(probability);
  const ellipsoids: RenderEllipsoid[] = [];
  for (const site of document.sites) {
    if (!site.uAniso || !isVisible(site)) continue;
    if (!clipRetains(fractionalToCartesian(site.fractional, document.cell), options.clip)) continue;
    const [u11, u22, u33, u12, u13, u23] = site.uAniso;
    const { values, vectors } = symmetricEigen([
      [u11, u12, u13],
      [u12, u22, u23],
      [u13, u23, u33],
    ]);
    if (values.some((value) => !Number.isFinite(value) || value <= ADP_EPSILON)) continue;
    ellipsoids.push({
      siteId: site.id,
      axes: [Math.sqrt(values[0]) * scale, Math.sqrt(values[1]) * scale, Math.sqrt(values[2]) * scale],
      orientation: vectors,
      probability,
    });
  }
  return ellipsoids;
}

function buildVectors(
  document: CrystalDocument,
  options: CrystalRenderOptions,
  isVisible: (site: CrystalSite) => boolean,
): readonly RenderVector[] {
  return (options.magneticVectors ?? [])
    .slice(0, MAX_RENDER_VECTORS)
    .filter((vector) => {
      if (!vector.start.every(Number.isFinite) || !vector.end.every(Number.isFinite)) return false;
      const site = document.sites.find((candidate) => candidate.id === vector.siteId);
      if (!site || !isVisible(site)) return false;
      return clipRetains(vector.start, options.clip);
    });
}

function stableModelKey(document: CrystalDocument, options: CrystalRenderOptions): string {
  const cell = [
    document.cell.a,
    document.cell.b,
    document.cell.c,
    document.cell.alpha,
    document.cell.beta,
    document.cell.gamma,
  ].join(',');
  const sites = document.sites
    .map((site) => `${site.id}:${site.element}:${site.fractional.join(',')}:${site.occupancy}`)
    .join('|');
  const selected = [...options.selectedSiteIds].sort().join(',');
  const filters = [
    [...(options.hiddenSiteIds ?? [])].sort().join(','),
    [...(options.isolatedSiteIds ?? [])].sort().join(','),
    [...(options.elementFilter ?? [])].sort().join(','),
    [...(options.polyhedronCenterIds ?? [])].sort().join(','),
    options.ellipsoidProbability ?? '',
    options.clip ? `${options.clip.normal.join(',')}@${options.clip.offset}` : '',
    (options.magneticVectors ?? [])
      .map((vector) => `${vector.siteId}:${vector.start.join(',')}:${vector.end.join(',')}`)
      .join(';'),
  ].join('::');
  return `${document.id}::${options.representation}::${cell}::${sites}::${selected}::${filters}`;
}

export function buildCrystalRenderModel(
  document: CrystalDocument,
  options: CrystalRenderOptions = defaultRenderOptions,
): CrystalRenderModel {
  validateOptions(options);

  const diagnostics: string[] = [];
  const isVisible = (site: CrystalSite): boolean => isVisibleSite(site, options);
  const retainedSiteIds = new Set(
    document.sites
      .filter((site) => isVisible(site) && clipRetains(fractionalToCartesian(site.fractional, document.cell), options.clip))
      .map((site) => site.id),
  );

  const atoms: RenderAtom[] = document.sites
    .filter((site) => retainedSiteIds.has(site.id))
    .map((site) => {
    const reference = getElementReference(site.element);
    const hasVerifiedRadius = reference?.covalentRadius !== null && reference?.covalentRadius !== undefined;
    if (!hasVerifiedRadius) {
      diagnostics.push(`Using a bounded visual fallback for ${site.element}; no verified element radius is available.`);
    }
    const referenceRadius = hasVerifiedRadius ? reference!.covalentRadius! : FALLBACK_RADIUS;
    return {
      siteId: site.id,
      label: site.label,
      element: site.element,
      position: fractionalToCartesian(site.fractional, document.cell),
      radius: representationRadius(referenceRadius, options.representation),
      color: reference?.color ?? FALLBACK_COLOR,
      selected: options.selectedSiteIds.has(site.id),
    };
  });

  const bonds: RenderBond[] = [];
  if (includeBonds(options.representation)) {
    const inferred = findPeriodicBondsWithDiagnostics(document, options.bondTolerance);
    diagnostics.push(...inferred.diagnostics);
    if (inferred.bonds.length > options.maxBonds) {
      diagnostics.push(`Viewport bond inference found ${inferred.bonds.length.toLocaleString()} bonds; rendering the first ${options.maxBonds.toLocaleString()} deterministically.`);
    }

    const siteById = new Map(document.sites.map((site) => [site.id, site] as const));
    for (const bond of inferred.bonds.slice(0, options.maxBonds)) {
      const a = siteById.get(bond.aSiteId);
      const b = siteById.get(bond.bSiteId);
      if (!a || !b) continue;
      if (!retainedSiteIds.has(a.id) || !retainedSiteIds.has(b.id)) continue;
      const shiftedB: Vec3 = [
        b.fractional[0] + bond.imageShift[0],
        b.fractional[1] + bond.imageShift[1],
        b.fractional[2] + bond.imageShift[2],
      ];
      bonds.push({
        id: bond.id,
        aSiteId: bond.aSiteId,
        bSiteId: bond.bSiteId,
        start: fractionalToCartesian(a.fractional, document.cell),
        end: fractionalToCartesian(shiftedB, document.cell),
        radius: bondRadius(options.representation),
      });
    }
  }

  return {
    atoms,
    bonds,
    cellEdges: buildCellEdges(document),
    polyhedra: buildPolyhedra(document, options, isVisible),
    ellipsoids: buildEllipsoids(document, options, isVisible),
    vectors: buildVectors(document, options, isVisible),
    diagnostics: [...new Set(diagnostics)],
    modelKey: stableModelKey(document, options),
  };
}
