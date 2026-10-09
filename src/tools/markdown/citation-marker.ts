import { hasNativeCitationSpace, isEscaped, mapCitationProse } from './citation-source';
import type { ParsedDocument } from './markdown-types';

export interface CitationItem {
  id: string;
  prefix?: string;
  suffix?: string;
  locator?: string;
  label?: string;
  'suppress-author'?: boolean;
}
export interface CitationMarker {
  raw: string;
  keys: string[];
  items: CitationItem[] | null;
}
export type CitationMarkerText = ReadonlyMap<string, readonly string[]>;

const markerPattern = /\[(?:\\.|[^\[\]\\])*\]/g;
const keyPattern = /(-?)@(?:\{([^{}\r\n\u0000]+)\}|([\p{L}\p{N}_]+(?:[:.#$%&+?<>~\/\-][\p{L}\p{N}_]+)*))/gu;
const locatorTerms: [string, string][] = [
  ['book', 'books?|bks?\\.'], ['chapter', 'chapters?|chaps?\\.'],
  ['column', 'columns?|cols?\\.'], ['figure', 'figures?|figs?\\.'],
  ['folio', 'folios?|fols?\\.'], ['number', 'numbers?|nos?\\.'],
  ['line', 'lines?|ll?\\.'], ['note', 'notes?|nn?\\.'],
  ['opus', 'opus|opp?\\.'], ['page', 'pages?|pp?\\.'],
  ['paragraph', 'paragraphs?|paras?\\.|¶¶?'], ['part', 'parts?|pts?\\.'],
  ['section', 'sections?|secs?\\.|§§?'], ['sub-verbo', 'sub verbo|s\\.vv?\\.'],
  ['verse', 'verses?|vv?\\.'], ['volume', 'volumes?|vols?\\.'],
];
const roman = '(?=[ivxlcdm])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})';
const number = `(?:[0-9]+(?:\\.[0-9]+)*|${roman})`;
const range = `${number}(?:\\s*[-–]\\s*${number})?`;
const locatorValue = `${range}(?:\\s*,\\s*${range})*`;
const locatorPattern = new RegExp(`^\\s*,?\\s*(?:(${locatorTerms.map(([, pattern]) => pattern).join('|')})\\s+)?(${locatorValue})(?=$|[\\s,.])`, 'i');

type ProseContext = { start: number; emphasisEnds: ReadonlySet<number> };
type KeyMatch = { index: number; end: number; id: string; suppressed: boolean };

function keysIn(raw: string, offset: number, context: ProseContext): KeyMatch[] {
  const blocked = (index: number) => {
    const last = raw.charCodeAt(index - 1);
    const preceding = raw.slice(Math.max(0, index - (last >= 0xdc00 && last <= 0xdfff ? 2 : 1)), index);
    return /[\p{L}\p{N}]/u.test(preceding)
      || (preceding === '.' && !isEscaped(raw, index - 1))
      || context.emphasisEnds.has(context.start + offset + index);
  };
  const keys: KeyMatch[] = [];
  for (const match of raw.matchAll(keyPattern)) {
    if (match[2] !== undefined && hasNativeCitationSpace(match[2])) continue;
    const at = match.index + match[1].length;
    if (isEscaped(raw, at)) continue;
    // Suppression starts before the hyphen. A blocked or escaped hyphen
    // remains authored prefix text; the following @ can still be eligible.
    const suppressed = Boolean(match[1]) && !isEscaped(raw, match.index) && !blocked(match.index);
    const index = suppressed ? match.index : at;
    if (blocked(index)) continue;
    keys.push({ index, end: match.index + match[0].length, id: match[2] ?? match[3], suppressed });
  }
  return keys;
}

function splitItems(raw: string): { raw: string; offset: number }[] {
  const parts: { raw: string; offset: number }[] = []; let start = 0; let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (isEscaped(raw, i)) continue;
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') depth--;
    else if (raw[i] === ';' && depth === 0) { parts.push({ raw: raw.slice(start, i), offset: start }); start = i + 1; }
  }
  parts.push({ raw: raw.slice(start), offset: start });
  return parts;
}

function parseItem(raw: string, matches: KeyMatch[]): CitationItem | null {
  if (matches.length !== 1) return null;
  const match = matches[0];
  const prefix = raw.slice(0, match.index).trim();
  let suffix = raw.slice(match.end);
  // Complex Markdown and forced/ambiguous locators remain authored rather
  // than being partially interpreted and losing information.
  if (/[\\`*_{}[\]<>~^$|@]/.test(prefix + suffix)) return null;
  const item: CitationItem = { id: match.id };
  if (prefix) item.prefix = prefix + ' ';
  if (match.suppressed) item['suppress-author'] = true;
  const locator = locatorPattern.exec(suffix);
  if (locator) {
    item.locator = locator[2];
    item.label = locator[1]
      ? locatorTerms.find(([, pattern]) => new RegExp(`^(?:${pattern})$`, 'i').test(locator[1]))?.[0]
      : 'page';
    suffix = suffix.slice(locator[0].length);
  }
  if (suffix.trim()) item.suffix = /^\s/.test(suffix) ? ' ' + suffix.trim() : suffix.trim();
  return item;
}

function locatedMarkers(segment: string, context: ProseContext): { offset: number; marker: CitationMarker }[] {
  const markers: { offset: number; marker: CitationMarker }[] = [];
  for (const match of segment.matchAll(markerPattern)) {
    if (isEscaped(segment, match.index)) continue;
    const parts = splitItems(match[0].slice(1, -1)).map(part => ({
      ...part, keys: keysIn(part.raw, match.index + 1 + part.offset, context),
    }));
    // A failed item invalidates the bracketed cluster. Later bare author
    // markers in that source remain outside the preview's supported grammar.
    if (parts.some(part => part.keys.length === 0)) continue;
    const keys = parts.flatMap(part => part.keys.map(key => key.id));
    const items = parts.map(part => parseItem(part.raw, part.keys));
    markers.push({ offset: match.index, marker: { raw: match[0], keys, items: items.every(item => item !== null) ? items : null } });
  }
  return markers;
}

export function markersInProse(segment: string): CitationMarker[] {
  return locatedMarkers(segment, { start: 0, emphasisEnds: new Set() }).map(({ marker }) => marker);
}

export function extractCitationMarkers(source: string, parsed?: ParsedDocument): CitationMarker[] {
  const markers: CitationMarker[] = [];
  mapCitationProse(source, (segment, range) => { markers.push(...locatedMarkers(segment, range).map(({ marker }) => marker)); return segment; }, parsed);
  return markers;
}

export function replaceCitationMarkers(source: string, render: (marker: CitationMarker) => string): string {
  return mapCitationProse(source, (segment, range) => {
    const markers = new Map(locatedMarkers(segment, range).map(({ offset, marker }) => [offset, marker]));
    return segment.replace(markerPattern, (raw: string, offset: number) => {
      const marker = markers.get(offset);
      return marker ? render(marker) : raw;
    });
  });
}
