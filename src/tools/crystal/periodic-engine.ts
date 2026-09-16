import { fractionalToCartesian } from './cell-engine';
import { getElementReference } from './element-data';
import type { CrystalDocument, CrystalSite, UnitCell, Vec3 } from './crystal-types';

export interface CrystalSiteImage extends CrystalSite {
  readonly sourceSiteId: string;
  readonly image: readonly [number, number, number];
}

export interface CrystalBond {
  readonly id: string;
  readonly aSiteId: string;
  readonly bSiteId: string;
  readonly imageShift: readonly [number, number, number];
  readonly distance: number;
  readonly cutoff: number;
}

export interface PeriodicBondSearchResult {
  readonly bonds: readonly CrystalBond[];
  readonly diagnostics: readonly string[];
}

const wrapUnit = (value: number): number => {
  const wrapped = value - Math.floor(value);
  return Object.is(wrapped, -0) || Math.abs(wrapped - 1) < Number.EPSILON ? 0 : wrapped;
};

export function wrapFractional(frac: Vec3): Vec3 {
  return [wrapUnit(frac[0]), wrapUnit(frac[1]), wrapUnit(frac[2])];
}

const wrapMinimum = (value: number): number => value - Math.floor(value + 0.5);

export function minimumImageFractionalDelta(a: Vec3, b: Vec3): Vec3 {
  return [
    wrapMinimum(b[0] - a[0]),
    wrapMinimum(b[1] - a[1]),
    wrapMinimum(b[2] - a[2]),
  ];
}

export function periodicDistance(a: Vec3, b: Vec3, cell: UnitCell): number {
  const cartesian = fractionalToCartesian(minimumImageFractionalDelta(a, b), cell);
  return Math.hypot(cartesian[0], cartesian[1], cartesian[2]);
}

function assertRepeat(value: number, axis: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Supercell repeat along ${axis} must be a positive integer.`);
  }
}

function cloneSiteForImage(site: CrystalSite, id: string, fractional: Vec3): CrystalSite {
  return { ...site, id, fractional };
}

export function expandSupercell(
  document: CrystalDocument,
  repeats: readonly [number, number, number],
  maxSites = 250_000,
): CrystalDocument {
  const [na, nb, nc] = repeats;
  assertRepeat(na, 'a');
  assertRepeat(nb, 'b');
  assertRepeat(nc, 'c');
  if (!Number.isSafeInteger(maxSites) || maxSites <= 0) throw new RangeError('Supercell site limit must be a positive integer.');

  const cellCopies = na * nb * nc;
  const siteCount = document.sites.length * cellCopies;
  if (!Number.isSafeInteger(siteCount) || siteCount > maxSites) {
    throw new RangeError(`Supercell would contain ${siteCount.toLocaleString()} sites, exceeding the ${maxSites.toLocaleString()}-site limit.`);
  }

  const sites: CrystalSite[] = [];
  for (let i = 0; i < na; i += 1) {
    for (let j = 0; j < nb; j += 1) {
      for (let k = 0; k < nc; k += 1) {
        for (const site of document.sites) {
          const fractional: Vec3 = [
            (site.fractional[0] + i) / na,
            (site.fractional[1] + j) / nb,
            (site.fractional[2] + k) / nc,
          ];
          sites.push(cloneSiteForImage(site, `${site.id}@${i},${j},${k}`, fractional));
        }
      }
    }
  }

  return {
    ...document,
    id: `${document.id}-supercell-${na}x${nb}x${nc}`,
    name: `${document.name} — ${na}×${nb}×${nc} supercell`,
    cell: {
      a: document.cell.a * na,
      b: document.cell.b * nb,
      c: document.cell.c * nc,
      alpha: document.cell.alpha,
      beta: document.cell.beta,
      gamma: document.cell.gamma,
    },
    sites,
    provenance: [
      ...document.provenance,
      { kind: 'supercell', label: `Expanded to ${na}×${nb}×${nc} supercell`, detail: `${document.sites.length} → ${siteCount} sites` },
    ],
  };
}

export function generatePeriodicImages(document: CrystalDocument, radiusShell: number): readonly CrystalSiteImage[] {
  if (!Number.isSafeInteger(radiusShell) || radiusShell < 0) {
    throw new RangeError('Periodic image shell must be a nonnegative integer.');
  }
  const side = radiusShell * 2 + 1;
  const imageCount = document.sites.length * side * side * side;
  if (!Number.isSafeInteger(imageCount) || imageCount > 500_000) {
    throw new RangeError(`Periodic image request would create ${imageCount.toLocaleString()} site images; reduce the shell radius.`);
  }

  const images: CrystalSiteImage[] = [];
  for (let i = -radiusShell; i <= radiusShell; i += 1) {
    for (let j = -radiusShell; j <= radiusShell; j += 1) {
      for (let k = -radiusShell; k <= radiusShell; k += 1) {
        for (const site of document.sites) {
          images.push({
            ...site,
            id: `${site.id}@${i},${j},${k}`,
            sourceSiteId: site.id,
            image: [i, j, k],
            fractional: [site.fractional[0] + i, site.fractional[1] + j, site.fractional[2] + k],
          });
        }
      }
    }
  }
  return images;
}

const lexicographicallyPositive = (shift: readonly [number, number, number]): boolean => {
  if (shift[0] !== 0) return shift[0] > 0;
  if (shift[1] !== 0) return shift[1] > 0;
  return shift[2] > 0;
};

const shiftedDelta = (a: CrystalSite, b: CrystalSite, shift: readonly [number, number, number]): Vec3 => [
  b.fractional[0] + shift[0] - a.fractional[0],
  b.fractional[1] + shift[1] - a.fractional[1],
  b.fractional[2] + shift[2] - a.fractional[2],
];

const cartesianLength = (fractional: Vec3, cell: UnitCell): number => {
  const cartesian = fractionalToCartesian(fractional, cell);
  return Math.hypot(cartesian[0], cartesian[1], cartesian[2]);
};

export function findPeriodicBondsWithDiagnostics(
  document: CrystalDocument,
  tolerance = 1.15,
): PeriodicBondSearchResult {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('Bond tolerance must be a positive finite number.');

  const diagnostics: string[] = [];
  const radiusBySite = new Map<string, number>();
  const missing = new Set<string>();
  for (const site of document.sites) {
    const reference = getElementReference(site.element);
    if (reference?.covalentRadius === null || reference?.covalentRadius === undefined) {
      missing.add(site.element);
      continue;
    }
    radiusBySite.set(site.id, reference.covalentRadius);
  }
  for (const element of [...missing].sort()) {
    diagnostics.push(`Skipped bond inference for ${element}: no verified covalent radius is available.`);
  }

  const bonds: CrystalBond[] = [];
  for (let aIndex = 0; aIndex < document.sites.length; aIndex += 1) {
    const a = document.sites[aIndex]!;
    const radiusA = radiusBySite.get(a.id);
    if (radiusA === undefined) continue;
    for (let bIndex = aIndex; bIndex < document.sites.length; bIndex += 1) {
      const b = document.sites[bIndex]!;
      const radiusB = radiusBySite.get(b.id);
      if (radiusB === undefined) continue;
      const cutoff = (radiusA + radiusB) * tolerance;
      for (let i = -1; i <= 1; i += 1) {
        for (let j = -1; j <= 1; j += 1) {
          for (let k = -1; k <= 1; k += 1) {
            const shift: [number, number, number] = [i, j, k];
            if (aIndex === bIndex && !lexicographicallyPositive(shift)) continue;
            const distance = cartesianLength(shiftedDelta(a, b, shift), document.cell);
            if (distance <= 1e-10 || distance > cutoff) continue;
            bonds.push({
              id: `${a.id}->${b.id}@${i},${j},${k}`,
              aSiteId: a.id,
              bSiteId: b.id,
              imageShift: shift,
              distance,
              cutoff,
            });
          }
        }
      }
    }
  }
  return { bonds, diagnostics };
}

export function findPeriodicBonds(document: CrystalDocument, tolerance = 1.15): readonly CrystalBond[] {
  return findPeriodicBondsWithDiagnostics(document, tolerance).bonds;
}
