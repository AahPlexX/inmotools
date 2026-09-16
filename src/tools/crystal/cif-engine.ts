import type { CrystalDocument, CrystalSite, ImportedCrystalSnapshot, UnitCell, Vec3 } from './crystal-types';

export type CifVersion = '1.1' | '2.0';

export interface CifScalar {
  readonly kind: 'scalar';
  readonly tag: string;
  readonly value: string;
  readonly rawValue: string;
}

export interface CifLoop {
  readonly kind: 'loop';
  readonly tags: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly rawValues: readonly (readonly string[])[];
}

export interface CifBlock {
  readonly name: string;
  readonly entries: readonly (CifScalar | CifLoop)[];
}

export interface CifDocument {
  readonly version: CifVersion;
  readonly blocks: readonly CifBlock[];
  readonly sourceText: string;
}

interface Token {
  readonly kind: 'word' | 'quoted' | 'text' | 'compound';
  readonly value: string;
  readonly raw: string;
  readonly line: number;
  readonly column: number;
}

export class CifParseError extends Error {
  constructor(message: string, readonly line: number, readonly column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = 'CifParseError';
  }
}

const isWhitespace = (character: string): boolean => /[ \t\n]/.test(character);
const isWordToken = (token: Token | undefined): token is Token => token?.kind === 'word';

function detectVersion(source: string, hint?: CifVersion): CifVersion {
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const hasCif2Magic = /^#\\#CIF_2\.0(?:[ \t]|\n|$)/.test(withoutBom);
  if (hasCif2Magic) return '2.0';
  if (hint === '2.0') throw new CifParseError('CIF 2.0 requires the #\\#CIF_2.0 magic code', 1, 1);
  return hint ?? '1.1';
}

function tokenizeCif(input: string, version: CifVersion): Token[] {
  const source = input.replace(/\r\n?/g, '\n');
  const tokens: Token[] = [];
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let column = 1;

  const advance = (): string => {
    const character = source[index++] ?? '';
    if (character === '\n') { line += 1; column = 1; }
    else column += 1;
    return character;
  };

  const fail = (message: string, atLine = line, atColumn = column): never => {
    throw new CifParseError(message, atLine, atColumn);
  };

  const scanQuoted = (): Token => {
    const start = index, startLine = line, startColumn = column;
    const quote = source[index]!;
    const triple = version === '2.0' && source.slice(index, index + 3) === quote.repeat(3);
    const delimiterLength = triple ? 3 : 1;
    for (let count = 0; count < delimiterLength; count += 1) advance();
    const valueStart = index;

    while (index < source.length) {
      if (source.slice(index, index + delimiterLength) === quote.repeat(delimiterLength)) {
        if (!triple && version === '1.1') {
          const after = source[index + 1] ?? '';
          if (after && !isWhitespace(after) && after !== '#') { advance(); continue; }
        }
        const value = source.slice(valueStart, index);
        for (let count = 0; count < delimiterLength; count += 1) advance();
        return { kind:'quoted', value, raw:source.slice(start, index), line:startLine, column:startColumn };
      }
      advance();
    }
    return fail('Unterminated quoted CIF value', startLine, startColumn);
  };

  const scanTextField = (): Token => {
    const start = index, startLine = line, startColumn = column;
    advance();
    const valueStart = index;
    while (index < source.length) {
      if (source[index] === '\n' && source[index + 1] === ';') {
        const value = source.slice(valueStart, index);
        advance();
        advance();
        return { kind:'text', value, raw:source.slice(start, index), line:startLine, column:startColumn };
      }
      advance();
    }
    return fail('Unterminated semicolon-delimited CIF text field', startLine, startColumn);
  };

  const skipQuotedInsideCompound = (): void => {
    const quote = source[index]!;
    const triple = source.slice(index, index + 3) === quote.repeat(3);
    const delimiterLength = triple ? 3 : 1;
    for (let count = 0; count < delimiterLength; count += 1) advance();
    while (index < source.length) {
      if (source.slice(index, index + delimiterLength) === quote.repeat(delimiterLength)) {
        for (let count = 0; count < delimiterLength; count += 1) advance();
        return;
      }
      advance();
    }
  };

  const scanCompound = (): Token => {
    const start = index, startLine = line, startColumn = column;
    const stack: string[] = [];
    const openToClose: Record<string,string> = { '[':']', '{':'}' };
    while (index < source.length) {
      const character = source[index]!;
      if (character === '"' || character === "'") { skipQuotedInsideCompound(); continue; }
      if (character === '#') {
        while (index < source.length && source[index] !== '\n') advance();
        continue;
      }
      if (character === '[' || character === '{') { stack.push(openToClose[character]!); advance(); continue; }
      if (character === ']' || character === '}') {
        if (stack.pop() !== character) return fail('Mismatched CIF 2.0 compound delimiter', line, column);
        advance();
        if (!stack.length) {
          const raw = source.slice(start, index);
          return { kind:'compound', value:raw, raw, line:startLine, column:startColumn };
        }
        continue;
      }
      advance();
    }
    return fail('Unterminated CIF 2.0 compound value', startLine, startColumn);
  };

  while (index < source.length) {
    const character = source[index]!;
    if (isWhitespace(character)) { advance(); continue; }
    if (character === '#') {
      while (index < source.length && source[index] !== '\n') advance();
      continue;
    }
    if (character === ';' && column === 1) { tokens.push(scanTextField()); continue; }
    if (character === '"' || character === "'") { tokens.push(scanQuoted()); continue; }
    if (version === '2.0' && (character === '[' || character === '{')) { tokens.push(scanCompound()); continue; }
    if (version === '2.0' && (character === ']' || character === '}')) fail('Unexpected CIF 2.0 compound closing delimiter');

    const start = index, startLine = line, startColumn = column;
    while (index < source.length && !isWhitespace(source[index]!) && source[index] !== '#') advance();
    const raw = source.slice(start, index);
    if (raw) tokens.push({ kind:'word', value:raw, raw, line:startLine, column:startColumn });
  }

  return tokens;
}

const controlWord = (token: Token | undefined): string | null => {
  if (!isWordToken(token)) return null;
  const value = token.value.toLowerCase();
  if (value === 'loop_' || value === 'stop_' || value === 'global_' || value.startsWith('data_') || value.startsWith('save_') || value.startsWith('_')) return value;
  return null;
};

export function parseCif(text: string, versionHint?: CifVersion): CifDocument {
  const version = detectVersion(text, versionHint);
  const tokens = tokenizeCif(text, version);
  const blocks: { name:string; entries:(CifScalar|CifLoop)[] }[] = [];
  let current: { name:string; entries:(CifScalar|CifLoop)[] } | null = null;
  let cursor = 0;

  const failAt = (message: string, token = tokens[cursor] ?? tokens[tokens.length - 1]): never => {
    throw new CifParseError(message, token?.line ?? 1, token?.column ?? 1);
  };

  while (cursor < tokens.length) {
    const token = tokens[cursor]!;
    const lower = isWordToken(token) ? token.value.toLowerCase() : '';

    if (lower.startsWith('data_')) {
      const name = token.value.slice(5);
      if (!name) failAt('CIF data block name cannot be empty', token);
      current = { name, entries:[] };
      blocks.push(current);
      cursor += 1;
      continue;
    }

    if (lower === 'global_' || lower.startsWith('save_')) {
      failAt('This CIF construct is not supported by the structure document parser', token);
    }

    const activeBlock = current;
    if (!activeBlock) {
      throw new CifParseError('CIF data must appear inside a data_ block', token.line, token.column);
    }

    if (lower === 'stop_') { cursor += 1; continue; }

    if (lower === 'loop_') {
      const loopToken = token;
      cursor += 1;
      const tags: string[] = [];
      while (cursor < tokens.length && isWordToken(tokens[cursor]) && tokens[cursor]!.value.startsWith('_')) {
        tags.push(tokens[cursor]!.value);
        cursor += 1;
      }
      if (!tags.length) failAt('CIF loop_ must be followed by at least one data name', loopToken);

      const values: Token[] = [];
      while (cursor < tokens.length && controlWord(tokens[cursor]) === null) {
        values.push(tokens[cursor]!);
        cursor += 1;
      }
      if (values.length % tags.length !== 0) {
        const location = values[values.length - 1] ?? loopToken;
        failAt(`CIF loop has ${values.length} values for ${tags.length} columns`, location);
      }
      const rows: string[][] = [];
      const rawValues: string[][] = [];
      for (let offset = 0; offset < values.length; offset += tags.length) {
        const row = values.slice(offset, offset + tags.length);
        rows.push(row.map((item) => item.value));
        rawValues.push(row.map((item) => item.raw));
      }
      activeBlock.entries.push({ kind:'loop', tags, rows, rawValues });
      continue;
    }

    if (isWordToken(token) && token.value.startsWith('_')) {
      const valueToken = tokens[cursor + 1];
      if (!valueToken || controlWord(valueToken) !== null) failAt(`Missing value for CIF data name ${token.value}`, token);
      activeBlock.entries.push({ kind:'scalar', tag:token.value, value:valueToken.value, rawValue:valueToken.raw });
      cursor += 2;
      continue;
    }

    failAt(`Unexpected CIF token ${token.raw}`, token);
  }

  if (!blocks.length) throw new CifParseError('CIF contains no data_ block', 1, 1);
  return { version, blocks, sourceText:text };
}

const emitScalar = (entry: CifScalar): string =>
  entry.rawValue.startsWith(';') ? `${entry.tag}\n${entry.rawValue}\n` : `${entry.tag} ${entry.rawValue}\n`;

export function serializeCif(document: CifDocument, options: { version?: CifVersion; blockName?: string } = {}): string {
  const version = options.version ?? document.version;
  const blocks = options.blockName ? document.blocks.filter((block) => block.name === options.blockName) : document.blocks;
  if (!blocks.length) throw new RangeError('No matching CIF data block to serialize.');

  let output = version === '2.0' ? '#\\#CIF_2.0\n' : '';
  for (const block of blocks) {
    output += `data_${block.name}\n`;
    for (const entry of block.entries) {
      if (entry.kind === 'scalar') { output += emitScalar(entry); continue; }
      output += 'loop_\n';
      for (const tag of entry.tags) output += `${tag}\n`;
      for (const row of entry.rawValues) {
        if (row.some((value) => value.startsWith(';'))) output += `${row.join('\n')}\n`;
        else output += `${row.join(' ')}\n`;
      }
    }
  }
  return output;
}

const normalizeTag = (tag: string): string => tag.toLowerCase().replaceAll('.', '_');

const parseNumeric = (value: string | undefined, label: string, required = true): number | undefined => {
  if (value === undefined || value === '.' || value === '?') {
    if (required) throw new RangeError(`Missing required CIF value ${label}.`);
    return undefined;
  }
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?)(?:\(\d+\))?$/.exec(value.trim());
  if (!match) throw new RangeError(`Invalid numeric CIF value for ${label}: ${value}`);
  const parsed = Number(match[1]!.replace(/[dD]/, 'e'));
  if (!Number.isFinite(parsed)) throw new RangeError(`Non-finite CIF value for ${label}.`);
  return parsed;
};

const cleanOptionalText = (value: string | undefined): string | undefined =>
  value === undefined || value === '.' || value === '?' ? undefined : value;

function scalarMap(block: CifBlock): Map<string,string> {
  const map = new Map<string,string>();
  for (const entry of block.entries) if (entry.kind === 'scalar') map.set(normalizeTag(entry.tag), entry.value);
  return map;
}

function findAtomLoop(block: CifBlock): CifLoop | undefined {
  return block.entries.find((entry): entry is CifLoop => {
    if (entry.kind !== 'loop') return false;
    const tags = entry.tags.map(normalizeTag);
    return tags.includes('_atom_site_fract_x') && tags.includes('_atom_site_fract_y') && tags.includes('_atom_site_fract_z');
  });
}

const titleFor = (scalars: Map<string,string>, block: CifBlock): string =>
  cleanOptionalText(scalars.get('_chemical_name_common'))
  ?? cleanOptionalText(scalars.get('_chemical_name_systematic'))
  ?? `${block.name} (CIF)`;

export function structureFromCif(cif: CifDocument, blockName?: string): CrystalDocument {
  const block = blockName ? cif.blocks.find((candidate) => candidate.name === blockName) : cif.blocks[0];
  if (!block) throw new RangeError(`CIF data block not found: ${blockName ?? '(first block)'}`);
  const scalars = scalarMap(block);
  const cell: UnitCell = {
    a:parseNumeric(scalars.get('_cell_length_a'), '_cell_length_a')!,
    b:parseNumeric(scalars.get('_cell_length_b'), '_cell_length_b')!,
    c:parseNumeric(scalars.get('_cell_length_c'), '_cell_length_c')!,
    alpha:parseNumeric(scalars.get('_cell_angle_alpha'), '_cell_angle_alpha')!,
    beta:parseNumeric(scalars.get('_cell_angle_beta'), '_cell_angle_beta')!,
    gamma:parseNumeric(scalars.get('_cell_angle_gamma'), '_cell_angle_gamma')!,
  };

  const atomLoop = findAtomLoop(block);
  const sites: CrystalSite[] = [];
  if (atomLoop) {
    const tags = atomLoop.tags.map(normalizeTag);
    const column = (name: string): number => tags.indexOf(name);
    const xIndex = column('_atom_site_fract_x'), yIndex = column('_atom_site_fract_y'), zIndex = column('_atom_site_fract_z');
    const labelIndex = column('_atom_site_label'), typeIndex = column('_atom_site_type_symbol');
    const occupancyIndex = column('_atom_site_occupancy'), uIsoIndex = column('_atom_site_u_iso_or_equiv');
    const assemblyIndex = column('_atom_site_disorder_assembly'), groupIndex = column('_atom_site_disorder_group');

    atomLoop.rows.forEach((row, rowIndex) => {
      const label = labelIndex >= 0 ? row[labelIndex]! : `Site${rowIndex + 1}`;
      const rawElement = typeIndex >= 0 ? row[typeIndex] : undefined;
      const inferred = /^[A-Za-z]{1,2}/.exec(label)?.[0] ?? 'X';
      const elementSource = cleanOptionalText(rawElement) ?? inferred;
      const element = elementSource.length > 1 ? elementSource[0]!.toUpperCase() + elementSource.slice(1).toLowerCase() : elementSource.toUpperCase();
      const fractional: Vec3 = [
        parseNumeric(row[xIndex], '_atom_site_fract_x')!,
        parseNumeric(row[yIndex], '_atom_site_fract_y')!,
        parseNumeric(row[zIndex], '_atom_site_fract_z')!,
      ];
      const occupancy = occupancyIndex >= 0 ? (parseNumeric(row[occupancyIndex], '_atom_site_occupancy', false) ?? 1) : 1;
      if (occupancy < 0 || occupancy > 1) throw new RangeError(`Invalid occupancy for ${label}: ${occupancy}`);
      const uIso = uIsoIndex >= 0 ? parseNumeric(row[uIsoIndex], '_atom_site_U_iso_or_equiv', false) : undefined;
      sites.push({
        id:`cif-${block.name}-site-${rowIndex + 1}`,
        label,
        element,
        fractional,
        occupancy,
        ...(uIso === undefined ? {} : { uIso }),
        ...(assemblyIndex < 0 ? {} : { disorderAssembly:cleanOptionalText(row[assemblyIndex]) }),
        ...(groupIndex < 0 ? {} : { disorderGroup:cleanOptionalText(row[groupIndex]) }),
      });
    });
  }

  const name = titleFor(scalars, block);
  const snapshot: ImportedCrystalSnapshot = {
    name,
    sourceFormat:'cif',
    sourceText:cif.sourceText,
    cell:{ ...cell },
    sites:sites.map((site) => ({ ...site, fractional:[...site.fractional] as Vec3 })),
  };
  return {
    version:1,
    id:`cif-${block.name}`,
    name,
    sourceFormat:'cif',
    sourceText:cif.sourceText,
    cell,
    sites,
    importedSnapshot:snapshot,
    metadata:{ title:name },
    provenance:[{ kind:'import', label:`Imported CIF data block ${block.name}` }],
    cif,
  };
}
