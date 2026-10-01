// Open Location Code (Plus Codes), implemented from the published specification
// and the reference algorithm at github.com/google/open-location-code (Apache-2.0).
// Verified against the project's official test_data CSVs in tests/unit.

const ALPHABET = '23456789CFGHJMPQRVWX';
const BASE = ALPHABET.length;
const SEPARATOR = '+';
const SEPARATOR_POSITION = 8;
const PADDING = '0';
const LAT_MAX = 90;
const LNG_MAX = 180;
const MIN_DIGITS = 2;
const MAX_DIGITS = 15;
const PAIR_LENGTH = 10;
const PAIR_FIRST_PLACE_VALUE = BASE ** (PAIR_LENGTH / 2 - 1);
const PAIR_PRECISION = BASE ** 3;
const PAIR_RESOLUTIONS = [20.0, 1.0, 0.05, 0.0025, 0.000125];
const GRID_LENGTH = MAX_DIGITS - PAIR_LENGTH;
const GRID_COLUMNS = 4;
const GRID_ROWS = 5;
const GRID_LAT_FIRST_PLACE_VALUE = GRID_ROWS ** (GRID_LENGTH - 1);
const GRID_LNG_FIRST_PLACE_VALUE = GRID_COLUMNS ** (GRID_LENGTH - 1);
const FINAL_LAT_PRECISION = PAIR_PRECISION * GRID_ROWS ** GRID_LENGTH;
const FINAL_LNG_PRECISION = PAIR_PRECISION * GRID_COLUMNS ** GRID_LENGTH;
const MIN_TRIMMABLE_LENGTH = 6;

export const CODE_PRECISION_NORMAL = 10;
export const CODE_PRECISION_EXTRA = 11;

export interface CodeArea {
  latitudeLo: number;
  longitudeLo: number;
  latitudeHi: number;
  longitudeHi: number;
  codeLength: number;
  latitudeCenter: number;
  longitudeCenter: number;
}

function codeArea(latitudeLo: number, longitudeLo: number, latitudeHi: number, longitudeHi: number, codeLength: number): CodeArea {
  return {
    latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength,
    latitudeCenter: Math.min(latitudeLo + (latitudeHi - latitudeLo) / 2, LAT_MAX),
    longitudeCenter: Math.min(longitudeLo + (longitudeHi - longitudeLo) / 2, LNG_MAX),
  };
}

export function isValid(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const sep = code.indexOf(SEPARATOR);
  if (sep === -1 || sep !== code.lastIndexOf(SEPARATOR) || code.length === 1) return false;
  if (sep > SEPARATOR_POSITION || sep % 2 === 1) return false;
  if (code.includes(PADDING)) {
    if (sep < SEPARATOR_POSITION) return false;
    if (code.indexOf(PADDING) === 0) return false;
    const pads = code.match(/0+/g) ?? [];
    const pad = pads[0] ?? '';
    if (pads.length > 1 || pad.length % 2 === 1 || pad.length > SEPARATOR_POSITION - 2) return false;
    if (code.charAt(code.length - 1) !== SEPARATOR) return false;
  }
  if (code.length - sep - 1 === 1) return false;
  const stripped = code.replace(/\++/, '').replace(/0+/, '');
  for (const character of stripped) {
    const upper = character.toUpperCase();
    if (upper !== SEPARATOR && !ALPHABET.includes(upper)) return false;
  }
  return true;
}

export function isShort(code: string): boolean {
  if (!isValid(code)) return false;
  const sep = code.indexOf(SEPARATOR);
  return sep >= 0 && sep < SEPARATOR_POSITION;
}

export function isFull(code: string): boolean {
  if (!isValid(code) || isShort(code)) return false;
  const firstLat = ALPHABET.indexOf(code.charAt(0).toUpperCase()) * BASE;
  if (firstLat >= LAT_MAX * 2) return false;
  if (code.length > 1) {
    const firstLng = ALPHABET.indexOf(code.charAt(1).toUpperCase()) * BASE;
    if (firstLng >= LNG_MAX * 2) return false;
  }
  return true;
}

export function locationToIntegers(latitude: number, longitude: number): [number, number] {
  let latVal = Math.floor(latitude * FINAL_LAT_PRECISION) + LAT_MAX * FINAL_LAT_PRECISION;
  if (latVal < 0) latVal = 0;
  else if (latVal >= 2 * LAT_MAX * FINAL_LAT_PRECISION) latVal = 2 * LAT_MAX * FINAL_LAT_PRECISION - 1;
  let lngVal = Math.floor(longitude * FINAL_LNG_PRECISION) + LNG_MAX * FINAL_LNG_PRECISION;
  const lngSpan = 2 * LNG_MAX * FINAL_LNG_PRECISION;
  if (lngVal < 0) lngVal = (lngVal % lngSpan) + lngSpan;
  else if (lngVal >= lngSpan) lngVal %= lngSpan;
  return [latVal, lngVal];
}

export function encodeIntegers(latInt: number, lngInt: number, requestedLength = CODE_PRECISION_NORMAL): string {
  const codeLength = Math.min(MAX_DIGITS, Number(requestedLength));
  if (Number.isNaN(latInt) || Number.isNaN(lngInt) || Number.isNaN(codeLength)) throw new Error('Plus Code parameters are not numbers');
  if (codeLength < MIN_DIGITS || (codeLength < PAIR_LENGTH && codeLength % 2 === 1)) throw new Error('Invalid Plus Code length');
  const code: string[] = new Array(MAX_DIGITS + 1);
  code[SEPARATOR_POSITION] = SEPARATOR;
  let lat = latInt; let lng = lngInt;
  if (codeLength > PAIR_LENGTH) {
    for (let i = GRID_LENGTH; i >= 1; i -= 1) {
      const latDigit = lat % GRID_ROWS;
      const lngDigit = lng % GRID_COLUMNS;
      code[SEPARATOR_POSITION + 2 + i] = ALPHABET.charAt(latDigit * GRID_COLUMNS + lngDigit);
      lat = Math.floor(lat / GRID_ROWS);
      lng = Math.floor(lng / GRID_COLUMNS);
    }
  } else {
    lat = Math.floor(lat / GRID_ROWS ** GRID_LENGTH);
    lng = Math.floor(lng / GRID_COLUMNS ** GRID_LENGTH);
  }
  code[SEPARATOR_POSITION + 1] = ALPHABET.charAt(lat % BASE);
  code[SEPARATOR_POSITION + 2] = ALPHABET.charAt(lng % BASE);
  lat = Math.floor(lat / BASE);
  lng = Math.floor(lng / BASE);
  for (let i = PAIR_LENGTH / 2 + 1; i >= 0; i -= 2) {
    code[i] = ALPHABET.charAt(lat % BASE);
    code[i + 1] = ALPHABET.charAt(lng % BASE);
    lat = Math.floor(lat / BASE);
    lng = Math.floor(lng / BASE);
  }
  if (codeLength >= SEPARATOR_POSITION) return code.slice(0, codeLength + 1).join('');
  return code.slice(0, codeLength).join('') + PADDING.repeat(SEPARATOR_POSITION - codeLength) + SEPARATOR;
}

export function encode(latitude: number, longitude: number, codeLength = CODE_PRECISION_NORMAL): string {
  const [latInt, lngInt] = locationToIntegers(Number(latitude), Number(longitude));
  return encodeIntegers(latInt, lngInt, codeLength);
}

export function decode(input: string): CodeArea {
  if (!isFull(input)) throw new Error(`Not a valid full Plus Code: ${input}`);
  const code = input.replace('+', '').replace(/0/g, '').toLocaleUpperCase('en-US');
  let normalLat = -LAT_MAX * PAIR_PRECISION;
  let normalLng = -LNG_MAX * PAIR_PRECISION;
  let gridLat = 0; let gridLng = 0;
  let digits = Math.min(code.length, PAIR_LENGTH);
  let pv = PAIR_FIRST_PLACE_VALUE;
  for (let i = 0; i < digits; i += 2) {
    normalLat += ALPHABET.indexOf(code.charAt(i)) * pv;
    normalLng += ALPHABET.indexOf(code.charAt(i + 1)) * pv;
    if (i < digits - 2) pv /= BASE;
  }
  let latPrecision = pv / PAIR_PRECISION;
  let lngPrecision = pv / PAIR_PRECISION;
  if (code.length > PAIR_LENGTH) {
    let rowpv = GRID_LAT_FIRST_PLACE_VALUE;
    let colpv = GRID_LNG_FIRST_PLACE_VALUE;
    digits = Math.min(code.length, MAX_DIGITS);
    for (let i = PAIR_LENGTH; i < digits; i += 1) {
      const value = ALPHABET.indexOf(code.charAt(i));
      gridLat += Math.floor(value / GRID_COLUMNS) * rowpv;
      gridLng += (value % GRID_COLUMNS) * colpv;
      if (i < digits - 1) { rowpv /= GRID_ROWS; colpv /= GRID_COLUMNS; }
    }
    latPrecision = rowpv / FINAL_LAT_PRECISION;
    lngPrecision = colpv / FINAL_LNG_PRECISION;
  }
  const lat = normalLat / PAIR_PRECISION + gridLat / FINAL_LAT_PRECISION;
  const lng = normalLng / PAIR_PRECISION + gridLng / FINAL_LNG_PRECISION;
  return codeArea(lat, lng, lat + latPrecision, lng + lngPrecision, Math.min(code.length, MAX_DIGITS));
}

const clipLatitude = (latitude: number) => Math.min(90, Math.max(-90, latitude));
function normalizeLongitude(longitude: number): number {
  let value = longitude;
  while (value < -180) value += 360;
  while (value >= 180) value -= 360;
  return value;
}

export function recoverNearest(shortCode: string, referenceLatitude: number, referenceLongitude: number): string {
  if (!isShort(shortCode)) {
    if (isFull(shortCode)) return shortCode.toUpperCase();
    throw new Error(`Not a valid short Plus Code: ${shortCode}`);
  }
  if (Number.isNaN(Number(referenceLatitude)) || Number.isNaN(Number(referenceLongitude))) throw new Error('Reference position is not numeric');
  const refLat = clipLatitude(Number(referenceLatitude));
  const refLng = normalizeLongitude(Number(referenceLongitude));
  const code = shortCode.toUpperCase();
  const paddingLength = SEPARATOR_POSITION - code.indexOf(SEPARATOR);
  const resolution = 20 ** (2 - paddingLength / 2);
  const half = resolution / 2;
  const area = decode(encode(refLat, refLng).substring(0, paddingLength) + code);
  let latCenter = area.latitudeCenter;
  let lngCenter = area.longitudeCenter;
  if (refLat + half < latCenter && latCenter - resolution >= -LAT_MAX) latCenter -= resolution;
  else if (refLat - half > latCenter && latCenter + resolution <= LAT_MAX) latCenter += resolution;
  if (refLng + half < lngCenter) lngCenter -= resolution;
  else if (refLng - half > lngCenter) lngCenter += resolution;
  return encode(latCenter, lngCenter, area.codeLength);
}

export function shorten(input: string, latitude: number, longitude: number): string {
  if (!isFull(input)) throw new Error(`Not a valid full Plus Code: ${input}`);
  if (input.includes(PADDING)) throw new Error(`Cannot shorten padded Plus Code: ${input}`);
  const code = input.toUpperCase();
  const area = decode(code);
  if (area.codeLength < MIN_TRIMMABLE_LENGTH) throw new Error(`Plus Code must have at least ${MIN_TRIMMABLE_LENGTH} digits to shorten`);
  const lat = clipLatitude(Number(latitude));
  const lng = normalizeLongitude(Number(longitude));
  const range = Math.max(Math.abs(area.latitudeCenter - lat), Math.abs(area.longitudeCenter - lng));
  for (let i = PAIR_RESOLUTIONS.length - 2; i >= 1; i -= 1) {
    if (range < PAIR_RESOLUTIONS[i] * 0.3) return code.substring((i + 1) * 2);
  }
  return code;
}

/** Human description of a code's cell size, e.g. "≈14 m × 14 m". */
export function describeArea(area: CodeArea): string {
  const latMetres = (area.latitudeHi - area.latitudeLo) * 111_320;
  const lngMetres = (area.longitudeHi - area.longitudeLo) * 111_320 * Math.cos((area.latitudeCenter * Math.PI) / 180);
  const format = (metres: number) => (metres >= 1000 ? `${(metres / 1000).toFixed(metres >= 10_000 ? 0 : 1)} km` : `${metres.toFixed(metres >= 10 ? 0 : 1)} m`);
  return `≈${format(latMetres)} × ${format(Math.abs(lngMetres))}`;
}
