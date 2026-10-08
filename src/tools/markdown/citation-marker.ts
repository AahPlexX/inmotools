import { isEscaped, mapCitationProse } from './citation-source';
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

function keysIn(raw: string): RegExpExecArray[] {
  return [...raw.matchAll(keyPattern)].filter(match => !isEscaped(raw, match.index + match[1].length));
}

function splitItems(raw: string): string[] {
  const parts: string[] = []; let start = 0; let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (isEscaped(raw, i)) continue;
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') depth--;
    else if (raw[i] === ';' && depth === 0) { parts.push(raw.slice(start, i)); start = i + 1; }
  }
  parts.push(raw.slice(start));
  return parts;
}

function parseItem(raw: string): CitationItem | null {
  const matches = keysIn(raw);
  if (matches.length !== 1) return null;
  const match = matches[0];
  const prefix = raw.slice(0, match.index).trim();
  let suffix = raw.slice(match.index + match[0].length);
  // Complex Markdown and forced/ambiguous locators remain authored rather
  // than being partially interpreted and losing information.
  if (/[\\`*_{}[\]<>~^$|@]/.test(prefix + suffix)) return null;
  const item: CitationItem = { id: match[2] ?? match[3] };
  if (prefix) item.prefix = prefix + ' ';
  if (match[1]) item['suppress-author'] = true;
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

export function markersInProse(segment: string): CitationMarker[] {
  const markers: CitationMarker[] = [];
  for (const match of segment.matchAll(markerPattern)) {
    if (isEscaped(segment, match.index)) continue;
    const keys = keysIn(match[0]).map(key => key[2] ?? key[3]);
    if (!keys.length) continue;
    const items = splitItems(match[0].slice(1, -1)).map(parseItem);
    markers.push({ raw: match[0], keys, items: items.every(item => item !== null) ? items : null });
  }
  return markers;
}

export function extractCitationMarkers(source: string, parsed?: ParsedDocument): CitationMarker[] {
  const markers: CitationMarker[] = [];
  mapCitationProse(source, segment => { markers.push(...markersInProse(segment)); return segment; }, parsed);
  return markers;
}

export function replaceCitationMarkers(source: string, render: (marker: CitationMarker) => string): string {
  return mapCitationProse(source, segment => {
    const markers = markersInProse(segment);
    let index = 0;
    return segment.replace(markerPattern, (raw: string, offset: number) => {
      if (isEscaped(segment, offset) || !keysIn(raw).length) return raw;
      return render(markers[index++]);
    });
  });
}
