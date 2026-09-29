// Coordinate parsing and formatting: decimal degrees, DMS, DDM, UTM and MGRS on
// WGS 84. UTM uses the Krüger n-series (3rd order, sub-millimetre inside a zone).

import type { LatLon } from './types';

const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const N = F / (2 - F);
const E = (2 * Math.sqrt(N)) / (1 + N);
const AA = (A / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64);
const ALPHA = [N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16, (13 * N ** 2) / 48 - (3 * N ** 3) / 5, (61 * N ** 3) / 240];
const BETA = [N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96, N ** 2 / 48 + N ** 3 / 15, (17 * N ** 3) / 480];
const DELTA = [2 * N - (2 * N ** 2) / 3 - 2 * N ** 3, (7 * N ** 2) / 3 - (8 * N ** 3) / 5, (56 * N ** 3) / 15];

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export interface Utm {
  zone: number;
  hemisphere: 'N' | 'S';
  easting: number;
  northing: number;
  band: string;
}

const BANDS = 'CDEFGHJKLMNPQRSTUVWX';

export function latitudeBand(lat: number): string {
  if (lat < -80 || lat > 84) throw new Error('UTM/MGRS covers latitudes 80°S to 84°N; polar regions use UPS');
  return BANDS.charAt(Math.min(19, Math.floor((lat + 80) / 8)));
}

export function utmZone(lat: number, lon: number): number {
  let zone = Math.floor((lon + 180) / 6) + 1;
  if (zone > 60) zone = 60;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) zone = 31;
    else if (lon >= 9 && lon < 21) zone = 33;
    else if (lon >= 21 && lon < 33) zone = 35;
    else if (lon >= 33 && lon < 42) zone = 37;
  }
  return zone;
}

export function toUtm(point: LatLon, forceZone?: number): Utm {
  const band = latitudeBand(point.lat);
  const zone = forceZone ?? utmZone(point.lat, point.lon);
  const λ0 = toRad((zone - 1) * 6 - 180 + 3);
  const φ = toRad(point.lat);
  const λ = toRad(point.lon) - λ0;
  const t = Math.sinh(Math.atanh(Math.sin(φ)) - E * Math.atanh(E * Math.sin(φ)));
  const ξp = Math.atan2(t, Math.cos(λ));
  const ηp = Math.atanh(Math.sin(λ) / Math.sqrt(1 + t * t));
  let ξ = ξp; let η = ηp;
  for (let j = 1; j <= 3; j += 1) {
    ξ += ALPHA[j - 1] * Math.sin(2 * j * ξp) * Math.cosh(2 * j * ηp);
    η += ALPHA[j - 1] * Math.cos(2 * j * ξp) * Math.sinh(2 * j * ηp);
  }
  const easting = 500_000 + K0 * AA * η;
  let northing = K0 * AA * ξ;
  const hemisphere = point.lat < 0 ? 'S' : 'N';
  if (hemisphere === 'S') northing += 10_000_000;
  return { zone, hemisphere, easting, northing, band };
}

export function fromUtm(zone: number, hemisphere: 'N' | 'S', easting: number, northing: number): LatLon {
  if (zone < 1 || zone > 60) throw new Error('UTM zone must be 1–60');
  const λ0 = toRad((zone - 1) * 6 - 180 + 3);
  const ξ = (northing - (hemisphere === 'S' ? 10_000_000 : 0)) / (K0 * AA);
  const η = (easting - 500_000) / (K0 * AA);
  let ξp = ξ; let ηp = η;
  for (let j = 1; j <= 3; j += 1) {
    ξp -= BETA[j - 1] * Math.sin(2 * j * ξ) * Math.cosh(2 * j * η);
    ηp -= BETA[j - 1] * Math.cos(2 * j * ξ) * Math.sinh(2 * j * η);
  }
  const χ = Math.asin(Math.sin(ξp) / Math.cosh(ηp));
  let φ = χ;
  for (let j = 1; j <= 3; j += 1) φ += DELTA[j - 1] * Math.sin(2 * j * χ);
  const λ = λ0 + Math.atan2(Math.sinh(ηp), Math.cos(ξp));
  return { lat: toDeg(φ), lon: ((toDeg(λ) + 540) % 360) - 180 };
}

const COLUMN_SETS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
const ROW_LETTERS = 'ABCDEFGHJKLMNPQRSTUV';

/** MGRS string with `digits` per axis (0–5). 5 = 1 m, 4 = 10 m, 3 = 100 m … */
export function toMgrs(point: LatLon, digits = 5): string {
  if (!Number.isInteger(digits) || digits < 0 || digits > 5) throw new Error('MGRS precision must be 0–5 digits');
  const utm = toUtm(point);
  const column = Math.floor(utm.easting / 100_000);
  const columnLetter = COLUMN_SETS[(utm.zone - 1) % 3].charAt(column - 1);
  const row = Math.floor(utm.northing / 100_000) % 20;
  const rowLetter = ROW_LETTERS.charAt((row + (utm.zone % 2 === 0 ? 5 : 0)) % 20);
  const scale = 10 ** (5 - digits);
  const e = Math.floor((utm.easting % 100_000) / scale).toString().padStart(digits, '0');
  const n = Math.floor((utm.northing % 100_000) / scale).toString().padStart(digits, '0');
  return `${utm.zone}${utm.band}${columnLetter}${rowLetter}${digits ? e + n : ''}`;
}

export interface MgrsCell {
  southWest: LatLon;
  center: LatLon;
  precisionMetres: number;
}

export function parseMgrs(input: string): MgrsCell {
  const text = input.replace(/\s+/g, '').toUpperCase();
  const match = /^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/.exec(text);
  if (!match) throw new Error('Not an MGRS reference');
  const zone = Number(match[1]);
  const band = match[2];
  const digitsText = match[5];
  if (zone < 1 || zone > 60) throw new Error('MGRS zone must be 1–60');
  if (digitsText.length % 2 !== 0 || digitsText.length > 10) throw new Error('MGRS needs an even number of digits (0–10)');
  const half = digitsText.length / 2;
  const precisionMetres = 10 ** (5 - half);
  const columnIndex = COLUMN_SETS[(zone - 1) % 3].indexOf(match[3]);
  if (columnIndex < 0) throw new Error(`Column letter ${match[3]} is not used in zone ${zone}`);
  const rowIndexRaw = ROW_LETTERS.indexOf(match[4]);
  const rowIndex = (rowIndexRaw - (zone % 2 === 0 ? 5 : 0) + 20) % 20;
  const e = half ? Number(digitsText.slice(0, half)) * precisionMetres : 0;
  const n = half ? Number(digitsText.slice(half)) * precisionMetres : 0;
  const easting = (columnIndex + 1) * 100_000 + e;
  const bandIndex = BANDS.indexOf(band);
  const bandSouth = -80 + bandIndex * 8;
  const bandNorth = band === 'X' ? 84 : bandSouth + 8;
  const hemisphere = bandIndex >= BANDS.indexOf('N') ? 'N' : 'S';
  const northingBase = rowIndex * 100_000 + n;
  // The 100 km row letters repeat every 2,000 km; choose the cycle whose
  // latitude falls inside the band.
  for (let cycle = 0; cycle < 6; cycle += 1) {
    const northing = northingBase + cycle * 2_000_000;
    const sw = fromUtm(zone, hemisphere, easting, northing);
    if (sw.lat >= bandSouth - 0.5 && sw.lat < bandNorth + 0.5) {
      const center = fromUtm(zone, hemisphere, easting + precisionMetres / 2, northing + precisionMetres / 2);
      return { southWest: sw, center, precisionMetres };
    }
  }
  throw new Error('MGRS reference does not fall inside its latitude band');
}

export function parseUtm(input: string): LatLon {
  const match = /^\s*(\d{1,2})\s*([C-HJ-NP-X]|north|south)?\s*[,\s]\s*(\d+(?:\.\d+)?)\s*(?:m\s*)?E?\s*[,\s]\s*(\d+(?:\.\d+)?)\s*(?:m\s*)?N?\s*$/i.exec(input);
  if (!match) throw new Error('Not a UTM coordinate');
  const zone = Number(match[1]);
  const designator = (match[2] ?? 'N').toUpperCase();
  const easting = Number(match[3]);
  const northing = Number(match[4]);
  if (easting < 100_000 || easting > 900_000) throw new Error('UTM easting must be between 100,000 and 900,000 m');
  if (designator === 'NORTH' || designator === 'SOUTH') return fromUtm(zone, designator === 'NORTH' ? 'N' : 'S', easting, northing);
  // A single letter is a latitude band (C–M south, N–X north). Because "S" is
  // also written for the southern hemisphere, accept whichever reading lands
  // inside the named band.
  const bandIndex = BANDS.indexOf(designator);
  const hemi: 'N' | 'S' = bandIndex >= BANDS.indexOf('N') ? 'N' : 'S';
  const primary = fromUtm(zone, hemi, easting, northing);
  const south = -80 + bandIndex * 8;
  if (primary.lat >= south - 0.5 && primary.lat <= south + 8.5 + (designator === 'X' ? 4 : 0)) return primary;
  if (designator === 'S') return fromUtm(zone, 'S', easting, northing);
  return primary;
}

// ---------------- Degrees ----------------

export interface ParsedDegrees extends LatLon {
  format: 'dd' | 'dms' | 'ddm';
}

interface Part { hem: string | null; values: number[]; markers: string[]; negative: boolean }

/**
 * Parses two angles written as DD, DDM or DMS, with or without symbols and
 * hemisphere letters: `48.8584, 2.2945`, `48°51'30"N 2°17'40"E`,
 * `N 48 51.504 E 2 17.67`, `40d26m46s S 79d58m56s W`, `-33 52 04, 151 12 26`.
 */
export function parseDegrees(input: string): ParsedDegrees {
  const text = input
    .toUpperCase()
    .replace(/\bNORTH\b/g, 'N').replace(/\bSOUTH\b/g, 'S').replace(/\bEAST\b/g, 'E').replace(/\bWEST\b/g, 'W')
    .replace(/[°º˚]|DEG(?:REES?)?\b/g, ' §D ')
    .replace(/″|”|“|''|"|SEC(?:ONDS?)?\b/g, ' §S ')
    .replace(/[′’‘`´']|MIN(?:UTES?)?\b/g, ' §M ');
  const tokens = [...text.matchAll(/(\d+(?:[.,]\d+)?)|([+-])|§([DMS])|([NSEWDM])|([,;])/g)];
  const parts: Part[] = [];
  let current: Part = { hem: null, values: [], markers: [], negative: false };
  let pendingHem: string | null = null;
  let pendingSign = false;
  const close = () => {
    if (current.values.length) parts.push(current);
    current = { hem: null, values: [], markers: [], negative: false };
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const [, number, sign, symbol, letter, separator] = tokens[i];
    if (separator !== undefined) { if (current.values.length) close(); continue; }
    const previousWasNumber = i > 0 && tokens[i - 1][1] !== undefined;
    if (number !== undefined) {
      const lastMarker = current.markers.at(-1);
      if (current.values.length && (lastMarker === 'S' || current.values.length === 3)) close();
      const next = tokens[i + 1];
      if (current.values.length && next && (next[3] === 'D' || (next[4] === 'D' && next[1] === undefined))) close();
      if (!current.values.length) {
        if (pendingHem) { current.hem = pendingHem; pendingHem = null; }
        if (pendingSign) { current.negative = true; pendingSign = false; }
      }
      current.values.push(Number(number.replace(',', '.')));
      continue;
    }
    if (sign !== undefined) { if (current.values.length) close(); pendingSign = sign === '-'; continue; }
    const marker = symbol ?? (letter === 'D' || letter === 'M' ? letter : letter === 'S' && previousWasNumber && current.values.length === 3 ? 'S' : undefined);
    if (marker) { if (current.values.length) current.markers.push(marker); continue; }
    if (letter) {
      if (current.values.length && !current.hem) { current.hem = letter; close(); }
      else { close(); pendingHem = letter; }
    }
  }
  close();
  let groups = parts;
  if (groups.length === 1 && !groups[0].hem && [2, 4, 6].includes(groups[0].values.length)) {
    const only = groups[0]; const half = only.values.length / 2;
    groups = [
      { hem: null, values: only.values.slice(0, half), markers: [], negative: only.negative },
      { hem: null, values: only.values.slice(half), markers: [], negative: false },
    ];
  }
  if (groups.length !== 2) throw new Error('Expected two coordinates (latitude and longitude)');
  const values = groups.map((group) => {
    const [deg, min = 0, sec = 0] = group.values;
    if (min >= 60 || sec >= 60) throw new Error('Minutes and seconds must be below 60');
    if (group.values.length > 1 && !Number.isInteger(deg)) throw new Error('Degrees must be whole when minutes are given');
    if (group.values.length > 2 && !Number.isInteger(min)) throw new Error('Minutes must be whole when seconds are given');
    const magnitude = deg + min / 60 + sec / 3600;
    const negative = group.negative || group.hem === 'S' || group.hem === 'W';
    return { value: negative ? -magnitude : magnitude, hem: group.hem, count: group.values.length };
  });
  let [latPart, lonPart] = values;
  if (latPart.hem === 'E' || latPart.hem === 'W' || lonPart.hem === 'N' || lonPart.hem === 'S') [latPart, lonPart] = [lonPart, latPart];
  if (Math.abs(latPart.value) > 90) throw new Error('Latitude must be between -90 and 90');
  if (Math.abs(lonPart.value) > 180) throw new Error('Longitude must be between -180 and 180');
  const count = Math.max(latPart.count, lonPart.count);
  return { lat: latPart.value, lon: lonPart.value, format: count >= 3 ? 'dms' : count === 2 ? 'ddm' : 'dd' };
}

function split(value: number) {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minutesFloat = (abs - deg) * 60;
  return { abs, deg, minutesFloat };
}

export function formatDD(point: LatLon, digits = 6): string {
  return `${point.lat.toFixed(digits)}, ${point.lon.toFixed(digits)}`;
}

export function formatDMS(point: LatLon, secondDigits = 2): string {
  const one = (value: number, pos: string, neg: string) => {
    let { deg, minutesFloat } = split(value);
    let min = Math.floor(minutesFloat);
    let sec = Number(((minutesFloat - min) * 60).toFixed(secondDigits));
    if (sec >= 60) { sec = 0; min += 1; }
    if (min >= 60) { min = 0; deg += 1; }
    return `${deg}°${String(min).padStart(2, '0')}′${sec.toFixed(secondDigits).padStart(secondDigits ? secondDigits + 3 : 2, '0')}″${value < 0 ? neg : pos}`;
  };
  return `${one(point.lat, 'N', 'S')} ${one(point.lon, 'E', 'W')}`;
}

export function formatDDM(point: LatLon, minuteDigits = 4): string {
  const one = (value: number, pos: string, neg: string) => {
    let { deg, minutesFloat } = split(value);
    let min = Number(minutesFloat.toFixed(minuteDigits));
    if (min >= 60) { min = 0; deg += 1; }
    return `${deg}°${min.toFixed(minuteDigits).padStart(minuteDigits ? minuteDigits + 3 : 2, '0')}′${value < 0 ? neg : pos}`;
  };
  return `${one(point.lat, 'N', 'S')} ${one(point.lon, 'E', 'W')}`;
}

export function formatUtm(point: LatLon): string {
  const utm = toUtm(point);
  return `${utm.zone}${utm.band} ${Math.floor(utm.easting)}mE ${Math.floor(utm.northing)}mN`;
}

// ---------------- Geohash (public domain, G. Niemeyer 2008) ----------------

const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(point: LatLon, precision = 9): string {
  const lat: [number, number] = [-90, 90];
  const lon: [number, number] = [-180, 180];
  let hash = ''; let bits = 0; let value = 0; let even = true;
  while (hash.length < precision) {
    const range = even ? lon : lat;
    const coordinate = even ? point.lon : point.lat;
    const mid = (range[0] + range[1]) / 2;
    if (coordinate >= mid) { value = (value << 1) | 1; range[0] = mid; } else { value <<= 1; range[1] = mid; }
    even = !even;
    bits += 1;
    if (bits === 5) { hash += GEOHASH_ALPHABET[value]; bits = 0; value = 0; }
  }
  return hash;
}

export function decodeGeohash(input: string): { center: LatLon; south: number; west: number; north: number; east: number } {
  const hash = input.trim().toLowerCase();
  if (!hash || [...hash].some((c) => !GEOHASH_ALPHABET.includes(c))) throw new Error('Not a geohash');
  const lat: [number, number] = [-90, 90];
  const lon: [number, number] = [-180, 180];
  let even = true;
  for (const char of hash) {
    const value = GEOHASH_ALPHABET.indexOf(char);
    for (let bit = 4; bit >= 0; bit -= 1) {
      const range = even ? lon : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((value >> bit) & 1) range[0] = mid; else range[1] = mid;
      even = !even;
    }
  }
  return { center: { lat: (lat[0] + lat[1]) / 2, lon: (lon[0] + lon[1]) / 2 }, south: lat[0], north: lat[1], west: lon[0], east: lon[1] };
}

// ---------------- Maidenhead / IARU locator ----------------

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWX';

/** IARU locator; 3 pairs = subsquare (≈5′ × 2.5′), 4 pairs = extended square. Upper case per IARU 2019. */
export function toMaidenhead(point: LatLon, pairs: 2 | 3 | 4 = 3): string {
  let lon = Math.min(359.999999, Math.max(0, point.lon + 180));
  let lat = Math.min(179.999999, Math.max(0, point.lat + 90));
  let out = LETTERS[Math.floor(lon / 20)] + LETTERS[Math.floor(lat / 10)];
  lon %= 20; lat %= 10;
  out += `${Math.floor(lon / 2)}${Math.floor(lat)}`;
  lon %= 2; lat %= 1;
  if (pairs >= 3) {
    out += LETTERS[Math.floor(lon * 12)] + LETTERS[Math.floor(lat * 24)];
    lon = (lon * 12) % 1; lat = (lat * 24) % 1;
  }
  if (pairs >= 4) out += `${Math.floor(lon * 10)}${Math.floor(lat * 10)}`;
  return out;
}

export function fromMaidenhead(input: string): { center: LatLon; south: number; west: number; north: number; east: number } {
  const text = input.trim().toUpperCase();
  if (!/^[A-R]{2}(\d{2}([A-X]{2}(\d{2})?)?)?$/.test(text)) throw new Error('Not a Maidenhead locator');
  let west = (text.charCodeAt(0) - 65) * 20 - 180;
  let south = (text.charCodeAt(1) - 65) * 10 - 90;
  let w = 20; let h = 10;
  if (text.length >= 4) { w = 2; h = 1; west += Number(text[2]) * w; south += Number(text[3]) * h; }
  if (text.length >= 6) { w = 2 / 24; h = 1 / 24; west += (text.charCodeAt(4) - 65) * w; south += (text.charCodeAt(5) - 65) * h; }
  if (text.length >= 8) { w /= 10; h /= 10; west += Number(text[6]) * w; south += Number(text[7]) * h; }
  return { center: { lat: south + h / 2, lon: west + w / 2 }, south, west, north: south + h, east: west + w };
}

export function antipode(point: LatLon): LatLon {
  return { lat: -point.lat, lon: point.lon > 0 ? point.lon - 180 : point.lon + 180 };
}
