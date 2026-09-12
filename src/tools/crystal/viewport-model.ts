import { cellToMatrix, fractionalToCartesian } from './cell-engine';
import { getElementReference } from './element-data';
import { findPeriodicBondsWithDiagnostics } from './periodic-engine';
import type { CrystalDocument, Vec3 } from './crystal-types';

export type CrystalRepresentation = 'ball-stick' | 'sticks' | 'space-fill' | 'points' | 'wireframe';

export interface CrystalRenderOptions {
  readonly representation: CrystalRepresentation;
  readonly selectedSiteIds: ReadonlySet<string>;
  readonly bondTolerance: number;
  readonly maxBonds: number;
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

export interface CrystalRenderModel {
  readonly atoms: readonly RenderAtom[];
  readonly bonds: readonly RenderBond[];
  readonly cellEdges: readonly (readonly [Vec3, Vec3])[];
  readonly diagnostics: readonly string[];
  readonly modelKey: string;
}

export const defaultRenderOptions: CrystalRenderOptions = {
  representation: 'ball-stick',
  selectedSiteIds: new Set<string>(),
  bondTolerance: 1.15,
  maxBonds: 50_000,
};

const FALLBACK_COLOR = '#B0B0B0' as const;
const FALLBACK_RADIUS = 0.6;

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
  return `${document.id}::${options.representation}::${cell}::${sites}::${selected}`;
}

export function buildCrystalRenderModel(
  document: CrystalDocument,
  options: CrystalRenderOptions = defaultRenderOptions,
): CrystalRenderModel {
  validateOptions(options);

  const diagnostics: string[] = [];
  const atoms: RenderAtom[] = document.sites.map((site) => {
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
    diagnostics: [...new Set(diagnostics)],
    modelKey: stableModelKey(document, options),
  };
}
