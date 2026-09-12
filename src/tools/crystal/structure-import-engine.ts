import { cartesianToFractional, validateCell } from './cell-engine';
import { parseCif, structureFromCif, type CifBlock, type CifDocument, type CifLoop } from './cif-engine';
import type { CrystalDocument, CrystalSite, CrystalSourceFormat, ImportedCrystalSnapshot, UnitCell, Vec3 } from './crystal-types';

export type CrystalImportFormat = 'cif' | 'mmcif' | 'pdb' | 'poscar' | 'xyz' | 'extxyz';

export interface CrystalImportResult {
  readonly document: CrystalDocument;
  readonly format: CrystalImportFormat;
  readonly warnings: readonly string[];
}

type MutableVec3 = [number, number, number];
type LatticeVectors = readonly [Vec3, Vec3, Vec3];

const DISPLAY_PADDING = 2.5;
const MIN_DISPLAY_LENGTH = 5;

function parseFiniteNumber(value: string | undefined, label: string): number {
  if (value === undefined || value.trim() === '') throw new RangeError(`Missing ${label}.`);
  const parsed = Number(value.replace(/[dD]/, 'e'));
  if (!Number.isFinite(parsed)) throw new RangeError(`Invalid ${label}: ${value}`);
  return parsed;
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) throw new RangeError(`Invalid ${label}: ${value ?? '(missing)'}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RangeError(`Invalid ${label}: ${value}`);
  return parsed;
}

const dot = (left: Vec3, right: Vec3): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const norm = (vector: Vec3): number => Math.hypot(vector[0], vector[1], vector[2]);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function angleDegrees(left: Vec3, right: Vec3): number {
  const denominator = norm(left) * norm(right);
  if (!Number.isFinite(denominator) || denominator <= 0) throw new RangeError('Lattice vectors must have nonzero length.');
  return Math.acos(clamp(dot(left, right) / denominator, -1, 1)) * 180 / Math.PI;
}

function determinant([a, b, c]: LatticeVectors): number {
  return a[0] * (b[1] * c[2] - b[2] * c[1])
    - a[1] * (b[0] * c[2] - b[2] * c[0])
    + a[2] * (b[0] * c[1] - b[1] * c[0]);
}

function vectorsToCell(vectors: LatticeVectors): UnitCell {
  const [a, b, c] = vectors;
  const cell: UnitCell = {
    a: norm(a),
    b: norm(b),
    c: norm(c),
    alpha: angleDegrees(b, c),
    beta: angleDegrees(a, c),
    gamma: angleDegrees(a, b),
  };
  const validation = validateCell(cell);
  if (!validation.ok) throw new RangeError(`Invalid lattice: ${validation.error}`);
  return cell;
}

function normalizeElement(value: string): string {
  const cleaned = value.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  if (!cleaned) return 'X';
  const symbol = cleaned.slice(0, Math.min(cleaned.length, 2));
  return symbol.length === 1
    ? symbol.toUpperCase()
    : `${symbol[0]!.toUpperCase()}${symbol[1]!.toLowerCase()}`;
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'structure';
}

function cloneSites(sites: readonly CrystalSite[]): CrystalSite[] {
  return sites.map((site) => ({ ...site, fractional: [...site.fractional] as Vec3 }));
}

function makeDocument(args: {
  readonly name: string;
  readonly format: CrystalImportFormat;
  readonly sourceText: string;
  readonly cell: UnitCell;
  readonly sites: readonly CrystalSite[];
  readonly cif?: CifDocument;
}): CrystalDocument {
  const snapshot: ImportedCrystalSnapshot = {
    name: args.name,
    sourceFormat: args.format,
    sourceText: args.sourceText,
    cell: { ...args.cell },
    sites: cloneSites(args.sites),
  };
  return {
    version: 1,
    id: `${args.format}-${slug(args.name)}`,
    name: args.name,
    sourceFormat: args.format,
    sourceText: args.sourceText,
    cell: args.cell,
    sites: args.sites,
    importedSnapshot: snapshot,
    metadata: { title: args.name },
    provenance: [{ kind: 'import', label: `Imported ${args.format.toUpperCase()} structure` }],
    ...(args.cif ? { cif: args.cif } : {}),
  };
}

function displayCellForCartesian(cartesian: readonly Vec3[]): { cell: UnitCell; fractional: readonly Vec3[] } {
  if (!cartesian.length) throw new RangeError('A structure must contain at least one atom.');
  const mins: MutableVec3 = [Infinity, Infinity, Infinity];
  const maxs: MutableVec3 = [-Infinity, -Infinity, -Infinity];
  for (const position of cartesian) {
    for (let axis = 0; axis < 3; axis += 1) {
      mins[axis] = Math.min(mins[axis], position[axis]!);
      maxs[axis] = Math.max(maxs[axis], position[axis]!);
    }
  }
  const lengths: MutableVec3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    lengths[axis] = Math.max((maxs[axis] - mins[axis]) + 2 * DISPLAY_PADDING, MIN_DISPLAY_LENGTH);
  }
  const cell: UnitCell = { a: lengths[0], b: lengths[1], c: lengths[2], alpha: 90, beta: 90, gamma: 90 };
  const fractional = cartesian.map((position): Vec3 => [
    (position[0] - mins[0] + DISPLAY_PADDING) / lengths[0],
    (position[1] - mins[1] + DISPLAY_PADDING) / lengths[1],
    (position[2] - mins[2] + DISPLAY_PADDING) / lengths[2],
  ]);
  return { cell, fractional };
}

function readVector(line: string | undefined, label: string): Vec3 {
  const fields = line?.trim().split(/\s+/) ?? [];
  if (fields.length < 3) throw new RangeError(`Missing ${label} lattice vector.`);
  return [
    parseFiniteNumber(fields[0], `${label} x component`),
    parseFiniteNumber(fields[1], `${label} y component`),
    parseFiniteNumber(fields[2], `${label} z component`),
  ];
}

function scalePoscarVectors(rawVectors: LatticeVectors, scaleTokens: readonly number[]): {
  vectors: LatticeVectors;
  cartesianScale: Vec3;
} {
  let factors: Vec3;
  if (scaleTokens.length === 1) {
    const requested = scaleTokens[0]!;
    if (requested === 0) throw new RangeError('POSCAR scale factor cannot be zero.');
    if (requested < 0) {
      const rawVolume = Math.abs(determinant(rawVectors));
      if (!Number.isFinite(rawVolume) || rawVolume <= 0) throw new RangeError('POSCAR lattice has zero volume.');
      const uniform = Math.cbrt(Math.abs(requested) / rawVolume);
      factors = [uniform, uniform, uniform];
    } else {
      factors = [requested, requested, requested];
    }
  } else if (scaleTokens.length === 3) {
    if (!scaleTokens.every((value) => Number.isFinite(value) && value > 0)) {
      throw new RangeError('All three POSCAR axis scale factors must be positive finite numbers.');
    }
    factors = [scaleTokens[0]!, scaleTokens[1]!, scaleTokens[2]!];
  } else {
    throw new RangeError('POSCAR scale line must contain one or three numeric values.');
  }

  const vectors = rawVectors.map((vector): Vec3 => [
    vector[0] * factors[0],
    vector[1] * factors[1],
    vector[2] * factors[2],
  ]) as unknown as LatticeVectors;
  return { vectors, cartesianScale: factors };
}

function parsePoscar(filename: string, text: string): CrystalImportResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length < 8) throw new RangeError('POSCAR is incomplete.');
  const name = lines[0]?.trim() || filename || 'POSCAR structure';
  const scaleFields = lines[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
  const scaleTokens = scaleFields.map((value, index) => parseFiniteNumber(value, `POSCAR scale factor ${index + 1}`));
  const rawVectors: LatticeVectors = [
    readVector(lines[2], 'first'),
    readVector(lines[3], 'second'),
    readVector(lines[4], 'third'),
  ];
  const { vectors, cartesianScale } = scalePoscarVectors(rawVectors, scaleTokens);
  const cell = vectorsToCell(vectors);

  let cursor = 5;
  const firstSpeciesOrCounts = lines[cursor]?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!firstSpeciesOrCounts.length) throw new RangeError('POSCAR species/count line is missing.');

  const warnings: string[] = [];
  const firstLineIsCounts = firstSpeciesOrCounts.every((value) => /^\d+$/.test(value));
  let species: string[];
  let countFields: string[];
  if (firstLineIsCounts) {
    countFields = firstSpeciesOrCounts;
    species = countFields.map(() => 'X');
    warnings.push('POSCAR omits species names; element identities are unavailable without matching POTCAR metadata.');
    cursor += 1;
  } else {
    species = firstSpeciesOrCounts.map(normalizeElement);
    cursor += 1;
    countFields = lines[cursor]?.trim().split(/\s+/).filter(Boolean) ?? [];
    cursor += 1;
  }

  if (!countFields.length || countFields.length !== species.length) {
    throw new RangeError('POSCAR species and atom-count fields do not match.');
  }
  const counts = countFields.map((value, index) => parsePositiveInteger(value, `POSCAR atom count ${index + 1}`));
  const atomCount = counts.reduce((sum, value) => sum + value, 0);
  if (atomCount <= 0) throw new RangeError('POSCAR must contain at least one atom.');

  let selective = false;
  const possibleSelective = lines[cursor]?.trim() ?? '';
  if (/^s/i.test(possibleSelective)) {
    selective = true;
    cursor += 1;
  }
  const coordinateMode = lines[cursor]?.trim() ?? '';
  if (!coordinateMode) throw new RangeError('POSCAR coordinate mode is missing.');
  const cartesianMode = /^[cCkK]/.test(coordinateMode);
  const directMode = /^[dD]/.test(coordinateMode);
  if (!cartesianMode && !directMode) throw new RangeError(`Unsupported POSCAR coordinate mode: ${coordinateMode}`);
  cursor += 1;

  const expandedSpecies: string[] = [];
  counts.forEach((count, speciesIndex) => {
    for (let copy = 0; copy < count; copy += 1) expandedSpecies.push(species[speciesIndex]!);
  });

  const sites: CrystalSite[] = [];
  for (let index = 0; index < atomCount; index += 1) {
    const line = lines[cursor + index];
    const fields = line?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (fields.length < 3) throw new RangeError(`POSCAR position record ${index + 1} is missing or incomplete.`);
    const raw: Vec3 = [
      parseFiniteNumber(fields[0], `POSCAR position ${index + 1} x`),
      parseFiniteNumber(fields[1], `POSCAR position ${index + 1} y`),
      parseFiniteNumber(fields[2], `POSCAR position ${index + 1} z`),
    ];
    const fractional = directMode
      ? raw
      : cartesianToFractional([
          raw[0] * cartesianScale[0],
          raw[1] * cartesianScale[1],
          raw[2] * cartesianScale[2],
        ], cell);
    const element = expandedSpecies[index] ?? 'X';
    const selectiveFlags = selective && fields.length >= 6 ? fields.slice(3, 6).join(' ') : undefined;
    sites.push({
      id: `poscar-site-${index + 1}`,
      label: `${element}${index + 1}`,
      element,
      fractional,
      occupancy: 1,
      ...(selectiveFlags ? { notes: `Selective dynamics: ${selectiveFlags}` } : {}),
    });
  }

  const trailing = lines.slice(cursor + atomCount).some((line) => line.trim() !== '');
  if (trailing) warnings.push('Trailing POSCAR sections after atomic positions were preserved in source text but are not interpreted in Phase 1.');
  return { document: makeDocument({ name, format: 'poscar', sourceText: text, cell, sites }), format: 'poscar', warnings };
}

function parseXyzRows(text: string): {
  count: number;
  comment: string;
  rows: readonly string[][];
} {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const count = parsePositiveInteger(lines[0]?.trim(), 'XYZ atom count');
  if (count <= 0) throw new RangeError('XYZ atom count must be greater than zero.');
  const comment = lines[1] ?? '';
  const records = lines.slice(2).filter((line) => line.trim() !== '');
  if (records.length !== count) throw new RangeError(`XYZ atom count declares ${count} atoms but ${records.length} atom records were found.`);
  return { count, comment, rows: records.map((line) => line.trim().split(/\s+/)) };
}

function parsePlainXyz(filename: string, text: string): CrystalImportResult {
  const { comment, rows } = parseXyzRows(text);
  const cartesian: Vec3[] = [];
  const elements: string[] = [];
  rows.forEach((fields, index) => {
    if (fields.length < 4) throw new RangeError(`XYZ atom record ${index + 1} is incomplete.`);
    elements.push(normalizeElement(fields[0]!));
    cartesian.push([
      parseFiniteNumber(fields[1], `XYZ atom ${index + 1} x coordinate`),
      parseFiniteNumber(fields[2], `XYZ atom ${index + 1} y coordinate`),
      parseFiniteNumber(fields[3], `XYZ atom ${index + 1} z coordinate`),
    ]);
  });
  const { cell, fractional } = displayCellForCartesian(cartesian);
  const sites = fractional.map((position, index): CrystalSite => ({
    id: `xyz-site-${index + 1}`,
    label: `${elements[index]}${index + 1}`,
    element: elements[index]!,
    fractional: position,
    occupancy: 1,
  }));
  const name = comment.trim() || filename || 'XYZ structure';
  return {
    document: makeDocument({ name, format: 'xyz', sourceText: text, cell, sites }),
    format: 'xyz',
    warnings: ['XYZ does not define a periodic lattice; created a nonperiodic display cell around the imported Cartesian coordinates.'],
  };
}

function parseInfoLine(line: string): Map<string, string> {
  const values = new Map<string, string>();
  const expression = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(line)) !== null) values.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  return values;
}

interface ExtProperty {
  readonly name: string;
  readonly type: string;
  readonly count: number;
  readonly start: number;
}

function parseProperties(value: string | undefined): { properties: readonly ExtProperty[]; width: number } | null {
  if (!value) return null;
  const fields = value.split(':');
  if (fields.length % 3 !== 0) throw new RangeError('extXYZ Properties must contain name:type:count triplets.');
  const properties: ExtProperty[] = [];
  let start = 0;
  for (let index = 0; index < fields.length; index += 3) {
    const name = fields[index]?.trim() ?? '';
    const type = fields[index + 1]?.trim() ?? '';
    const count = parsePositiveInteger(fields[index + 2]?.trim(), `extXYZ property width for ${name || '(unnamed)'}`);
    if (!name || !type || count <= 0) throw new RangeError('extXYZ Properties contains an invalid descriptor.');
    properties.push({ name: name.toLowerCase(), type: type.toUpperCase(), count, start });
    start += count;
  }
  return { properties, width: start };
}

function parseExtXyz(filename: string, text: string): CrystalImportResult {
  const { comment, rows } = parseXyzRows(text);
  const info = parseInfoLine(comment);
  const latticeValue = info.get('lattice');
  const propertyInfo = parseProperties(info.get('properties'));
  let vectors: LatticeVectors | null = null;
  let cell: UnitCell | null = null;
  if (latticeValue) {
    const lattice = latticeValue.trim().split(/\s+/).filter(Boolean).map((value, index) => parseFiniteNumber(value, `extXYZ Lattice value ${index + 1}`));
    if (lattice.length !== 9) throw new RangeError(`extXYZ Lattice must contain exactly 9 numbers, found ${lattice.length}.`);
    vectors = [
      [lattice[0]!, lattice[1]!, lattice[2]!],
      [lattice[3]!, lattice[4]!, lattice[5]!],
      [lattice[6]!, lattice[7]!, lattice[8]!],
    ];
    cell = vectorsToCell(vectors);
  }

  let speciesStart = 0;
  let positionStart = 1;
  let expectedWidth: number | null = null;
  if (propertyInfo) {
    expectedWidth = propertyInfo.width;
    const species = propertyInfo.properties.find((property) => property.name === 'species');
    const position = propertyInfo.properties.find((property) => property.name === 'pos' || property.name === 'position');
    if (!species || species.count !== 1) throw new RangeError('extXYZ Properties must provide species:S:1 for structural import.');
    if (!position || position.count !== 3) throw new RangeError('extXYZ Properties must provide pos:R:3 for structural import.');
    speciesStart = species.start;
    positionStart = position.start;
  }

  const cartesian: Vec3[] = [];
  const elements: string[] = [];
  rows.forEach((fields, index) => {
    if (expectedWidth !== null && fields.length !== expectedWidth) {
      throw new RangeError(`extXYZ atom record ${index + 1} has ${fields.length} columns; Properties requires ${expectedWidth}.`);
    }
    if (fields.length <= positionStart + 2) throw new RangeError(`extXYZ atom record ${index + 1} is incomplete.`);
    elements.push(normalizeElement(fields[speciesStart]!));
    cartesian.push([
      parseFiniteNumber(fields[positionStart], `extXYZ atom ${index + 1} x coordinate`),
      parseFiniteNumber(fields[positionStart + 1], `extXYZ atom ${index + 1} y coordinate`),
      parseFiniteNumber(fields[positionStart + 2], `extXYZ atom ${index + 1} z coordinate`),
    ]);
  });

  const warnings: string[] = [];
  let fractional: readonly Vec3[];
  if (cell) {
    fractional = cartesian.map((position) => cartesianToFractional(position, cell!));
  } else {
    const generated = displayCellForCartesian(cartesian);
    cell = generated.cell;
    fractional = generated.fractional;
    warnings.push('extXYZ contains no Lattice metadata; created a nonperiodic display cell around the imported Cartesian coordinates.');
  }
  const sites = fractional.map((position, index): CrystalSite => ({
    id: `extxyz-site-${index + 1}`,
    label: `${elements[index]}${index + 1}`,
    element: elements[index]!,
    fractional: position,
    occupancy: 1,
  }));
  const name = filename || 'extXYZ structure';
  return { document: makeDocument({ name, format: 'extxyz', sourceText: text, cell, sites }), format: 'extxyz', warnings };
}

function pdbElement(line: string, atomName: string): string {
  const explicit = line.length >= 78 ? line.slice(76, 78).trim() : '';
  if (explicit) return normalizeElement(explicit);
  const letters = atomName.replace(/[^A-Za-z]/g, '');
  return normalizeElement(letters.slice(0, 1) || 'X');
}

function parsePdb(filename: string, text: string): CrystalImportResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const cryst1 = lines.find((line) => line.startsWith('CRYST1'));
  let cell: UnitCell | null = null;
  if (cryst1) {
    if (cryst1.length < 54) throw new RangeError('PDB CRYST1 record is incomplete.');
    cell = {
      a: parseFiniteNumber(cryst1.slice(6, 15).trim(), 'PDB CRYST1 a'),
      b: parseFiniteNumber(cryst1.slice(15, 24).trim(), 'PDB CRYST1 b'),
      c: parseFiniteNumber(cryst1.slice(24, 33).trim(), 'PDB CRYST1 c'),
      alpha: parseFiniteNumber(cryst1.slice(33, 40).trim(), 'PDB CRYST1 alpha'),
      beta: parseFiniteNumber(cryst1.slice(40, 47).trim(), 'PDB CRYST1 beta'),
      gamma: parseFiniteNumber(cryst1.slice(47, 54).trim(), 'PDB CRYST1 gamma'),
    };
    const validation = validateCell(cell);
    if (!validation.ok) throw new RangeError(`Invalid PDB CRYST1 cell: ${validation.error}`);
  }

  const atomRecords: { line: string; index: number }[] = [];
  let inFirstModel = true;
  let sawModel = false;
  let completedFirstModel = false;
  let modelCount = 0;
  lines.forEach((line, index) => {
    if (line.startsWith('MODEL ')) {
      modelCount += 1;
      sawModel = true;
      inFirstModel = modelCount === 1;
      return;
    }
    if (line.startsWith('ENDMDL')) {
      if (inFirstModel) completedFirstModel = true;
      inFirstModel = false;
      return;
    }
    if ((line.startsWith('ATOM  ') || line.startsWith('HETATM')) && (!sawModel || (inFirstModel && !completedFirstModel))) {
      atomRecords.push({ line, index });
    }
  });
  if (!atomRecords.length) throw new RangeError('PDB contains no ATOM or HETATM coordinate records.');

  const cartesian: Vec3[] = [];
  const labels: string[] = [];
  const elements: string[] = [];
  const occupancies: number[] = [];
  atomRecords.forEach(({ line, index }, atomIndex) => {
    if (line.length < 54) throw new RangeError(`PDB coordinate record on line ${index + 1} is incomplete.`);
    const atomName = line.slice(12, 16).trim() || `Site${atomIndex + 1}`;
    const position: Vec3 = [
      parseFiniteNumber(line.slice(30, 38).trim(), `PDB ATOM record ${atomIndex + 1} x coordinate`),
      parseFiniteNumber(line.slice(38, 46).trim(), `PDB ATOM record ${atomIndex + 1} y coordinate`),
      parseFiniteNumber(line.slice(46, 54).trim(), `PDB ATOM record ${atomIndex + 1} z coordinate`),
    ];
    const occupancyText = line.length >= 60 ? line.slice(54, 60).trim() : '';
    const occupancy = occupancyText ? parseFiniteNumber(occupancyText, `PDB ATOM record ${atomIndex + 1} occupancy`) : 1;
    if (occupancy < 0 || occupancy > 1) throw new RangeError(`PDB occupancy must be between 0 and 1 on atom record ${atomIndex + 1}.`);
    cartesian.push(position);
    labels.push(atomName);
    elements.push(pdbElement(line, atomName));
    occupancies.push(occupancy);
  });

  const warnings: string[] = [];
  let fractional: readonly Vec3[];
  if (cell) fractional = cartesian.map((position) => cartesianToFractional(position, cell!));
  else {
    const generated = displayCellForCartesian(cartesian);
    cell = generated.cell;
    fractional = generated.fractional;
    warnings.push('PDB contains no CRYST1 lattice; created a nonperiodic display cell around the imported Cartesian coordinates.');
  }
  if (modelCount > 1) warnings.push('PDB contains multiple MODEL records; Phase 1 imports the first model and preserves all models in source text.');

  const sites = fractional.map((position, index): CrystalSite => ({
    id: `pdb-site-${index + 1}`,
    label: labels[index]!,
    element: elements[index]!,
    fractional: position,
    occupancy: occupancies[index]!,
  }));
  const name = filename || 'PDB structure';
  return { document: makeDocument({ name, format: 'pdb', sourceText: text, cell, sites }), format: 'pdb', warnings };
}

const normalizeCifTag = (tag: string): string => tag.toLowerCase().replaceAll('.', '_');

function scalarValues(block: CifBlock): Map<string, string> {
  const values = new Map<string, string>();
  for (const entry of block.entries) if (entry.kind === 'scalar') values.set(normalizeCifTag(entry.tag), entry.value);
  return values;
}

function mmcifCell(block: CifBlock): UnitCell {
  const values = scalarValues(block);
  const cell: UnitCell = {
    a: parseFiniteNumber(values.get('_cell_length_a'), 'mmCIF _cell.length_a'),
    b: parseFiniteNumber(values.get('_cell_length_b'), 'mmCIF _cell.length_b'),
    c: parseFiniteNumber(values.get('_cell_length_c'), 'mmCIF _cell.length_c'),
    alpha: parseFiniteNumber(values.get('_cell_angle_alpha'), 'mmCIF _cell.angle_alpha'),
    beta: parseFiniteNumber(values.get('_cell_angle_beta'), 'mmCIF _cell.angle_beta'),
    gamma: parseFiniteNumber(values.get('_cell_angle_gamma'), 'mmCIF _cell.angle_gamma'),
  };
  const validation = validateCell(cell);
  if (!validation.ok) throw new RangeError(`Invalid mmCIF cell: ${validation.error}`);
  return cell;
}

function findMmcifAtomLoop(block: CifBlock): CifLoop | undefined {
  return block.entries.find((entry): entry is CifLoop => {
    if (entry.kind !== 'loop') return false;
    const tags = entry.tags.map(normalizeCifTag);
    const hasFractional = ['_atom_site_fract_x', '_atom_site_fract_y', '_atom_site_fract_z'].every((tag) => tags.includes(tag));
    const hasCartesian = ['_atom_site_cartn_x', '_atom_site_cartn_y', '_atom_site_cartn_z'].every((tag) => tags.includes(tag));
    return hasFractional || hasCartesian;
  });
}

function optionalCifText(value: string | undefined): string | undefined {
  return value === undefined || value === '.' || value === '?' ? undefined : value;
}

function parseMmcif(filename: string, text: string): CrystalImportResult {
  const cif = parseCif(text);
  const block = cif.blocks[0];
  if (!block) throw new RangeError('mmCIF contains no data block.');
  const cell = mmcifCell(block);
  const loop = findMmcifAtomLoop(block);
  if (!loop) throw new RangeError('mmCIF contains no supported _atom_site fractional or Cartesian coordinate loop.');
  const tags = loop.tags.map(normalizeCifTag);
  const column = (...names: string[]): number => {
    for (const name of names) {
      const index = tags.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const fx = column('_atom_site_fract_x'), fy = column('_atom_site_fract_y'), fz = column('_atom_site_fract_z');
  const cx = column('_atom_site_cartn_x'), cy = column('_atom_site_cartn_y'), cz = column('_atom_site_cartn_z');
  const elementIndex = column('_atom_site_type_symbol');
  const labelIndex = column('_atom_site_label_atom_id', '_atom_site_auth_atom_id', '_atom_site_label', '_atom_site_id');
  const occupancyIndex = column('_atom_site_occupancy');
  const uIsoIndex = column('_atom_site_u_iso_or_equiv');

  const sites = loop.rows.map((row, index): CrystalSite => {
    const label = labelIndex >= 0 ? (optionalCifText(row[labelIndex]) ?? `Site${index + 1}`) : `Site${index + 1}`;
    const element = elementIndex >= 0 ? normalizeElement(optionalCifText(row[elementIndex]) ?? label) : normalizeElement(label);
    const fractional: Vec3 = fx >= 0 && fy >= 0 && fz >= 0
      ? [
          parseFiniteNumber(row[fx], `mmCIF atom ${index + 1} fractional x`),
          parseFiniteNumber(row[fy], `mmCIF atom ${index + 1} fractional y`),
          parseFiniteNumber(row[fz], `mmCIF atom ${index + 1} fractional z`),
        ]
      : cartesianToFractional([
          parseFiniteNumber(row[cx], `mmCIF atom ${index + 1} Cartesian x`),
          parseFiniteNumber(row[cy], `mmCIF atom ${index + 1} Cartesian y`),
          parseFiniteNumber(row[cz], `mmCIF atom ${index + 1} Cartesian z`),
        ], cell);
    const occupancyValue = occupancyIndex >= 0 ? optionalCifText(row[occupancyIndex]) : undefined;
    const occupancy = occupancyValue ? parseFiniteNumber(occupancyValue, `mmCIF atom ${index + 1} occupancy`) : 1;
    if (occupancy < 0 || occupancy > 1) throw new RangeError(`mmCIF occupancy must be between 0 and 1 for ${label}.`);
    const uIsoValue = uIsoIndex >= 0 ? optionalCifText(row[uIsoIndex]) : undefined;
    const uIso = uIsoValue ? parseFiniteNumber(uIsoValue, `mmCIF atom ${index + 1} Uiso`) : undefined;
    return {
      id: `mmcif-site-${index + 1}`,
      label,
      element,
      fractional,
      occupancy,
      ...(uIso === undefined ? {} : { uIso }),
    };
  });
  const scalars = scalarValues(block);
  const name = optionalCifText(scalars.get('_entry_id'))
    ?? optionalCifText(scalars.get('_struct_title'))
    ?? block.name
    ?? filename
    ?? 'mmCIF structure';
  return { document: makeDocument({ name, format: 'mmcif', sourceText: text, cell, sites, cif }), format: 'mmcif', warnings: [] };
}

function importCoreCif(text: string): CrystalImportResult {
  const cif = parseCif(text);
  const document = structureFromCif(cif);
  return { document, format: 'cif', warnings: [] };
}

function looksLikeExtXyz(text: string): boolean {
  const secondLine = text.replace(/\r\n?/g, '\n').split('\n')[1] ?? '';
  return /(?:^|\s)(?:Lattice|Properties)\s*=/i.test(secondLine);
}

function looksLikePoscar(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length < 7) return false;
  const scale = lines[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!(scale.length === 1 || scale.length === 3) || !scale.every((value) => Number.isFinite(Number(value)))) return false;
  return [2, 3, 4].every((index) => {
    const fields = lines[index]?.trim().split(/\s+/).filter(Boolean) ?? [];
    return fields.length >= 3 && fields.slice(0, 3).every((value) => Number.isFinite(Number(value)));
  });
}

export function detectCrystalFormat(filename: string, text: string): CrystalImportFormat {
  const base = filename.trim().split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (base === 'poscar' || base === 'contcar' || base.endsWith('.vasp')) return 'poscar';
  if (base.endsWith('.pdb') || /^(?:ATOM  |HETATM|CRYST1)/m.test(text)) return 'pdb';
  if (base.endsWith('.mmcif') || base.endsWith('.mcif')) return 'mmcif';
  if (base.endsWith('.cif') || /^\s*(?:#\\#CIF_2\.0\s*)?data_/i.test(text)) {
    return /_atom_site\.(?:cartn_[xyz]|group_pdb|label_atom_id|auth_atom_id)/i.test(text) ? 'mmcif' : 'cif';
  }
  if (base.endsWith('.extxyz')) return 'extxyz';
  if (base.endsWith('.xyz')) return looksLikeExtXyz(text) ? 'extxyz' : 'xyz';
  if (looksLikeExtXyz(text)) return 'extxyz';
  if (looksLikePoscar(text)) return 'poscar';
  throw new RangeError(`Unsupported crystal structure format for ${filename || 'unnamed input'}.`);
}

export function importCrystalText(filename: string, text: string): CrystalImportResult {
  if (typeof text !== 'string' || !text.trim()) throw new RangeError('Structure file is empty.');
  const format = detectCrystalFormat(filename, text);
  switch (format) {
    case 'poscar': return parsePoscar(filename, text);
    case 'xyz': return parsePlainXyz(filename, text);
    case 'extxyz': return parseExtXyz(filename, text);
    case 'pdb': return parsePdb(filename, text);
    case 'mmcif': return parseMmcif(filename, text);
    case 'cif': return importCoreCif(text);
    default: {
      const unreachable: never = format;
      throw new RangeError(`Unsupported crystal structure format: ${String(unreachable)}`);
    }
  }
}

export function crystalImportFormatToSourceFormat(format: CrystalImportFormat): CrystalSourceFormat {
  return format;
}
