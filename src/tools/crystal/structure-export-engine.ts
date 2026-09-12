import { cellToMatrix, fractionalToCartesian } from './cell-engine';
import { serializeCif, type CifDocument, type CifLoop, type CifVersion } from './cif-engine';
import { getElementReference } from './element-data';
import {
  computeMetadataDiff,
  encodeCifValue,
  setCifScalar,
  type MetadataDiff,
} from './metadata-engine';
import {
  serializeCrystalProject,
  type CrystalMeasurement,
  type CrystalViewState,
} from './project-engine';
import type { CrystalDocument, CrystalSite } from './crystal-types';

export type CrystalExportTarget =
  | 'cif1'
  | 'cif2'
  | 'poscar'
  | 'xyz'
  | 'extxyz'
  | 'project'
  | 'measurements-csv';

export interface CrystalExportOptions {
  readonly filenameStem?: string;
  readonly measurements?: readonly CrystalMeasurement[];
  readonly view?: CrystalViewState;
  readonly preserveCifMetadata?: boolean;
  readonly cifBlockName?: string;
}

export interface CrystalExportResult {
  readonly filename: string;
  readonly mime: string;
  readonly text: string;
  readonly diff: MetadataDiff;
}

export const defaultExportOptions: CrystalExportOptions = Object.freeze({
  measurements: Object.freeze([]) as readonly CrystalMeasurement[],
  preserveCifMetadata: true,
});

const DEFAULT_VIEW: CrystalViewState = {
  projection: 'perspective',
  cameraPosition: [8, 8, 8],
  target: [0, 0, 0],
  up: [0, 1, 0],
  representation: 'ball-and-stick',
  showCell: true,
  showAxes: true,
  showBonds: true,
  atomScale: 1,
  bondScale: 1,
  background: '#ffffff',
};

const CANONICAL_ATOM_TAGS = [
  '_atom_site_label',
  '_atom_site_type_symbol',
  '_atom_site_fract_x',
  '_atom_site_fract_y',
  '_atom_site_fract_z',
  '_atom_site_occupancy',
] as const;

const normalizeTag = (tag: string): string => tag.toLowerCase().replaceAll('.', '_');

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('Cannot export a non-finite numeric value.');
  if (Math.abs(value) < 1e-12) return '0';
  return Number(value.toPrecision(12)).toString();
}

function safeFilenameStem(value: string): string {
  const stem = value.trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return stem || 'crystal';
}

function safeCifBlockName(value: string): string {
  const block = value.trim().replace(/[^A-Za-z0-9_.-]+/gu, '_').replace(/^_+|_+$/gu, '');
  return block || 'crystal';
}

function chooseFilenameStem(document: CrystalDocument, options: CrystalExportOptions): string {
  return safeFilenameStem(options.filenameStem ?? document.metadata.title ?? document.name);
}

function findBlockIndex(cif: CifDocument, blockName: string): number {
  const exact = cif.blocks.findIndex((block) => block.name === blockName);
  if (exact >= 0) return exact;
  const folded = blockName.toLowerCase();
  const insensitive = cif.blocks.findIndex((block) => block.name.toLowerCase() === folded);
  if (insensitive >= 0) return insensitive;
  throw new RangeError(`CIF data block not found: ${blockName}`);
}

function atomValue(site: CrystalSite, tag: string): string | undefined {
  switch (normalizeTag(tag)) {
    case '_atom_site_label': return site.label;
    case '_atom_site_type_symbol': return site.element;
    case '_atom_site_fract_x': return formatNumber(site.fractional[0]);
    case '_atom_site_fract_y': return formatNumber(site.fractional[1]);
    case '_atom_site_fract_z': return formatNumber(site.fractional[2]);
    case '_atom_site_occupancy': return formatNumber(site.occupancy);
    case '_atom_site_u_iso_or_equiv': return site.uIso === undefined ? '.' : formatNumber(site.uIso);
    case '_atom_site_charge': return site.oxidationState === undefined ? '.' : formatNumber(site.oxidationState);
    case '_atom_site_disorder_assembly': return site.disorderAssembly ?? '.';
    case '_atom_site_disorder_group': return site.disorderGroup ?? '.';
    default: return undefined;
  }
}

function buildCanonicalAtomLoop(sites: readonly CrystalSite[], version: CifVersion): CifLoop {
  const tags = [...CANONICAL_ATOM_TAGS];
  const rows = sites.map((site) => tags.map((tag) => atomValue(site, tag) ?? '?'));
  const rawValues = rows.map((row) => row.map((value) => encodeCifValue(value, version)));
  return { kind: 'loop', tags, rows, rawValues };
}

function updateAtomLoop(cif: CifDocument, blockName: string, sites: readonly CrystalSite[]): CifDocument {
  const blockIndex = findBlockIndex(cif, blockName);
  const block = cif.blocks[blockIndex]!;
  const atomEntryIndex = block.entries.findIndex((entry) => {
    if (entry.kind !== 'loop') return false;
    const tags = entry.tags.map(normalizeTag);
    return tags.includes('_atom_site_fract_x')
      && tags.includes('_atom_site_fract_y')
      && tags.includes('_atom_site_fract_z');
  });

  const entries = block.entries.slice();
  if (atomEntryIndex < 0) {
    entries.push(buildCanonicalAtomLoop(sites, cif.version));
  } else {
    const sourceLoop = entries[atomEntryIndex];
    if (!sourceLoop || sourceLoop.kind !== 'loop') throw new RangeError('Unable to locate CIF atom-site loop.');

    const sourceTags = sourceLoop.tags.slice();
    const sourceTagCount = sourceTags.length;
    const normalizedSourceTags = sourceTags.map(normalizeTag);
    const tags = sourceTags.slice();
    for (const required of CANONICAL_ATOM_TAGS) {
      if (!normalizedSourceTags.includes(normalizeTag(required))) tags.push(required);
    }

    const labelColumn = normalizedSourceTags.indexOf('_atom_site_label');
    const rowIndexesByLabel = new Map<string, number[]>();
    if (labelColumn >= 0) {
      sourceLoop.rows.forEach((row, rowIndex) => {
        const label = row[labelColumn];
        if (label === undefined) return;
        const indexes = rowIndexesByLabel.get(label) ?? [];
        indexes.push(rowIndex);
        rowIndexesByLabel.set(label, indexes);
      });
    }

    const usedSourceRows = new Set<number>();
    const rows: string[][] = [];
    const rawValues: string[][] = [];

    sites.forEach((site, siteIndex) => {
      let sourceRowIndex: number | undefined;
      const matching = rowIndexesByLabel.get(site.label);
      if (matching) sourceRowIndex = matching.find((candidate) => !usedSourceRows.has(candidate));
      if (sourceRowIndex === undefined && siteIndex < sourceLoop.rows.length && !usedSourceRows.has(siteIndex)) {
        sourceRowIndex = siteIndex;
      }
      if (sourceRowIndex !== undefined) usedSourceRows.add(sourceRowIndex);

      const sourceRow = sourceRowIndex === undefined ? undefined : sourceLoop.rows[sourceRowIndex];
      const sourceRawRow = sourceRowIndex === undefined ? undefined : sourceLoop.rawValues[sourceRowIndex];
      const nextRow: string[] = [];
      const nextRawRow: string[] = [];

      tags.forEach((tag, columnIndex) => {
        const canonical = atomValue(site, tag);
        if (canonical !== undefined) {
          nextRow.push(canonical);
          nextRawRow.push(encodeCifValue(canonical, cif.version));
          return;
        }
        if (columnIndex < sourceTagCount && sourceRow && sourceRawRow) {
          nextRow.push(sourceRow[columnIndex] ?? '?');
          nextRawRow.push(sourceRawRow[columnIndex] ?? '?');
          return;
        }
        nextRow.push('?');
        nextRawRow.push('?');
      });

      rows.push(nextRow);
      rawValues.push(nextRawRow);
    });

    entries[atomEntryIndex] = { ...sourceLoop, tags, rows, rawValues };
  }

  const blocks = cif.blocks.slice();
  blocks[blockIndex] = { ...block, entries };
  return { ...cif, blocks };
}

function buildCif(document: CrystalDocument, version: CifVersion, options: CrystalExportOptions): CifDocument {
  const preserveSource = options.preserveCifMetadata !== false && document.cif !== undefined;
  let cif: CifDocument;
  let blockName: string;

  if (preserveSource) {
    cif = { ...document.cif!, version };
    blockName = options.cifBlockName ?? cif.blocks[0]!.name;
    findBlockIndex(cif, blockName);
  } else {
    blockName = safeCifBlockName(options.cifBlockName ?? document.name);
    cif = {
      version,
      blocks: [{ name: blockName, entries: [] }],
      sourceText: '',
    };
  }

  const customTags = document.metadata.customCifTags ?? {};
  for (const [tag, value] of Object.entries(customTags).sort(([left], [right]) => left.localeCompare(right))) {
    cif = setCifScalar(cif, blockName, tag, value);
  }

  if (document.metadata.title !== undefined) cif = setCifScalar(cif, blockName, '_chemical_name_common', document.metadata.title);
  if (document.metadata.description !== undefined) cif = setCifScalar(cif, blockName, '_inmotools_description', document.metadata.description);
  if (document.metadata.creator !== undefined) cif = setCifScalar(cif, blockName, '_inmotools_creator', document.metadata.creator);
  if (document.metadata.provenanceNotes !== undefined) cif = setCifScalar(cif, blockName, '_inmotools_provenance_notes', document.metadata.provenanceNotes);

  const cellTags: readonly [string, number][] = [
    ['_cell_length_a', document.cell.a],
    ['_cell_length_b', document.cell.b],
    ['_cell_length_c', document.cell.c],
    ['_cell_angle_alpha', document.cell.alpha],
    ['_cell_angle_beta', document.cell.beta],
    ['_cell_angle_gamma', document.cell.gamma],
  ];
  for (const [tag, value] of cellTags) cif = setCifScalar(cif, blockName, tag, formatNumber(value));

  return updateAtomLoop(cif, blockName, document.sites);
}

function exportCif(document: CrystalDocument, target: 'cif1' | 'cif2', options: CrystalExportOptions): CrystalExportResult {
  const version: CifVersion = target === 'cif2' ? '2.0' : '1.1';
  const cif = buildCif(document, version, options);
  const text = serializeCif(cif, { version });
  return {
    filename: `${chooseFilenameStem(document, options)}.cif`,
    mime: 'chemical/x-cif;charset=utf-8',
    text,
    diff: computeMetadataDiff(document.cif, cif),
  };
}

function orderedSpecies(document: CrystalDocument): readonly string[] {
  const species = [...new Set(document.sites.map((site) => site.element))];
  return species.sort((left, right) => {
    const leftAtomic = getElementReference(left)?.atomicNumber ?? Number.MAX_SAFE_INTEGER;
    const rightAtomic = getElementReference(right)?.atomicNumber ?? Number.MAX_SAFE_INTEGER;
    return leftAtomic - rightAtomic || left.localeCompare(right);
  });
}

function exportPoscar(document: CrystalDocument, options: CrystalExportOptions): CrystalExportResult {
  if (!document.sites.length) throw new RangeError('POSCAR export requires at least one site.');
  const species = orderedSpecies(document);
  const grouped = species.flatMap((symbol) => document.sites.filter((site) => site.element === symbol));
  const counts = species.map((symbol) => document.sites.filter((site) => site.element === symbol).length);
  const vectors = cellToMatrix(document.cell);
  const lines = [
    document.metadata.title ?? document.name,
    '1.0',
    ...vectors.map((vector) => vector.map(formatNumber).join(' ')),
    species.join(' '),
    counts.join(' '),
    'Direct',
    ...grouped.map((site) => site.fractional.map(formatNumber).join(' ')),
  ];
  return {
    filename: `${chooseFilenameStem(document, options)}.vasp`,
    mime: 'text/plain;charset=utf-8',
    text: `${lines.join('\n')}\n`,
    diff: computeMetadataDiff(document.cif, undefined),
  };
}

function exportXyz(document: CrystalDocument, options: CrystalExportOptions, extended: boolean): CrystalExportResult {
  const vectors = cellToMatrix(document.cell);
  const comment = extended
    ? `Lattice="${vectors.flatMap((vector) => [...vector]).map(formatNumber).join(' ')}" Properties=species:S:1:pos:R:3 pbc="T T T"`
    : (document.metadata.title ?? document.name);
  const atoms = document.sites.map((site) => {
    const cartesian = fractionalToCartesian(site.fractional, document.cell);
    return `${site.element} ${cartesian.map(formatNumber).join(' ')}`;
  });
  return {
    filename: `${chooseFilenameStem(document, options)}.${extended ? 'extxyz' : 'xyz'}`,
    mime: 'chemical/x-xyz;charset=utf-8',
    text: `${[document.sites.length.toString(), comment, ...atoms].join('\n')}\n`,
    diff: computeMetadataDiff(document.cif, undefined),
  };
}

function csvField(value: string): string {
  if (!/[",\r\n]/u.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function exportMeasurements(document: CrystalDocument, options: CrystalExportOptions): CrystalExportResult {
  const measurements = options.measurements ?? [];
  const lines = ['id,kind,label,site_ids,value,unit'];
  for (const measurement of measurements) {
    lines.push([
      measurement.id,
      measurement.kind,
      measurement.label ?? '',
      measurement.siteIds.join(';'),
      formatNumber(measurement.value),
      measurement.unit,
    ].map((value) => csvField(value)).join(','));
  }
  return {
    filename: `${chooseFilenameStem(document, options)}-measurements.csv`,
    mime: 'text/csv;charset=utf-8',
    text: `${lines.join('\r\n')}\r\n`,
    diff: computeMetadataDiff(document.cif, undefined),
  };
}

function exportProject(document: CrystalDocument, options: CrystalExportOptions): CrystalExportResult {
  const text = serializeCrystalProject({
    schema: 'inmotools.crystal-project',
    version: 1,
    document,
    view: options.view ?? DEFAULT_VIEW,
    measurements: options.measurements ?? [],
  });
  return {
    filename: `${chooseFilenameStem(document, options)}.crystal.json`,
    mime: 'application/json;charset=utf-8',
    text,
    diff: computeMetadataDiff(document.cif, document.cif),
  };
}

export function exportCrystal(
  document: CrystalDocument,
  target: CrystalExportTarget,
  options: CrystalExportOptions = defaultExportOptions,
): CrystalExportResult {
  switch (target) {
    case 'cif1':
    case 'cif2':
      return exportCif(document, target, options);
    case 'poscar':
      return exportPoscar(document, options);
    case 'xyz':
      return exportXyz(document, options, false);
    case 'extxyz':
      return exportXyz(document, options, true);
    case 'project':
      return exportProject(document, options);
    case 'measurements-csv':
      return exportMeasurements(document, options);
    default: {
      const unreachable: never = target;
      throw new RangeError(`Unsupported Crystal export target: ${String(unreachable)}`);
    }
  }
}
