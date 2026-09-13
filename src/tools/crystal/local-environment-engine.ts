import { fractionalToCartesian } from './cell-engine';
import type { CrystalDocument, Vec3 } from './crystal-types';
import { getElementReference } from './element-data';

export interface NeighborShellMember {
  readonly siteId: string;
  readonly image: readonly [number, number, number];
  readonly distance: number;
}

export interface NeighborShell {
  readonly index: number;
  readonly meanDistance: number;
  readonly members: readonly NeighborShellMember[];
}

export interface ShortContact {
  readonly aSiteId: string;
  readonly bSiteId: string;
  readonly imageShift: readonly [number, number, number];
  readonly distance: number;
  readonly threshold: number;
}

export interface HydrogenBondCandidate {
  readonly donorId: string;
  readonly hydrogenId: string;
  readonly acceptorId: string;
  readonly acceptorImage: readonly [number, number, number];
  readonly hADistance: number;
  readonly dhaAngle: number;
}

export interface PairHistogramBin {
  readonly center: number;
  readonly count: number;
}

type ImageShift = readonly [number, number, number];

const DEFAULT_SHELL_TOLERANCE = 0.05;
const DEFAULT_SHORT_CONTACT_SCALE = 0.75;
const DEFAULT_H_BOND_MAX_DISTANCE = 2.5;
const DEFAULT_H_BOND_MIN_ANGLE = 150;
const MAX_HISTOGRAM_BINS = 20_000;
const MAX_IMAGE_RADIUS = 64;
const DISTANCE_EPSILON = 1e-10;
const HYDROGEN_DONORS = new Set(['N', 'O', 'F', 'S']);
const HYDROGEN_ACCEPTORS = new Set(['N', 'O', 'F', 'S']);

const distance = (vector: Vec3): number => Math.hypot(vector[0], vector[1], vector[2]);

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function shiftedFractional(fractional: Vec3, image: ImageShift): Vec3 {
  return [fractional[0] + image[0], fractional[1] + image[1], fractional[2] + image[2]];
}

function directDistance(document: CrystalDocument, from: Vec3, to: Vec3): number {
  return distance(fractionalToCartesian(subtract(to, from), document.cell));
}

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a finite number greater than zero.`);
  return value;
}

function requireNonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a finite number greater than or equal to zero.`);
  return value;
}

function siteById(document: CrystalDocument, siteId: string) {
  const site = document.sites.find((candidate) => candidate.id === siteId);
  if (!site) throw new RangeError(`Crystal site "${siteId}" was not found.`);
  return site;
}

function imageRangeForCutoff(document: CrystalDocument, cutoff: number): number {
  const shortestCellLength = Math.min(document.cell.a, document.cell.b, document.cell.c);
  const requested = Math.max(1, Math.ceil(cutoff / shortestCellLength) + 1);
  if (requested > MAX_IMAGE_RADIUS) {
    throw new RangeError(`The requested cutoff requires more than ${MAX_IMAGE_RADIUS} periodic image shells.`);
  }
  return requested;
}

function enumerateShifts(radius: number): ImageShift[] {
  const shifts: ImageShift[] = [];
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let z = -radius; z <= radius; z += 1) shifts.push([x, y, z]);
    }
  }
  return shifts;
}

function canonicalPairKey(aIndex: number, bIndex: number, shift: ImageShift): string {
  if (aIndex < bIndex) return `${aIndex}|${bIndex}|${shift.join(',')}`;
  return `${bIndex}|${aIndex}|${[-shift[0], -shift[1], -shift[2]].join(',')}`;
}

function sortMembers(left: NeighborShellMember, right: NeighborShellMember): number {
  return left.distance - right.distance
    || left.siteId.localeCompare(right.siteId)
    || left.image[0] - right.image[0]
    || left.image[1] - right.image[1]
    || left.image[2] - right.image[2];
}

export function coordinationEnvironment(
  document: CrystalDocument,
  siteId: string,
  options: { radiusScale?: number; shellTolerance?: number } = {},
): { coordinationNumber: number; neighbors: readonly NeighborShellMember[]; shells: readonly NeighborShell[] } {
  const center = siteById(document, siteId);
  const shellTolerance = options.shellTolerance ?? DEFAULT_SHELL_TOLERANCE;
  requirePositiveFinite(shellTolerance, 'Shell tolerance');
  if (options.radiusScale !== undefined) requirePositiveFinite(options.radiusScale, 'Radius scale');

  // The first coordination shell is geometric, so inspect the adjacent periodic
  // images rather than using covalent radii (which can merge distinct shells).
  const members: NeighborShellMember[] = [];
  for (const site of document.sites) {
    for (const image of enumerateShifts(1)) {
      if (site.id === center.id && image[0] === 0 && image[1] === 0 && image[2] === 0) continue;
      const candidate = shiftedFractional(site.fractional, image);
      const candidateDistance = directDistance(document, center.fractional, candidate);
      if (candidateDistance <= DISTANCE_EPSILON) continue;
      members.push({ siteId: site.id, image, distance: candidateDistance });
    }
  }
  members.sort(sortMembers);

  const shells: NeighborShell[] = [];
  for (const member of members) {
    const previous = shells.at(-1);
    if (!previous || Math.abs(member.distance - previous.meanDistance) > shellTolerance) {
      shells.push({ index: shells.length + 1, meanDistance: member.distance, members: [member] });
      continue;
    }
    const nextMembers = [...previous.members, member];
    const meanDistance = nextMembers.reduce((sum, item) => sum + item.distance, 0) / nextMembers.length;
    shells[shells.length - 1] = { ...previous, meanDistance, members: nextMembers };
  }

  const firstShell = shells[0]?.members ?? [];
  const radiusScale = options.radiusScale;
  const neighbors = radiusScale === undefined || firstShell.length === 0
    ? firstShell
    : members.filter((member) => member.distance <= firstShell[0]!.distance * radiusScale + shellTolerance);

  return {
    coordinationNumber: neighbors.length,
    neighbors,
    shells,
  };
}

export function findShortContacts(document: CrystalDocument, scale = DEFAULT_SHORT_CONTACT_SCALE): readonly ShortContact[] {
  requirePositiveFinite(scale, 'Short-contact scale');
  const contacts: ShortContact[] = [];
  const seen = new Set<string>();

  for (let aIndex = 0; aIndex < document.sites.length; aIndex += 1) {
    const a = document.sites[aIndex]!;
    const aRadius = getElementReference(a.element)?.covalentRadius;
    if (aRadius === null || aRadius === undefined) continue;
    for (let bIndex = 0; bIndex < document.sites.length; bIndex += 1) {
      const b = document.sites[bIndex]!;
      const bRadius = getElementReference(b.element)?.covalentRadius;
      if (bRadius === null || bRadius === undefined) continue;
      const threshold = (aRadius + bRadius) * scale;
      for (const shift of enumerateShifts(1)) {
        if (aIndex === bIndex && shift[0] === 0 && shift[1] === 0 && shift[2] === 0) continue;
        const key = canonicalPairKey(aIndex, bIndex, shift);
        if (seen.has(key)) continue;
        seen.add(key);
        const candidateDistance = directDistance(document, a.fractional, shiftedFractional(b.fractional, shift));
        if (candidateDistance <= DISTANCE_EPSILON || candidateDistance >= threshold) continue;
        contacts.push({ aSiteId: a.id, bSiteId: b.id, imageShift: shift, distance: candidateDistance, threshold });
      }
    }
  }

  return contacts.sort((left, right) => left.distance - right.distance
    || left.aSiteId.localeCompare(right.aSiteId)
    || left.bSiteId.localeCompare(right.bSiteId));
}

function angleDegrees(first: Vec3, second: Vec3): number {
  const firstLength = distance(first);
  const secondLength = distance(second);
  if (firstLength <= DISTANCE_EPSILON || secondLength <= DISTANCE_EPSILON) return Number.NaN;
  const cosine = Math.min(1, Math.max(-1, dot(first, second) / (firstLength * secondLength)));
  return Math.acos(cosine) * 180 / Math.PI;
}

export function findHydrogenBondCandidates(
  document: CrystalDocument,
  options: { maxHADistance?: number; minDhaAngle?: number } = {},
): readonly HydrogenBondCandidate[] {
  const maxHADistance = options.maxHADistance ?? DEFAULT_H_BOND_MAX_DISTANCE;
  const minDhaAngle = options.minDhaAngle ?? DEFAULT_H_BOND_MIN_ANGLE;
  requirePositiveFinite(maxHADistance, 'Hydrogen-bond distance');
  requireNonNegativeFinite(minDhaAngle, 'Hydrogen-bond angle');

  const range = imageRangeForCutoff(document, maxHADistance);
  const shifts = enumerateShifts(range);
  const candidates: HydrogenBondCandidate[] = [];
  const seen = new Set<string>();

  for (const hydrogen of document.sites.filter((site) => site.element === 'H')) {
    for (const donor of document.sites.filter((site) => HYDROGEN_DONORS.has(site.element))) {
      const donorRadius = getElementReference(donor.element)?.covalentRadius;
      const hydrogenRadius = getElementReference('H')?.covalentRadius;
      if (donorRadius === null || donorRadius === undefined || hydrogenRadius === null || hydrogenRadius === undefined) continue;

      let donorImage: ImageShift | undefined;
      let donorDistance = Number.POSITIVE_INFINITY;
      for (const shift of enumerateShifts(1)) {
        const value = directDistance(document, hydrogen.fractional, shiftedFractional(donor.fractional, shift));
        if (value < donorDistance) {
          donorDistance = value;
          donorImage = shift;
        }
      }
      if (!donorImage || donorDistance > (donorRadius + hydrogenRadius) * 1.2) continue;
      const donorFrac = shiftedFractional(donor.fractional, donorImage);
      const donorVector = fractionalToCartesian(subtract(donorFrac, hydrogen.fractional), document.cell);

      for (const acceptor of document.sites.filter((site) => site.id !== donor.id && HYDROGEN_ACCEPTORS.has(site.element))) {
        for (const shift of shifts) {
          const acceptorFrac = shiftedFractional(acceptor.fractional, shift);
          const acceptorVector = fractionalToCartesian(subtract(acceptorFrac, hydrogen.fractional), document.cell);
          const hADistance = distance(acceptorVector);
          if (hADistance <= DISTANCE_EPSILON || hADistance > maxHADistance) continue;
          const dhaAngle = angleDegrees(donorVector, acceptorVector);
          if (!Number.isFinite(dhaAngle) || dhaAngle < minDhaAngle) continue;
          const key = `${donor.id}|${hydrogen.id}|${acceptor.id}|${shift.join(',')}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ donorId: donor.id, hydrogenId: hydrogen.id, acceptorId: acceptor.id, acceptorImage: shift, hADistance, dhaAngle });
        }
      }
    }
  }

  return candidates.sort((left, right) => left.hADistance - right.hADistance
    || right.dhaAngle - left.dhaAngle
    || left.donorId.localeCompare(right.donorId));
}

function unorderedElementPairMatches(elementA: string, elementB: string, pair: readonly [string, string] | undefined): boolean {
  if (!pair) return true;
  return (elementA === pair[0] && elementB === pair[1]) || (elementA === pair[1] && elementB === pair[0]);
}

export function pairDistanceHistogram(
  document: CrystalDocument,
  options: { maxDistance: number; binWidth: number; pair?: readonly [string, string] },
): readonly PairHistogramBin[] {
  const maxDistance = requirePositiveFinite(options.maxDistance, 'Maximum distance');
  const binWidth = requirePositiveFinite(options.binWidth, 'Histogram bin width');
  const binCount = Math.ceil(maxDistance / binWidth);
  if (binCount > MAX_HISTOGRAM_BINS) throw new RangeError(`Histogram is limited to ${MAX_HISTOGRAM_BINS.toLocaleString()} bins.`);

  const counts = Array.from({ length: binCount }, () => 0);
  const range = imageRangeForCutoff(document, maxDistance);
  const shifts = enumerateShifts(range);
  const seen = new Set<string>();

  for (let aIndex = 0; aIndex < document.sites.length; aIndex += 1) {
    const a = document.sites[aIndex]!;
    for (let bIndex = 0; bIndex < document.sites.length; bIndex += 1) {
      const b = document.sites[bIndex]!;
      if (!unorderedElementPairMatches(a.element, b.element, options.pair)) continue;
      for (const shift of shifts) {
        if (aIndex === bIndex && shift[0] === 0 && shift[1] === 0 && shift[2] === 0) continue;
        const key = canonicalPairKey(aIndex, bIndex, shift);
        if (seen.has(key)) continue;
        seen.add(key);
        const value = directDistance(document, a.fractional, shiftedFractional(b.fractional, shift));
        if (value <= DISTANCE_EPSILON || value >= maxDistance) continue;
        const index = Math.floor(value / binWidth);
        if (index >= 0 && index < counts.length) counts[index]! += 1;
      }
    }
  }

  return counts.map((count, index) => ({ center: (index + 0.5) * binWidth, count }));
}
