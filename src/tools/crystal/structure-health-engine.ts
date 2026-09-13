import { cellVolume, validateCell } from './cell-engine';
import type { CrystalDocument, CrystalSite } from './crystal-types';
import { getElementReference } from './element-data';
import { findShortContacts } from './local-environment-engine';
import { periodicDistance } from './periodic-engine';

export type HealthSeverity = 'error' | 'warning' | 'info';

export interface StructureHealthFinding {
  readonly id: string;
  readonly severity: HealthSeverity;
  readonly message: string;
  readonly siteIds: readonly string[];
}

export interface CompositionSummary {
  readonly formula: string;
  readonly reducedFormula: string;
  readonly formulaMass: number;
  readonly cellMass: number;
  readonly density: number;
  readonly fractions: Readonly<Record<string, number>>;
}

export interface BondValenceResult {
  readonly siteId: string;
  readonly value: number | null;
  readonly diagnostic?: string;
}

const ATOMIC_MASS_DENSITY_FACTOR = 1.66053906892;
const COINCIDENT_SITE_TOLERANCE = 1e-5;
const INTEGER_TOLERANCE = 1e-9;

const formatCount = (value: number): string => {
  if (Math.abs(value - 1) <= INTEGER_TOLERANCE) return '';
  if (Math.abs(value - Math.round(value)) <= INTEGER_TOLERANCE) return String(Math.round(value));
  return Number(value.toPrecision(8)).toString();
};

const gcd = (left: number, right: number): number => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
};

function reducedCounts(entries: readonly [string, number][]): readonly [string, number][] {
  if (entries.length === 0) return entries;
  const integers = entries.map(([, count]) => Math.round(count));
  if (!entries.every(([, count], index) => Math.abs(count - integers[index]!) <= INTEGER_TOLERANCE)) return entries;
  const divisor = integers.reduce((value, count) => gcd(value, count), 0) || 1;
  return entries.map(([element, count], index) => [element, integers[index]! / divisor || count] as const);
}

function formulaFrom(entries: readonly [string, number][]): string {
  return entries
    .filter(([, count]) => count > 0)
    .map(([element, count]) => `${element}${formatCount(count)}`)
    .join('');
}

function compositionEntries(document: CrystalDocument): readonly [string, number][] {
  const counts = new Map<string, number>();
  for (const site of document.sites) {
    if (!Number.isFinite(site.occupancy) || site.occupancy <= 0) continue;
    counts.set(site.element, (counts.get(site.element) ?? 0) + site.occupancy);
  }
  return [...counts.entries()];
}

export function summarizeComposition(document: CrystalDocument): CompositionSummary {
  const entries = compositionEntries(document);
  const totalCount = entries.reduce((sum, [, count]) => sum + count, 0);
  const fractions = Object.fromEntries(entries.map(([element, count]) => [element, totalCount > 0 ? count / totalCount : 0]));
  const reduced = reducedCounts(entries);

  let cellMass = 0;
  let hasUnknownMass = false;
  for (const site of document.sites) {
    if (!Number.isFinite(site.occupancy) || site.occupancy <= 0) continue;
    const atomicWeight = getElementReference(site.element)?.atomicWeight;
    if (atomicWeight === null || atomicWeight === undefined) {
      hasUnknownMass = true;
      continue;
    }
    cellMass += site.occupancy * atomicWeight;
  }

  if (hasUnknownMass) cellMass = 0;

  let formulaMass = 0;
  if (!hasUnknownMass && reduced.length > 0) {
    for (const [element, count] of reduced) {
      const atomicWeight = getElementReference(element)?.atomicWeight;
      if (atomicWeight === null || atomicWeight === undefined) {
        formulaMass = 0;
        break;
      }
      formulaMass += count * atomicWeight;
    }
  }

  const validation = validateCell(document.cell);
  const volume = validation.ok ? cellVolume(document.cell) : 0;
  const density = cellMass > 0 && volume > 0 ? cellMass * ATOMIC_MASS_DENSITY_FACTOR / volume : 0;

  return {
    formula: formulaFrom(entries),
    reducedFormula: formulaFrom(reduced),
    formulaMass,
    cellMass,
    density,
    fractions,
  };
}

function finding(
  id: string,
  severity: HealthSeverity,
  message: string,
  siteIds: readonly string[] = [],
): StructureHealthFinding {
  return { id, severity, message, siteIds };
}

function anisotropicTensorIsPositiveSemidefinite(values: readonly number[]): boolean {
  if (values.length !== 6 || !values.every(Number.isFinite)) return false;
  const [u11, u22, u33, u12, u13, u23] = values;
  if (u11! < 0 || u22! < 0 || u33! < 0) return false;
  const minor12 = u11! * u22! - u12! * u12!;
  const minor13 = u11! * u33! - u13! * u13!;
  const minor23 = u22! * u33! - u23! * u23!;
  const determinant = u11! * (u22! * u33! - u23! * u23!)
    - u12! * (u12! * u33! - u13! * u23!)
    + u13! * (u12! * u23! - u13! * u22!);
  return minor12 >= -1e-12 && minor13 >= -1e-12 && minor23 >= -1e-12 && determinant >= -1e-12;
}

function validateSiteFields(site: CrystalSite): StructureHealthFinding[] {
  const findings: StructureHealthFinding[] = [];
  if (!Number.isFinite(site.occupancy) || site.occupancy < 0 || site.occupancy > 1) {
    findings.push(finding(
      `occupancy:${site.id}`,
      'error',
      `${site.label} has occupancy ${String(site.occupancy)}; occupancy must be between 0 and 1.`,
      [site.id],
    ));
  }

  const reference = getElementReference(site.element);
  if (!reference || reference.atomicWeight === null) {
    findings.push(finding(
      `element-mass:${site.id}`,
      'info',
      `${site.label} uses ${site.element}, for which no verified atomic mass is available; mass and density are not reported.`,
      [site.id],
    ));
  }
  if (!reference || reference.covalentRadius === null) {
    findings.push(finding(
      `element-radius:${site.id}`,
      'info',
      `${site.label} uses ${site.element}, for which no verified covalent radius is available; radius-based contact checks skip this site.`,
      [site.id],
    ));
  }

  if (site.uIso !== undefined && (!Number.isFinite(site.uIso) || site.uIso < 0)) {
    findings.push(finding(
      `uiso:${site.id}`,
      'error',
      `${site.label} has an invalid isotropic displacement parameter.`,
      [site.id],
    ));
  }
  if (site.uAniso !== undefined && !anisotropicTensorIsPositiveSemidefinite(site.uAniso)) {
    findings.push(finding(
      `uaniso:${site.id}`,
      'warning',
      `${site.label} has an anisotropic displacement tensor that is non-finite or not positive semidefinite.`,
      [site.id],
    ));
  }
  return findings;
}

export function validateCrystalStructure(document: CrystalDocument): readonly StructureHealthFinding[] {
  const findings: StructureHealthFinding[] = [];
  const cellValidation = validateCell(document.cell);
  if (!cellValidation.ok) {
    findings.push(finding('cell:invalid', 'error', cellValidation.error));
  }

  for (const site of document.sites) findings.push(...validateSiteFields(site));
  if (!cellValidation.ok) return findings;

  for (let leftIndex = 0; leftIndex < document.sites.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < document.sites.length; rightIndex += 1) {
      const left = document.sites[leftIndex]!;
      const right = document.sites[rightIndex]!;
      const separation = periodicDistance(left.fractional, right.fractional, document.cell);
      if (separation <= COINCIDENT_SITE_TOLERANCE) {
        findings.push(finding(
          `coincident:${left.id}:${right.id}`,
          'error',
          `${left.label} and ${right.label} occupy the same periodic position within ${COINCIDENT_SITE_TOLERANCE} Å.`,
          [left.id, right.id],
        ));
      }
    }
  }

  for (const contact of findShortContacts(document)) {
    findings.push(finding(
      `short-contact:${contact.aSiteId}:${contact.bSiteId}:${contact.imageShift.join(',')}`,
      'warning',
      `A short contact of ${contact.distance.toFixed(3)} Å is below the ${contact.threshold.toFixed(3)} Å radius-based screening threshold.`,
      [contact.aSiteId, contact.bSiteId],
    ));
  }

  return findings;
}

export function computeBondValenceSums(document: CrystalDocument): readonly BondValenceResult[] {
  return document.sites.map((site) => {
    if (site.oxidationState === undefined) {
      return {
        siteId: site.id,
        value: null,
        diagnostic: 'Bond-valence calculation requires an explicit oxidation state and a validated parameter pair; no value was guessed.',
      };
    }
    return {
      siteId: site.id,
      value: null,
      diagnostic: `No validated bond-valence parameter pair is currently available for ${site.element} at oxidation state ${site.oxidationState}; no value was guessed.`,
    };
  });
}
