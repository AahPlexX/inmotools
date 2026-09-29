// Calendar, sun and terrain adapters: Nager.Date, Sunrise-Sunset.org v2,
// SunriseSunset.io, Terrain Tiles on AWS, Open-Elevation.

import { unzlibSync } from 'fflate';
import { field, provenance } from '../core/sources';
import { computeSolarTimes, ruleOfThumbGolden } from '../core/solar';
import type { Holiday, HolidayCalendar, ProfileField, SolarTimes } from '../core/types';
import { NotFoundError, TTL, type HttpClient } from '../net/http';
import { enc, num } from './common';

// ---------------- Nager.Date v3 ----------------

export async function nagerCountries(client: HttpClient, signal?: AbortSignal): Promise<Set<string>> {
  const response = await client.get<Array<{ countryCode: string }>>('https://date.nager.at/api/v3/AvailableCountries', { source: 'nager-date', ttlMs: TTL.month, signal });
  return new Set(response.data.map((item) => item.countryCode));
}

export async function nagerHolidays(client: HttpClient, year: number, countryCode: string, signal?: AbortSignal): Promise<HolidayCalendar | null> {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${enc(countryCode.toUpperCase())}`;
  let response;
  try {
    response = await client.get<Holiday[] | null>(url, { source: 'nager-date', ttlMs: TTL.week, signal });
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
  // Nager.Date answers unsupported countries with 204 No Content (data === null).
  if (!Array.isArray(response.data)) return null;
  const items = response.data.map((item) => ({ date: item.date, localName: item.localName, name: item.name, global: item.global, counties: item.counties ?? null, types: item.types ?? [] }));
  return {
    year, countryCode: countryCode.toUpperCase(), items,
    provenance: provenance({ source: 'nager-date', geography: 'country', confidence: 'admin_centroid', retrievedAt: response.retrievedAt, year, recordId: `${year}/${countryCode.toUpperCase()}`, note: 'Holidays marked regional apply only in the listed subdivisions. Moon-sighting Islamic holidays are not published by this source.' }),
  };
}

// ---------------- Sun times ----------------

interface SsoV2 {
  date: string; tzid: string; sunrise: string | null; sunset: string | null; solar_noon: string | null; day_length: number | null; sun_status: string;
  civil_twilight_begin: string | null; civil_twilight_end: string | null; nautical_twilight_begin: string | null; nautical_twilight_end: string | null;
  astronomical_twilight_begin: string | null; astronomical_twilight_end: string | null;
  golden_hour?: { morning: { begin: string | null; end: string | null }; evening: { begin: string | null; end: string | null } };
  blue_hour?: { morning: { begin: string | null; end: string | null }; evening: { begin: string | null; end: string | null } };
}

const toIso = (value: string | null | undefined) => (value ? new Date(value).toISOString() : null);
const windowOf = (w: { begin: string | null; end: string | null } | undefined): [string, string] | null => (w?.begin && w.end ? [toIso(w.begin) as string, toIso(w.end) as string] : null);

export function statusFrom(value: string, noonAltitude?: number): SolarTimes['status'] {
  if (value === 'midnight_sun' || value === 'polar_day' || value === 'always_up') return 'polar_day';
  if (value === 'polar_night' || value === 'always_down') return 'polar_night';
  if (value !== 'normal' && typeof noonAltitude === 'number') return noonAltitude > 0 ? 'polar_day' : 'polar_night';
  return 'normal';
}

export async function sunriseSunsetOrg(client: HttpClient, lat: number, lon: number, date: string, signal?: AbortSignal): Promise<SolarTimes> {
  const url = `https://api.sunrise-sunset.org/v2?lat=${lat.toFixed(5)}&lng=${lon.toFixed(5)}&date=${enc(date)}`;
  const response = await client.get<SsoV2>(url, { source: 'sunrise-sunset-org', ttlMs: TTL.month, signal });
  const d = response.data;
  const status = statusFrom(d.sun_status);
  const fallback = ruleOfThumbGolden(toIso(d.sunrise), toIso(d.sunset));
  return {
    sunrise: toIso(d.sunrise), sunset: toIso(d.sunset), solarNoon: toIso(d.solar_noon), dayLengthSeconds: num(d.day_length),
    civilDawn: toIso(d.civil_twilight_begin), civilDusk: toIso(d.civil_twilight_end),
    nauticalDawn: toIso(d.nautical_twilight_begin), nauticalDusk: toIso(d.nautical_twilight_end),
    astronomicalDawn: toIso(d.astronomical_twilight_begin), astronomicalDusk: toIso(d.astronomical_twilight_end),
    goldenMorning: windowOf(d.golden_hour?.morning) ?? fallback.morning, goldenEvening: windowOf(d.golden_hour?.evening) ?? fallback.evening,
    blueMorning: windowOf(d.blue_hour?.morning), blueEvening: windowOf(d.blue_hour?.evening),
    status,
    provenance: provenance({ source: 'sunrise-sunset-org', geography: 'point', confidence: 'modeled_grid', retrievedAt: response.retrievedAt, recordId: `${lat.toFixed(5)},${lon.toFixed(5)}@${date}`, year: Number(date.slice(0, 4)), note: `Computed by the provider for ${date} (${d.tzid}); golden and blue hour use the provider's sun-altitude windows.` }),
  };
}

interface SsIo {
  results: Record<string, unknown> & {
    sunrise: string | null; sunset: string | null; solar_noon: string | null; dawn: string | null; dusk: string | null; first_light: string | null; last_light: string | null;
    nautical_twilight_begin: string | null; nautical_twilight_end: string | null; sun_status?: string; day_length?: string;
    golden_hour_morning?: { begin: string; end: string }; golden_hour_evening?: { begin: string; end: string };
    blue_hour_morning?: { begin: string; end: string }; blue_hour_evening?: { begin: string; end: string };
  };
  status: string;
  tzid?: string;
}

const unix = (value: unknown) => (typeof value === 'string' && /^\d+$/.test(value) ? new Date(Number(value) * 1000).toISOString() : null);
const unixWindow = (w: { begin: string; end: string } | undefined): [string, string] | null => {
  const a = unix(w?.begin); const b = unix(w?.end);
  return a && b ? [a, b] : null;
};

export async function sunriseSunsetIo(client: HttpClient, lat: number, lon: number, date: string, signal?: AbortSignal): Promise<SolarTimes> {
  const url = `https://api.sunrisesunset.io/json?lat=${lat.toFixed(5)}&lng=${lon.toFixed(5)}&date=${enc(date)}&time_format=unix`;
  const response = await client.get<SsIo>(url, { source: 'sunrisesunset-io', ttlMs: TTL.month, signal });
  const r = response.data.results;
  if (response.data.status !== 'OK' || !r) throw new Error('SunriseSunset.io returned no result');
  const sunrise = unix(r.sunrise); const sunset = unix(r.sunset);
  const [h, m, s] = String(r.day_length ?? '').split(':').map(Number);
  const fallback = ruleOfThumbGolden(sunrise, sunset);
  return {
    sunrise, sunset, solarNoon: unix(r.solar_noon), dayLengthSeconds: Number.isFinite(h) ? h * 3600 + (m || 0) * 60 + (s || 0) : null,
    civilDawn: unix(r.dawn), civilDusk: unix(r.dusk), nauticalDawn: unix(r.nautical_twilight_begin), nauticalDusk: unix(r.nautical_twilight_end),
    astronomicalDawn: unix(r.first_light), astronomicalDusk: unix(r.last_light),
    goldenMorning: unixWindow(r.golden_hour_morning) ?? fallback.morning, goldenEvening: unixWindow(r.golden_hour_evening) ?? fallback.evening,
    blueMorning: unixWindow(r.blue_hour_morning), blueEvening: unixWindow(r.blue_hour_evening),
    status: statusFrom(r.sun_status ?? 'normal'),
    provenance: provenance({ source: 'sunrisesunset-io', geography: 'point', confidence: 'modeled_grid', retrievedAt: response.retrievedAt, recordId: `${lat.toFixed(5)},${lon.toFixed(5)}@${date}`, year: Number(date.slice(0, 4)), note: `Computed by the provider for ${date}${response.data.tzid ? ` (${response.data.tzid})` : ''}; the provider applies terrain elevation, so times can differ by a minute from sea-level models.` }),
  };
}

/** Provider chain for sun times, ending with the offline model. */
export async function solarTimes(client: HttpClient, lat: number, lon: number, date: string, signal?: AbortSignal): Promise<{ solar: SolarTimes; warnings: string[] }> {
  const warnings: string[] = [];
  for (const provider of [sunriseSunsetOrg, sunriseSunsetIo]) {
    try { return { solar: await provider(client, lat, lon, date, signal), warnings }; }
    catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(`${provider === sunriseSunsetOrg ? 'Sunrise-Sunset.org' : 'SunriseSunset.io'} unavailable: ${(error as Error).message}`);
    }
  }
  const solar = computeSolarTimes(date, lat, lon, provenance({ source: 'computed', geography: 'point', confidence: 'modeled_grid', retrievedAt: new Date().toISOString(), year: Number(date.slice(0, 4)), note: 'Offline NOAA solar model at sea level (±1–2 min below 65° latitude); used because both sun-time services were unreachable.' }));
  return { solar, warnings };
}

// ---------------- Elevation ----------------

export const TERRAIN_ZOOM = 12;

/** Slippy-map tile and pixel for a point (Web Mercator, 256 px tiles). */
export function tilePixel(lat: number, lon: number, zoom = TERRAIN_ZOOM): { x: number; y: number; px: number; py: number; metresPerPixel: number } {
  const n = 2 ** zoom;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const xf = ((lon + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.min(n - 1, Math.floor(xf)); const y = Math.min(n - 1, Math.floor(yf));
  return {
    x, y,
    px: Math.min(255, Math.floor((xf - x) * 256)), py: Math.min(255, Math.floor((yf - y) * 256)),
    metresPerPixel: (40_075_016.686 * Math.cos(latRad)) / (n * 256),
  };
}

/** Terrarium encoding: height = (R × 256 + G + B / 256) − 32768 metres. */
export const terrariumHeight = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

/** Minimal PNG decoder for 8-bit, non-interlaced RGB/RGBA images (the Terrarium tile format). */
export function decodePng(buffer: ArrayBuffer): { width: number; height: number; channels: number; pixels: Uint8Array } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error('Not a PNG');
  let offset = 8; let width = 0; let height = 0; let channels = 0;
  const idat: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12);
      const depth = data[8]; const color = data[9]; const interlace = data[12];
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error('Unsupported PNG variant');
      channels = color === 2 ? 3 : 4;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of idat) { joined.set(part, cursor); cursor += part.length; }
  const raw = unzlibSync(joined);
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const src = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const out = pixels.subarray(row * stride, (row + 1) * stride);
    const prev = row > 0 ? pixels.subarray((row - 1) * stride, row * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = src[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += Math.floor((a + b) / 2);
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

export async function terrainTileElevation(client: HttpClient, lat: number, lon: number, signal?: AbortSignal): Promise<ProfileField> {
  const tile = tilePixel(lat, lon);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRAIN_ZOOM}/${tile.x}/${tile.y}.png`;
  const response = await client.get<ArrayBuffer>(url, { source: 'terrain-tiles', ttlMs: TTL.month, parse: 'arrayBuffer', signal });
  const png = decodePng(response.data);
  const i = (tile.py * png.width + tile.px) * png.channels;
  const metres = terrariumHeight(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]);
  return field('elevation.metres', 'Elevation', 'elevation', Math.round(metres * 10) / 10, {
    source: 'terrain-tiles', geography: 'grid_cell', confidence: 'modeled_grid', retrievedAt: response.retrievedAt, unit: 'm',
    recordId: `terrarium/${TERRAIN_ZOOM}/${tile.x}/${tile.y}@${tile.px},${tile.py}`, geometryId: `${TERRAIN_ZOOM}/${tile.x}/${tile.y}`,
    note: `Terrain Tiles pixel of ≈${Math.round(tile.metresPerPixel)} m; underlying source resolution varies by region (e.g. 3DEP in the US, SRTM elsewhere, ETOPO1 bathymetry at sea). Negative values below sea level/sea floor.`,
  });
}

export async function openElevation(client: HttpClient, lat: number, lon: number, signal?: AbortSignal): Promise<ProfileField> {
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat.toFixed(5)},${lon.toFixed(5)}&dataset=srtm-250m`;
  const response = await client.get<{ results: Array<{ elevation: number; dataset: string | null }> }>(url, { source: 'open-elevation', ttlMs: TTL.month, signal });
  const first = response.data.results?.[0];
  if (!first || first.dataset === null) throw new Error('Open-Elevation has no data for this point');
  return field('elevation.metres', 'Elevation', 'elevation', Math.round(first.elevation * 10) / 10, {
    source: 'open-elevation', geography: 'grid_cell', confidence: 'modeled_grid', retrievedAt: response.retrievedAt, unit: 'm', recordId: `${first.dataset}@${lat.toFixed(5)},${lon.toFixed(5)}`,
    note: 'SRTM resampled to a 250 m grid by Open-Elevation.',
  });
}

export async function elevation(client: HttpClient, lat: number, lon: number, signal?: AbortSignal): Promise<{ field: ProfileField | null; warnings: string[] }> {
  const warnings: string[] = [];
  try { return { field: await terrainTileElevation(client, lat, lon, signal), warnings }; }
  catch (error) { if (signal?.aborted) throw error; warnings.push(`Terrain Tiles unavailable: ${(error as Error).message}`); }
  try { return { field: await openElevation(client, lat, lon, signal), warnings }; }
  catch (error) { if (signal?.aborted) throw error; warnings.push(`Open-Elevation unavailable: ${(error as Error).message}`); }
  return { field: null, warnings };
}
