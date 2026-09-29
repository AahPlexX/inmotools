// Classifies whatever the user typed into the universal search bar.

import { parseDegrees, parseMgrs, parseUtm } from './coords';
import { decode, isFull, isShort } from './olc';
import { CA_POSTAL, isPostalCountry, UK_FULL, UK_OUTWARD } from './postal';
import type { LatLon, QueryKind } from './types';

export type ParsedQuery =
  | { kind: 'empty' }
  | { kind: 'decimal' | 'dms' | 'utm' | 'mgrs' | 'plus-code-full'; point: LatLon; text: string; detail: string }
  | { kind: 'plus-code-short'; code: string; locality: string; text: string }
  | { kind: 'postal'; country: string | null; code: string; text: string }
  | { kind: 'place'; text: string }
  | { kind: 'invalid'; text: string; error: string };

const DECIMAL = /^\s*([+-]?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d{1,3}(?:\.\d+)?)\s*$/;
const PLUS = /^([23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]*)(?:[\s,]+(.+))?$/i;
const MGRS = /^\d{1,2}\s?[C-HJ-NP-X]\s?[A-HJ-NP-Z][A-HJ-NP-V]\s?(?:\d{2}|\d{4}|\d{6}|\d{8}|\d{10}|\d+\s\d+)?$/i;
const UTM = /^\s*\d{1,2}\s*(?:[C-HJ-NP-X]|north|south)?\s*[,\s]\s*\d{6}(?:\.\d+)?\s*(?:m\s*)?E?\s*[,\s]\s*\d{6,7}(?:\.\d+)?\s*(?:m\s*)?N?\s*$/i;
const DEGREE_HINT = /[°º˚′″'"]|\b[NSEW]\b|\d\s*[dD]\s*\d/;
const NUMERIC_POSTAL = /^\d{3,6}(?:[- ]\d{2,4})?$/;

function extractFromUrl(text: string): LatLon | null {
  const geo = /^geo:\s*([+-]?\d+(?:\.\d+)?),\s*([+-]?\d+(?:\.\d+)?)/i.exec(text);
  if (geo) return { lat: Number(geo[1]), lon: Number(geo[2]) };
  if (!/^https?:\/\//i.test(text)) return null;
  const at = /@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/.exec(text);
  if (at) return { lat: Number(at[1]), lon: Number(at[2]) };
  const osm = /#map=\d+(?:\.\d+)?\/([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)/.exec(text);
  if (osm) return { lat: Number(osm[1]), lon: Number(osm[2]) };
  try {
    const url = new URL(text);
    const mlat = url.searchParams.get('mlat') ?? url.searchParams.get('lat');
    const mlon = url.searchParams.get('mlon') ?? url.searchParams.get('lon') ?? url.searchParams.get('lng');
    if (mlat && mlon) return { lat: Number(mlat), lon: Number(mlon) };
    const q = url.searchParams.get('q') ?? url.searchParams.get('ll');
    if (q) { const m = DECIMAL.exec(q); if (m) return { lat: Number(m[1]), lon: Number(m[2]) }; }
  } catch { /* not a URL */ }
  return null;
}

const inRange = (p: LatLon) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

const ALPHANUMERIC_POSTAL_COUNTRIES = new Set(['GB', 'CA', 'GG', 'JE', 'IM', 'NL']);

/** Rejects phrases such as "US Route 66": postal codes are short and mostly digits. */
function looksLikePostalCode(country: string, code: string): boolean {
  const compact = code.replace(/[\s-]/g, '');
  if (!/\d/.test(compact) || compact.length > 10 || !/^[A-Z0-9]+$/.test(compact)) return false;
  const digits = compact.replace(/\D/g, '').length;
  return ALPHANUMERIC_POSTAL_COUNTRIES.has(country) || digits >= compact.length - digits;
}

function postalFrom(text: string): { country: string | null; code: string } | null {
  const compact = text.trim().replace(/\s+/g, ' ');
  const upper = compact.toUpperCase();
  // "US 90210", "US:90210", "US-90210" (country first) or "90210 US", "90210, US" (country last).
  const first = /^([A-Z]{2})\s*[:\-,\s]\s*(.+)$/.exec(upper);
  if (first && isPostalCountry(first[1]) && looksLikePostalCode(first[1], first[2])) return { country: first[1], code: first[2].trim() };
  const last = /^(.+?)\s*[,\s]\s*([A-Z]{2})$/.exec(upper);
  if (last && isPostalCountry(last[2]) && looksLikePostalCode(last[2], last[1])) return { country: last[2], code: last[1].trim() };
  const noSpace = upper.replace(/\s/g, '');
  if (UK_FULL.test(noSpace) || (UK_OUTWARD.test(noSpace) && /[A-Z]/.test(noSpace) && noSpace.length <= 4 && /\d/.test(noSpace))) {
    if (!CA_POSTAL.test(upper)) return { country: 'GB', code: upper };
  }
  if (CA_POSTAL.test(upper) && /^[A-Z]\d[A-Z]/.test(noSpace) && (noSpace.length === 6 || noSpace.length === 3)) return { country: 'CA', code: upper };
  if (NUMERIC_POSTAL.test(upper)) return { country: null, code: upper };
  return null;
}

export function parseQuery(input: string): ParsedQuery {
  const text = input.trim();
  if (!text) return { kind: 'empty' };

  const fromUrl = extractFromUrl(text);
  if (fromUrl) return inRange(fromUrl) ? { kind: 'decimal', point: fromUrl, text, detail: 'Coordinates from link' } : { kind: 'invalid', text, error: 'Link coordinates are out of range' };

  const plus = PLUS.exec(text);
  if (plus) {
    const code = plus[1].toUpperCase();
    if (isFull(code)) {
      const area = decode(code);
      return { kind: 'plus-code-full', point: { lat: area.latitudeCenter, lon: area.longitudeCenter }, text, detail: `Plus Code ${code}` };
    }
    if (isShort(code)) return { kind: 'plus-code-short', code, locality: (plus[2] ?? '').trim(), text };
  }

  const decimal = DECIMAL.exec(text);
  if (decimal) {
    const point = { lat: Number(decimal[1]), lon: Number(decimal[2]) };
    if (inRange(point)) return { kind: 'decimal', point, text, detail: 'Decimal degrees (latitude, longitude)' };
    if (Math.abs(point.lat) <= 180 && Math.abs(point.lon) <= 90) return { kind: 'invalid', text, error: 'Latitude is out of range. Did you enter longitude first? Use “latitude, longitude”.' };
    return { kind: 'invalid', text, error: 'Coordinates are out of range' };
  }

  if (MGRS.test(text)) {
    try {
      const cell = parseMgrs(text);
      return { kind: 'mgrs', point: cell.center, text, detail: `MGRS cell (${cell.precisionMetres} m)` };
    } catch (error) { return { kind: 'invalid', text, error: (error as Error).message }; }
  }

  if (UTM.test(text)) {
    try { return { kind: 'utm', point: parseUtm(text), text, detail: 'UTM (WGS 84)' }; }
    catch (error) { return { kind: 'invalid', text, error: (error as Error).message }; }
  }

  const postal = postalFrom(text);
  if (postal) return { kind: 'postal', country: postal.country, code: postal.code, text };

  if (DEGREE_HINT.test(text) && /\d/.test(text)) {
    try {
      const parsed = parseDegrees(text);
      return { kind: 'dms', point: { lat: parsed.lat, lon: parsed.lon }, text, detail: parsed.format === 'dms' ? 'Degrees, minutes, seconds' : parsed.format === 'ddm' ? 'Degrees and decimal minutes' : 'Decimal degrees with hemispheres' };
    } catch (error) {
      if (/\d{1,3}\s*[°º˚]/.test(text)) return { kind: 'invalid', text, error: (error as Error).message };
    }
  }

  if (text.length < 2) return { kind: 'invalid', text, error: 'Type at least two characters' };
  return { kind: 'place', text };
}

export function queryKindOf(parsed: ParsedQuery): QueryKind {
  if (parsed.kind === 'invalid') return 'place';
  return parsed.kind;
}
