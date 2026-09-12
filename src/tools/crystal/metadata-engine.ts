import type { CifBlock, CifDocument, CifLoop, CifScalar, CifVersion } from './cif-engine';
import type { CrystalDocument, CrystalMetadataState } from './crystal-types';

export interface MetadataDiff {
  readonly preserved: readonly string[];
  readonly changed: readonly string[];
  readonly generated: readonly string[];
  readonly omitted: readonly string[];
}

const normalizeTag = (tag: string): string => tag.trim().toLowerCase().replaceAll('.', '_');

function assertTag(tag: string): string {
  const trimmed = tag.trim();
  if (!/^_[^\s#'";]+$/u.test(trimmed)) {
    throw new RangeError(`Invalid CIF data name: ${tag}`);
  }
  return trimmed;
}

const isReservedBareValue = (value: string): boolean => {
  const lower = value.toLowerCase();
  return value === ''
    || value === '.'
    || value === '?'
    || value.startsWith('_')
    || value.startsWith('#')
    || lower === 'loop_'
    || lower === 'stop_'
    || lower === 'global_'
    || lower.startsWith('data_')
    || lower.startsWith('save_');
};

export function encodeCifValue(value: string, version: CifVersion): string {
  if (!value.includes('\n') && !/[\s'"#;]/u.test(value) && !isReservedBareValue(value)) return value;
  if (!value.includes('\n') && !value.includes("'")) return `'${value}'`;
  if (!value.includes('\n') && !value.includes('"')) return `"${value}"`;

  if (version === '2.0' && !value.includes("'''")) return `'''${value}'''`;
  if (version === '2.0' && !value.includes('"""')) return `"""${value}"""`;

  const safe = value.replace(/\n;/gu, '\n ;');
  return `;\n${safe}\n;`;
}

function findBlockIndex(cif: CifDocument, blockName: string): number {
  const exact = cif.blocks.findIndex((block) => block.name === blockName);
  if (exact >= 0) return exact;
  const folded = blockName.toLowerCase();
  const insensitive = cif.blocks.findIndex((block) => block.name.toLowerCase() === folded);
  if (insensitive >= 0) return insensitive;
  throw new RangeError(`CIF data block not found: ${blockName}`);
}

function replaceBlock(cif: CifDocument, blockIndex: number, block: CifBlock): CifDocument {
  const blocks = cif.blocks.slice();
  blocks[blockIndex] = block;
  return { ...cif, blocks };
}

export function setCifScalar(cif: CifDocument, blockName: string, tag: string, value: string): CifDocument {
  const validTag = assertTag(tag);
  const blockIndex = findBlockIndex(cif, blockName);
  const block = cif.blocks[blockIndex]!;
  const normalized = normalizeTag(validTag);
  const rawValue = encodeCifValue(value, cif.version);
  let found = false;

  const entries = block.entries.map((entry): CifScalar | CifLoop => {
    if (entry.kind !== 'scalar' || normalizeTag(entry.tag) !== normalized) return entry;
    found = true;
    return { ...entry, tag: validTag, value, rawValue };
  });

  if (!found) entries.push({ kind: 'scalar', tag: validTag, value, rawValue });
  return replaceBlock(cif, blockIndex, { ...block, entries });
}

export function removeCifTag(cif: CifDocument, blockName: string, tag: string): CifDocument {
  const validTag = assertTag(tag);
  const blockIndex = findBlockIndex(cif, blockName);
  const block = cif.blocks[blockIndex]!;
  const normalized = normalizeTag(validTag);
  const entries: (CifScalar | CifLoop)[] = [];

  for (const entry of block.entries) {
    if (entry.kind === 'scalar') {
      if (normalizeTag(entry.tag) !== normalized) entries.push(entry);
      continue;
    }

    const removeIndex = entry.tags.findIndex((candidate) => normalizeTag(candidate) === normalized);
    if (removeIndex < 0) {
      entries.push(entry);
      continue;
    }
    if (entry.tags.length === 1) continue;

    entries.push({
      ...entry,
      tags: entry.tags.filter((_, index) => index !== removeIndex),
      rows: entry.rows.map((row) => row.filter((_, index) => index !== removeIndex)),
      rawValues: entry.rawValues.map((row) => row.filter((_, index) => index !== removeIndex)),
    });
  }

  return replaceBlock(cif, blockIndex, { ...block, entries });
}

export function setCifLoopCell(
  cif: CifDocument,
  blockName: string,
  loopIndex: number,
  rowIndex: number,
  tag: string,
  value: string,
): CifDocument {
  if (!Number.isSafeInteger(loopIndex) || loopIndex < 0) throw new RangeError('CIF loop index must be a non-negative integer.');
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0) throw new RangeError('CIF row index must be a non-negative integer.');
  const validTag = assertTag(tag);
  const blockIndex = findBlockIndex(cif, blockName);
  const block = cif.blocks[blockIndex]!;
  const loopEntryIndexes = block.entries.flatMap((entry, index) => entry.kind === 'loop' ? [index] : []);
  const entryIndex = loopEntryIndexes[loopIndex];
  if (entryIndex === undefined) throw new RangeError(`CIF loop index is out of range: ${loopIndex}`);

  const loop = block.entries[entryIndex];
  if (!loop || loop.kind !== 'loop') throw new RangeError(`CIF loop index is out of range: ${loopIndex}`);
  if (rowIndex >= loop.rows.length) throw new RangeError(`CIF row index is out of range: ${rowIndex}`);
  const columnIndex = loop.tags.findIndex((candidate) => normalizeTag(candidate) === normalizeTag(validTag));
  if (columnIndex < 0) throw new RangeError(`CIF loop does not contain data name ${validTag}.`);

  const rows = loop.rows.map((row) => row.slice());
  const rawValues = loop.rawValues.map((row) => row.slice());
  rows[rowIndex]![columnIndex] = value;
  rawValues[rowIndex]![columnIndex] = encodeCifValue(value, cif.version);

  const entries = block.entries.slice();
  entries[entryIndex] = { ...loop, rows, rawValues };
  return replaceBlock(cif, blockIndex, { ...block, entries });
}

export function setExportMetadata(document: CrystalDocument, patch: Partial<CrystalMetadataState>): CrystalDocument {
  const customCifTags = patch.customCifTags === undefined
    ? document.metadata.customCifTags
    : { ...patch.customCifTags };
  const metadata: CrystalMetadataState = {
    ...document.metadata,
    ...patch,
    ...(customCifTags === undefined ? {} : { customCifTags }),
  };
  return {
    ...document,
    metadata,
    provenance: [...document.provenance, { kind: 'metadata-edit', label: 'Edited export metadata' }],
  };
}

interface TagSnapshot {
  readonly display: string;
  readonly signatures: readonly string[];
}

function collectTags(cif: CifDocument | undefined): Map<string, TagSnapshot> {
  const byTag = new Map<string, { display: string; signatures: string[] }>();
  if (!cif) return new Map();

  const add = (tag: string, signature: string): void => {
    const normalized = normalizeTag(tag);
    const current = byTag.get(normalized) ?? { display: normalized, signatures: [] };
    current.signatures.push(signature);
    byTag.set(normalized, current);
  };

  for (const block of cif.blocks) {
    for (const entry of block.entries) {
      if (entry.kind === 'scalar') {
        add(entry.tag, JSON.stringify(['scalar', block.name, entry.value]));
        continue;
      }
      entry.tags.forEach((tag, columnIndex) => {
        const values = entry.rows.map((row) => row[columnIndex] ?? '');
        add(tag, JSON.stringify(['loop', block.name, values]));
      });
    }
  }

  const result = new Map<string, TagSnapshot>();
  for (const [tag, snapshot] of byTag) {
    result.set(tag, { display: snapshot.display, signatures: snapshot.signatures.slice().sort() });
  }
  return result;
}

export function computeMetadataDiff(source: CifDocument | undefined, output: CifDocument | undefined): MetadataDiff {
  const before = collectTags(source);
  const after = collectTags(output);
  const tags = new Set([...before.keys(), ...after.keys()]);
  const preserved: string[] = [];
  const changed: string[] = [];
  const generated: string[] = [];
  const omitted: string[] = [];

  for (const tag of tags) {
    const sourceSnapshot = before.get(tag);
    const outputSnapshot = after.get(tag);
    if (sourceSnapshot && outputSnapshot) {
      const same = JSON.stringify(sourceSnapshot.signatures) === JSON.stringify(outputSnapshot.signatures);
      (same ? preserved : changed).push(outputSnapshot.display);
    } else if (outputSnapshot) {
      generated.push(outputSnapshot.display);
    } else if (sourceSnapshot) {
      omitted.push(sourceSnapshot.display);
    }
  }

  const sort = (values: string[]): readonly string[] => values.sort((left, right) => left.localeCompare(right));
  return {
    preserved: sort(preserved),
    changed: sort(changed),
    generated: sort(generated),
    omitted: sort(omitted),
  };
}
