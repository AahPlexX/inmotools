import { validateCell } from './cell-engine';
import { STARTER_STRUCTURES, type StarterStructureId } from './starter-structures';
import type {
  CrystalDocument,
  CrystalSite,
  CrystalTransformRecord,
  ImportedCrystalSnapshot,
  UnitCell,
  Vec3,
} from './crystal-types';

export type CrystalSystemConstraint = 'none' | 'cubic' | 'tetragonal' | 'orthorhombic' | 'hexagonal' | 'trigonal' | 'monoclinic' | 'triclinic';

type CellField = keyof UnitCell;

const wrapValue = (value: number): number => {
  const wrapped = ((value % 1) + 1) % 1;
  return Object.is(wrapped, -0) ? 0 : wrapped;
};

const validateSite = (site: Omit<CrystalSite, 'id'> | CrystalSite): void => {
  if (!site.label.trim()) throw new RangeError('Site label cannot be empty.');
  if (!site.element.trim()) throw new RangeError('Site element cannot be empty.');
  if (!site.fractional.every(Number.isFinite)) throw new RangeError('Site coordinates must be finite numbers.');
  if (!Number.isFinite(site.occupancy) || site.occupancy < 0 || site.occupancy > 1) {
    throw new RangeError('Site occupancy must be between 0 and 1.');
  }
  if (site.isotope !== undefined && (!Number.isInteger(site.isotope) || site.isotope <= 0)) {
    throw new RangeError('Isotope mass number must be a positive integer.');
  }
  if (site.oxidationState !== undefined && !Number.isFinite(site.oxidationState)) {
    throw new RangeError('Oxidation state must be finite.');
  }
  if (site.uIso !== undefined && (!Number.isFinite(site.uIso) || site.uIso < 0)) {
    throw new RangeError('Isotropic displacement must be finite and non-negative.');
  }
  if (site.uAniso !== undefined && !site.uAniso.every(Number.isFinite)) {
    throw new RangeError('Anisotropic displacement values must be finite.');
  }
};

const snapshotOf = (document: Pick<CrystalDocument, 'name'|'sourceFormat'|'sourceText'|'cell'|'sites'>): ImportedCrystalSnapshot => ({
  name: document.name,
  sourceFormat: document.sourceFormat,
  sourceText: document.sourceText,
  cell: { ...document.cell },
  sites: document.sites.map((site) => ({ ...site, fractional:[...site.fractional] as Vec3 })),
});

const record = (kind: string, label: string, detail?: string): CrystalTransformRecord => ({ kind, label, detail });

function assertConstraintInput(cell: UnitCell, changed: CellField): void {
  if (!(changed in cell)) throw new RangeError(`Unknown unit-cell field: ${String(changed)}`);
  const validation = validateCell(cell);
  if (!validation.ok) throw new RangeError(validation.error);
}

/**
 * Apply an explicit metric constraint after one unit-cell field has changed.
 * Trigonal uses the rhombohedral-axis setting (a=b=c; alpha=beta=gamma).
 * Monoclinic uses the conventional unique-b setting (alpha=gamma=90°).
 */
export function constrainCell(cell: UnitCell, system: CrystalSystemConstraint, changed: CellField): UnitCell {
  assertConstraintInput(cell, changed);
  const next: UnitCell = { ...cell };
  const changedValue = cell[changed];

  switch (system) {
    case 'none':
    case 'triclinic':
      break;
    case 'cubic': {
      const length = changed === 'a' || changed === 'b' || changed === 'c' ? changedValue : cell.a;
      Object.assign(next, { a:length, b:length, c:length, alpha:90, beta:90, gamma:90 });
      break;
    }
    case 'tetragonal': {
      const basal = changed === 'a' || changed === 'b' ? changedValue : cell.a;
      Object.assign(next, { a:basal, b:basal, alpha:90, beta:90, gamma:90 });
      break;
    }
    case 'orthorhombic':
      Object.assign(next, { alpha:90, beta:90, gamma:90 });
      break;
    case 'hexagonal': {
      const basal = changed === 'a' || changed === 'b' ? changedValue : cell.a;
      Object.assign(next, { a:basal, b:basal, alpha:90, beta:90, gamma:120 });
      break;
    }
    case 'trigonal': {
      const length = changed === 'a' || changed === 'b' || changed === 'c' ? changedValue : cell.a;
      const angle = changed === 'alpha' || changed === 'beta' || changed === 'gamma' ? changedValue : cell.alpha;
      Object.assign(next, { a:length, b:length, c:length, alpha:angle, beta:angle, gamma:angle });
      break;
    }
    case 'monoclinic':
      Object.assign(next, { alpha:90, gamma:90 });
      break;
    default: {
      const exhaustive: never = system;
      throw new RangeError(`Unknown crystal-system constraint: ${String(exhaustive)}`);
    }
  }

  const validation = validateCell(next);
  if (!validation.ok) throw new RangeError(validation.error);
  return next;
}

export function createStarterStructure(id: StarterStructureId): CrystalDocument {
  const definition = STARTER_STRUCTURES[id];
  if (!definition) throw new RangeError(`Unknown starter structure: ${id}`);
  const validation = validateCell(definition.cell);
  if (!validation.ok) throw new RangeError(`Invalid starter cell for ${id}: ${validation.error}`);

  const sites = definition.sites.map((source, index) => {
    validateSite(source);
    return { ...source, id:`${id}-site-${index + 1}`, fractional:[...source.fractional] as Vec3 };
  });
  const base: CrystalDocument = {
    version:1,
    id:`starter-${id}`,
    name:definition.name,
    sourceFormat:'starter',
    cell:{ ...definition.cell },
    sites,
    metadata:{ title:definition.name, description:definition.description },
    provenance:[record('starter', `Loaded ${definition.name}`)],
  };
  return { ...base, importedSnapshot:snapshotOf(base) };
}

export function createEmptyCrystal(name = 'Untitled crystal'): CrystalDocument {
  const base: CrystalDocument = {
    version:1,
    id:'empty-crystal',
    name,
    sourceFormat:'empty',
    cell:{ a:10, b:10, c:10, alpha:90, beta:90, gamma:90 },
    sites:[],
    metadata:{ title:name },
    provenance:[record('create', 'Created an empty crystal')],
  };
  return { ...base, importedSnapshot:snapshotOf(base) };
}

export function setCrystalCell(document: CrystalDocument, cell: UnitCell): CrystalDocument {
  const validation = validateCell(cell);
  if (!validation.ok) throw new RangeError(validation.error);
  return {
    ...document,
    cell:{ ...cell },
    provenance:[...document.provenance, record('cell-edit', 'Edited unit cell')],
  };
}

const nextUserSiteId = (document: CrystalDocument): string => {
  let max = 0;
  for (const site of document.sites) {
    const match = /^user-site-(\d+)$/.exec(site.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `user-site-${max + 1}`;
};

export function addCrystalSite(document: CrystalDocument, site: Omit<CrystalSite,'id'>): CrystalDocument {
  validateSite(site);
  const added: CrystalSite = { ...site, id:nextUserSiteId(document), fractional:[...site.fractional] as Vec3 };
  return {
    ...document,
    sites:[...document.sites, added],
    provenance:[...document.provenance, record('site-add', `Added ${added.label}`)],
  };
}

export function duplicateCrystalSite(document: CrystalDocument, siteId: string): CrystalDocument {
  const source = document.sites.find((site) => site.id === siteId);
  if (!source) throw new RangeError(`Site not found: ${siteId}`);
  const copy: CrystalSite = { ...source, id:nextUserSiteId(document), fractional:[...source.fractional] as Vec3 };
  return {
    ...document,
    sites:[...document.sites, copy],
    provenance:[...document.provenance, record('site-duplicate', `Duplicated ${source.label}`)],
  };
}

export function updateCrystalSite(document: CrystalDocument, siteId: string, patch: Partial<Omit<CrystalSite,'id'>>): CrystalDocument {
  const index = document.sites.findIndex((site) => site.id === siteId);
  if (index < 0) throw new RangeError(`Site not found: ${siteId}`);
  const current = document.sites[index]!;
  const next: CrystalSite = {
    ...current,
    ...patch,
    id:current.id,
    fractional:patch.fractional ? [...patch.fractional] as Vec3 : current.fractional,
  };
  validateSite(next);
  const sites = document.sites.slice();
  sites[index] = next;
  return {
    ...document,
    sites,
    provenance:[...document.provenance, record('site-edit', `Edited ${current.label}`)],
  };
}

export function deleteCrystalSite(document: CrystalDocument, siteId: string): CrystalDocument {
  const source = document.sites.find((site) => site.id === siteId);
  if (!source) throw new RangeError(`Site not found: ${siteId}`);
  return {
    ...document,
    sites:document.sites.filter((site) => site.id !== siteId),
    provenance:[...document.provenance, record('site-delete', `Deleted ${source.label}`)],
  };
}

export function wrapCrystalSites(document: CrystalDocument): CrystalDocument {
  const sites = document.sites.map((site) => ({
    ...site,
    fractional:[wrapValue(site.fractional[0]), wrapValue(site.fractional[1]), wrapValue(site.fractional[2])] as Vec3,
  }));
  return {
    ...document,
    sites,
    provenance:[...document.provenance, record('site-wrap', 'Wrapped sites into the reference cell')],
  };
}