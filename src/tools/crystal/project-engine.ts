import { validateCell } from './cell-engine';
import type { CifDocument, CifLoop, CifScalar } from './cif-engine';
import type {
  CrystalDocument,
  CrystalMetadataState,
  CrystalSite,
  CrystalSourceFormat,
  CrystalTransformRecord,
  ImportedCrystalSnapshot,
  UnitCell,
  Vec3,
} from './crystal-types';

export type CrystalProjection = 'perspective' | 'orthographic';
export type CrystalRepresentation = 'ball-and-stick' | 'space-filling' | 'wireframe' | 'sticks' | 'spheres';
export type CrystalMeasurementKind = 'distance' | 'angle' | 'dihedral';
export type CrystalMeasurementUnit = 'Å' | '°';

export interface CrystalViewState {
  readonly projection: CrystalProjection;
  readonly cameraPosition: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly representation: CrystalRepresentation;
  readonly showCell: boolean;
  readonly showAxes: boolean;
  readonly showBonds: boolean;
  readonly atomScale: number;
  readonly bondScale: number;
  readonly background: string;
}

export interface CrystalMeasurement {
  readonly id: string;
  readonly kind: CrystalMeasurementKind;
  readonly siteIds: readonly string[];
  readonly value: number;
  readonly unit: CrystalMeasurementUnit;
  readonly label?: string;
}

export interface CrystalProjectV1 {
  readonly schema: 'inmotools.crystal-project';
  readonly version: 1;
  readonly document: CrystalDocument;
  readonly view: CrystalViewState;
  readonly measurements: readonly CrystalMeasurement[];
}

const PROJECT_SCHEMA = 'inmotools.crystal-project' as const;
const PROJECT_VERSION = 1 as const;
const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
const MAX_SOURCE_TEXT_BYTES = 25 * 1024 * 1024;
const MAX_SITES = 500_000;
const MAX_MEASUREMENTS = 100_000;
const MAX_CIF_BLOCKS = 10_000;
const MAX_CIF_ENTRIES = 1_000_000;
const MAX_DEPTH = 128;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const SOURCE_FORMATS = new Set<CrystalSourceFormat>([
  'starter', 'empty', 'cif', 'mmcif', 'pdb', 'poscar', 'xyz', 'extxyz', 'project', 'unknown',
]);
const PROJECTIONS = new Set<CrystalProjection>(['perspective', 'orthographic']);
const REPRESENTATIONS = new Set<CrystalRepresentation>(['ball-and-stick', 'space-filling', 'wireframe', 'sticks', 'spheres']);
const MEASUREMENT_KINDS = new Set<CrystalMeasurementKind>(['distance', 'angle', 'dihedral']);

function fail(message: string): never {
  throw new RangeError(`Invalid Crystal project: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(`${path} must be an object.`);
  return value;
}

function stringValue(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) fail(`${path} must be ${allowEmpty ? 'a string' : 'a nonempty string'}.`);
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} must be boolean.`);
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a finite number.`);
  return value;
}

function finiteVec3(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) fail(`${path} must contain exactly three numbers.`);
  return [
    finiteNumber(value[0], `${path}[0]`),
    finiteNumber(value[1], `${path}[1]`),
    finiteNumber(value[2], `${path}[2]`),
  ];
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return stringValue(value, path, true);
}

function scanSafety(value: unknown, path = '$', depth = 0, seen = new WeakSet<object>()): void {
  if (depth > MAX_DEPTH) fail(`${path} exceeds the maximum nesting depth.`);
  if (typeof value === 'number' && !Number.isFinite(value)) fail(`${path} contains a non-finite number.`);
  if (typeof value !== 'object' || value === null) return;
  if (seen.has(value)) fail(`${path} contains a circular reference.`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) scanSafety(value[index], `${path}[${index}]`, depth + 1, seen);
  } else {
    for (const key of Object.keys(value)) {
      if (UNSAFE_KEYS.has(key)) fail(`${path} contains unsafe key "${key}".`);
      scanSafety((value as Record<string, unknown>)[key], `${path}.${key}`, depth + 1, seen);
    }
  }
  seen.delete(value);
}

function validateCellValue(value: unknown, path: string): UnitCell {
  const object = objectValue(value, path);
  const cell: UnitCell = {
    a: finiteNumber(object.a, `${path}.a`),
    b: finiteNumber(object.b, `${path}.b`),
    c: finiteNumber(object.c, `${path}.c`),
    alpha: finiteNumber(object.alpha, `${path}.alpha`),
    beta: finiteNumber(object.beta, `${path}.beta`),
    gamma: finiteNumber(object.gamma, `${path}.gamma`),
  };
  const result = validateCell(cell);
  if (!result.ok) fail(`${path} is not physically valid: ${result.error}`);
  return cell;
}

function validateSite(value: unknown, path: string): CrystalSite {
  const object = objectValue(value, path);
  const occupancy = finiteNumber(object.occupancy, `${path}.occupancy`);
  if (occupancy < 0 || occupancy > 1) fail(`${path}.occupancy must be between 0 and 1.`);
  const isotope = object.isotope === undefined ? undefined : finiteNumber(object.isotope, `${path}.isotope`);
  if (isotope !== undefined && (!Number.isSafeInteger(isotope) || isotope <= 0)) fail(`${path}.isotope must be a positive integer.`);
  const oxidationState = object.oxidationState === undefined ? undefined : finiteNumber(object.oxidationState, `${path}.oxidationState`);
  const uIso = object.uIso === undefined ? undefined : finiteNumber(object.uIso, `${path}.uIso`);

  let uAniso: CrystalSite['uAniso'];
  if (object.uAniso !== undefined) {
    if (!Array.isArray(object.uAniso) || object.uAniso.length !== 6) fail(`${path}.uAniso must contain exactly six finite numbers.`);
    uAniso = [
      finiteNumber(object.uAniso[0], `${path}.uAniso[0]`),
      finiteNumber(object.uAniso[1], `${path}.uAniso[1]`),
      finiteNumber(object.uAniso[2], `${path}.uAniso[2]`),
      finiteNumber(object.uAniso[3], `${path}.uAniso[3]`),
      finiteNumber(object.uAniso[4], `${path}.uAniso[4]`),
      finiteNumber(object.uAniso[5], `${path}.uAniso[5]`),
    ];
  }

  return {
    id: stringValue(object.id, `${path}.id`),
    label: stringValue(object.label, `${path}.label`),
    element: stringValue(object.element, `${path}.element`),
    fractional: finiteVec3(object.fractional, `${path}.fractional`),
    occupancy,
    ...(isotope === undefined ? {} : { isotope }),
    ...(oxidationState === undefined ? {} : { oxidationState }),
    ...(object.disorderAssembly === undefined ? {} : { disorderAssembly: stringValue(object.disorderAssembly, `${path}.disorderAssembly`, true) }),
    ...(object.disorderGroup === undefined ? {} : { disorderGroup: stringValue(object.disorderGroup, `${path}.disorderGroup`, true) }),
    ...(uIso === undefined ? {} : { uIso }),
    ...(uAniso === undefined ? {} : { uAniso }),
    ...(object.notes === undefined ? {} : { notes: stringValue(object.notes, `${path}.notes`, true) }),
  };
}

function validateMetadata(value: unknown, path: string): CrystalMetadataState {
  const object = objectValue(value, path);
  let customCifTags: Readonly<Record<string, string>> | undefined;
  if (object.customCifTags !== undefined) {
    const rawTags = objectValue(object.customCifTags, `${path}.customCifTags`);
    const tags: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [key, rawValue] of Object.entries(rawTags)) tags[key] = stringValue(rawValue, `${path}.customCifTags.${key}`, true);
    customCifTags = tags;
  }
  return {
    ...(object.title === undefined ? {} : { title: stringValue(object.title, `${path}.title`, true) }),
    ...(object.description === undefined ? {} : { description: stringValue(object.description, `${path}.description`, true) }),
    ...(object.creator === undefined ? {} : { creator: stringValue(object.creator, `${path}.creator`, true) }),
    ...(object.provenanceNotes === undefined ? {} : { provenanceNotes: stringValue(object.provenanceNotes, `${path}.provenanceNotes`, true) }),
    ...(customCifTags === undefined ? {} : { customCifTags }),
  };
}

function validateProvenance(value: unknown, path: string): readonly CrystalTransformRecord[] {
  if (!Array.isArray(value)) fail(`${path} must be an array.`);
  return value.map((entry, index): CrystalTransformRecord => {
    const object = objectValue(entry, `${path}[${index}]`);
    const detail = optionalString(object.detail, `${path}[${index}].detail`);
    return {
      kind: stringValue(object.kind, `${path}[${index}].kind`),
      label: stringValue(object.label, `${path}[${index}].label`),
      ...(detail === undefined ? {} : { detail }),
    };
  });
}

function validateSourceFormat(value: unknown, path: string): CrystalSourceFormat {
  const format = stringValue(value, path);
  if (!SOURCE_FORMATS.has(format as CrystalSourceFormat)) fail(`${path} is unsupported: ${format}`);
  return format as CrystalSourceFormat;
}

function validateSnapshot(value: unknown, path: string): ImportedCrystalSnapshot {
  const object = objectValue(value, path);
  if (!Array.isArray(object.sites) || object.sites.length > MAX_SITES) fail(`${path}.sites must be an array within the site limit.`);
  const sourceText = optionalString(object.sourceText, `${path}.sourceText`);
  if (sourceText !== undefined && sourceText.length > MAX_SOURCE_TEXT_BYTES) fail(`${path}.sourceText exceeds the source-text limit.`);
  const sites = object.sites.map((site, index) => validateSite(site, `${path}.sites[${index}]`));
  return {
    name: stringValue(object.name, `${path}.name`),
    sourceFormat: validateSourceFormat(object.sourceFormat, `${path}.sourceFormat`),
    ...(sourceText === undefined ? {} : { sourceText }),
    cell: validateCellValue(object.cell, `${path}.cell`),
    sites,
  };
}

function validateCifScalar(value: unknown, path: string): CifScalar {
  const object = objectValue(value, path);
  if (object.kind !== 'scalar') fail(`${path}.kind must be scalar.`);
  return {
    kind: 'scalar',
    tag: stringValue(object.tag, `${path}.tag`),
    value: stringValue(object.value, `${path}.value`, true),
    rawValue: stringValue(object.rawValue, `${path}.rawValue`, true),
  };
}

function validateCifLoop(value: unknown, path: string): CifLoop {
  const object = objectValue(value, path);
  if (object.kind !== 'loop') fail(`${path}.kind must be loop.`);
  if (!Array.isArray(object.tags) || !Array.isArray(object.rows) || !Array.isArray(object.rawValues)) fail(`${path} loop fields must be arrays.`);
  const tags = object.tags.map((tag, index) => stringValue(tag, `${path}.tags[${index}]`));
  if (tags.length === 0) fail(`${path}.tags cannot be empty.`);
  if (object.rows.length !== object.rawValues.length) fail(`${path} row/raw-value counts must match.`);
  const rows = object.rows.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== tags.length) fail(`${path}.rows[${rowIndex}] width must match tags.`);
    return row.map((item, columnIndex) => stringValue(item, `${path}.rows[${rowIndex}][${columnIndex}]`, true));
  });
  const rawValues = object.rawValues.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== tags.length) fail(`${path}.rawValues[${rowIndex}] width must match tags.`);
    return row.map((item, columnIndex) => stringValue(item, `${path}.rawValues[${rowIndex}][${columnIndex}]`, true));
  });
  return { kind: 'loop', tags, rows, rawValues };
}

function validateCif(value: unknown, path: string): CifDocument {
  const object = objectValue(value, path);
  if (object.version !== '1.1' && object.version !== '2.0') fail(`${path}.version must be 1.1 or 2.0.`);
  if (!Array.isArray(object.blocks) || object.blocks.length === 0 || object.blocks.length > MAX_CIF_BLOCKS) fail(`${path}.blocks must be a nonempty array within the block limit.`);
  let entryCount = 0;
  const blocks = object.blocks.map((rawBlock, blockIndex) => {
    const block = objectValue(rawBlock, `${path}.blocks[${blockIndex}]`);
    if (!Array.isArray(block.entries)) fail(`${path}.blocks[${blockIndex}].entries must be an array.`);
    entryCount += block.entries.length;
    if (entryCount > MAX_CIF_ENTRIES) fail(`${path} exceeds the CIF entry limit.`);
    const entries = block.entries.map((entry, entryIndex) => {
      const entryObject = objectValue(entry, `${path}.blocks[${blockIndex}].entries[${entryIndex}]`);
      return entryObject.kind === 'scalar'
        ? validateCifScalar(entryObject, `${path}.blocks[${blockIndex}].entries[${entryIndex}]`)
        : validateCifLoop(entryObject, `${path}.blocks[${blockIndex}].entries[${entryIndex}]`);
    });
    return { name: stringValue(block.name, `${path}.blocks[${blockIndex}].name`), entries };
  });
  const sourceText = stringValue(object.sourceText, `${path}.sourceText`, true);
  if (sourceText.length > MAX_SOURCE_TEXT_BYTES) fail(`${path}.sourceText exceeds the source-text limit.`);
  return { version: object.version, blocks, sourceText };
}

function validateDocument(value: unknown, path: string): CrystalDocument {
  const object = objectValue(value, path);
  if (object.version !== 1) fail(`${path}.version must be 1.`);
  if (!Array.isArray(object.sites) || object.sites.length > MAX_SITES) fail(`${path}.sites must be an array within the site limit.`);
  const sites = object.sites.map((site, index) => validateSite(site, `${path}.sites[${index}]`));
  const ids = new Set<string>();
  for (const site of sites) {
    if (ids.has(site.id)) fail(`${path}.sites contains duplicate site id ${site.id}.`);
    ids.add(site.id);
  }
  const sourceText = optionalString(object.sourceText, `${path}.sourceText`);
  if (sourceText !== undefined && sourceText.length > MAX_SOURCE_TEXT_BYTES) fail(`${path}.sourceText exceeds the source-text limit.`);
  const importedSnapshot = object.importedSnapshot === undefined ? undefined : validateSnapshot(object.importedSnapshot, `${path}.importedSnapshot`);
  const cif = object.cif === undefined ? undefined : validateCif(object.cif, `${path}.cif`);
  return {
    version: 1,
    id: stringValue(object.id, `${path}.id`),
    name: stringValue(object.name, `${path}.name`),
    sourceFormat: validateSourceFormat(object.sourceFormat, `${path}.sourceFormat`),
    ...(sourceText === undefined ? {} : { sourceText }),
    cell: validateCellValue(object.cell, `${path}.cell`),
    sites,
    ...(importedSnapshot === undefined ? {} : { importedSnapshot }),
    metadata: validateMetadata(object.metadata, `${path}.metadata`),
    provenance: validateProvenance(object.provenance, `${path}.provenance`),
    ...(cif === undefined ? {} : { cif }),
  };
}

function validateView(value: unknown, path: string): CrystalViewState {
  const object = objectValue(value, path);
  const projection = stringValue(object.projection, `${path}.projection`) as CrystalProjection;
  if (!PROJECTIONS.has(projection)) fail(`${path}.projection is unsupported.`);
  const representation = stringValue(object.representation, `${path}.representation`) as CrystalRepresentation;
  if (!REPRESENTATIONS.has(representation)) fail(`${path}.representation is unsupported.`);
  const atomScale = finiteNumber(object.atomScale, `${path}.atomScale`);
  const bondScale = finiteNumber(object.bondScale, `${path}.bondScale`);
  if (atomScale <= 0) fail(`${path}.atomScale must be greater than zero.`);
  if (bondScale <= 0) fail(`${path}.bondScale must be greater than zero.`);
  return {
    projection,
    cameraPosition: finiteVec3(object.cameraPosition, `${path}.cameraPosition`),
    target: finiteVec3(object.target, `${path}.target`),
    up: finiteVec3(object.up, `${path}.up`),
    representation,
    showCell: booleanValue(object.showCell, `${path}.showCell`),
    showAxes: booleanValue(object.showAxes, `${path}.showAxes`),
    showBonds: booleanValue(object.showBonds, `${path}.showBonds`),
    atomScale,
    bondScale,
    background: stringValue(object.background, `${path}.background`),
  };
}

function validateMeasurements(value: unknown, path: string, siteIds: ReadonlySet<string>): readonly CrystalMeasurement[] {
  if (!Array.isArray(value) || value.length > MAX_MEASUREMENTS) fail(`${path} must be an array within the measurement limit.`);
  const ids = new Set<string>();
  return value.map((rawMeasurement, index): CrystalMeasurement => {
    const object = objectValue(rawMeasurement, `${path}[${index}]`);
    const id = stringValue(object.id, `${path}[${index}].id`);
    if (ids.has(id)) fail(`${path} contains duplicate measurement id ${id}.`);
    ids.add(id);
    const kind = stringValue(object.kind, `${path}[${index}].kind`) as CrystalMeasurementKind;
    if (!MEASUREMENT_KINDS.has(kind)) fail(`${path}[${index}].kind is unsupported.`);
    if (!Array.isArray(object.siteIds)) fail(`${path}[${index}].siteIds must be an array.`);
    const expectedCount = kind === 'distance' ? 2 : kind === 'angle' ? 3 : 4;
    if (object.siteIds.length !== expectedCount) fail(`${path}[${index}] ${kind} measurement requires ${expectedCount} site references.`);
    const measurementSiteIds = object.siteIds.map((siteId, siteIndex) => stringValue(siteId, `${path}[${index}].siteIds[${siteIndex}]`));
    for (const siteId of measurementSiteIds) if (!siteIds.has(siteId)) fail(`${path}[${index}] references missing site ${siteId}.`);
    const unit = stringValue(object.unit, `${path}[${index}].unit`) as CrystalMeasurementUnit;
    const expectedUnit: CrystalMeasurementUnit = kind === 'distance' ? 'Å' : '°';
    if (unit !== expectedUnit) fail(`${path}[${index}].unit must be ${expectedUnit} for ${kind}.`);
    const label = optionalString(object.label, `${path}[${index}].label`);
    return {
      id,
      kind,
      siteIds: measurementSiteIds,
      value: finiteNumber(object.value, `${path}[${index}].value`),
      unit,
      ...(label === undefined ? {} : { label }),
    };
  });
}

function validateProject(value: unknown): CrystalProjectV1 {
  scanSafety(value);
  const object = objectValue(value, '$');
  if (object.schema !== PROJECT_SCHEMA) fail(`schema must be ${PROJECT_SCHEMA}.`);
  if (object.version !== PROJECT_VERSION) fail(`unsupported project version ${String(object.version)}; expected ${PROJECT_VERSION}.`);
  const document = validateDocument(object.document, '$.document');
  const view = validateView(object.view, '$.view');
  const measurements = validateMeasurements(object.measurements, '$.measurements', new Set(document.sites.map((site) => site.id)));
  return { schema: PROJECT_SCHEMA, version: PROJECT_VERSION, document, view, measurements };
}

export function serializeCrystalProject(project: CrystalProjectV1): string {
  const validated = validateProject(project);
  return JSON.stringify(validated);
}

export function parseCrystalProject(text: string): CrystalProjectV1 {
  if (typeof text !== 'string' || text.length === 0) fail('project text must be a nonempty string.');
  if (text.length > MAX_PROJECT_BYTES) fail('project exceeds the maximum supported size.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown JSON error';
    throw new SyntaxError(`Invalid Crystal project JSON: ${message}`);
  }
  return validateProject(parsed);
}
