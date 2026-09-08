import Papa from 'papaparse';
import { ppbToUgM3, ppmToUgM3 } from './aethercast-engine';
import type { AetherCastDataset, HourlyAtmosphericPoint, ImportSource, TimestampReconciliationReport } from './aethercast-types';

export interface ImportResult {
  dataset: AetherCastDataset | null;
  errors: string[];
}

interface OpenMeteoHourly {
  time?: string[];
  pm10?: (number | null)[];
  pm2_5?: (number | null)[];
  carbon_monoxide?: (number | null)[];
  nitrogen_dioxide?: (number | null)[];
  sulphur_dioxide?: (number | null)[];
  ozone?: (number | null)[];
  uv_index?: (number | null)[];
  uv_index_clear_sky?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  us_aqi?: (number | null)[];
  european_aqi?: (number | null)[];
}

interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  utc_offset_seconds?: number;
  hourly?: OpenMeteoHourly;
}

const MAX_ROWS = 17_520;
const DAY_MS = 86_400_000;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/i;

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  explicitZone: string | null;
  normalized: string;
}

const daysInMonth = (year: number, month: number): number => {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
};

const parseWallClockParts = (value: string): WallClockParts | null => {
  const match = value.trim().match(DATE_TIME);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millisecond = Number((match[7] ?? '').slice(0, 3).padEnd(3, '0') || 0);
  if (
    month < 1 || month > 12
    || day < 1 || day > daysInMonth(year, month)
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
    || second < 0 || second > 59
  ) return null;
  const explicitZone = match[8] ?? null;
  return {
    year, month, day, hour, minute, second, millisecond, explicitZone,
    normalized: value.trim().replace(' ', 'T'),
  };
};

const wallUtcSecond = (parts: WallClockParts): number => {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
};

const wallParts = (epochMs: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(0);
  date.setUTCFullYear(Number(values.year), Number(values.month) - 1, Number(values.day));
  date.setUTCHours(Number(values.hour), Number(values.minute), Number(values.second), 0);
  return date.getTime();
};

const resolveIanaWallClock = (wallUtc: number, timeZone: string): number[] => {
  const offsets = new Set<number>();
  for (const probe of [wallUtc - 3 * DAY_MS, wallUtc, wallUtc + 3 * DAY_MS]) {
    offsets.add(wallParts(probe, timeZone) - probe);
  }
  const candidates = new Set<number>();
  for (const offset of offsets) {
    const candidate = wallUtc - offset;
    if (wallParts(candidate, timeZone) === wallUtc) candidates.add(candidate);
  }
  return [...candidates].sort((a, b) => a - b);
};

const timestampShape = (value: string | undefined): 'EXPLICIT' | 'WALL' | 'MISSING' => {
  if (!value?.trim()) return 'MISSING';
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim()) ? 'EXPLICIT' : 'WALL';
};

const reconciliationReport = (
  timestamps: readonly (string | undefined)[],
  acceptedRows: number,
  rejectedRows: number,
  timezone: string | null,
): TimestampReconciliationReport => ({
  consideredRows: timestamps.length,
  acceptedRows,
  rejectedRows,
  explicitOffsetRows: timestamps.filter((value) => timestampShape(value) === 'EXPLICIT').length,
  wallClockRows: timestamps.filter((value) => timestampShape(value) === 'WALL').length,
  timezone,
  disambiguationPolicy: 'REJECT_AMBIGUOUS_OR_NONEXISTENT',
});

/**
 * Parse a timestamp without ever normalizing impossible calendar dates or DST wall times.
 * Timezone-less values in an IANA zone use a strict reject policy: gaps and ambiguous
 * fall-back times return NaN and must be supplied with an explicit UTC offset to import.
 */
export function parseTimestampInZone(value: string, timeZone: string | null, fallbackOffsetSeconds?: number): number {
  if (!value) return NaN;
  const parts = parseWallClockParts(value);
  if (!parts) return NaN;

  if (parts.explicitZone) {
    const parsed = Date.parse(parts.normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  const wallUtc = wallUtcSecond(parts);
  if (!Number.isFinite(wallUtc)) return NaN;

  if (timeZone) {
    try {
      const candidates = resolveIanaWallClock(wallUtc, timeZone);
      if (candidates.length !== 1) return NaN;
      return candidates[0] + parts.millisecond;
    } catch {
      if (typeof fallbackOffsetSeconds !== 'number' || !Number.isFinite(fallbackOffsetSeconds)) return NaN;
    }
  }
  if (typeof fallbackOffsetSeconds === 'number' && Number.isFinite(fallbackOffsetSeconds)) {
    return wallUtc + parts.millisecond - fallbackOffsetSeconds * 1000;
  }
  return wallUtc + parts.millisecond;
}

const validMeasurement = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function parseOpenMeteoJson(raw: string): ImportResult {
  let parsed: OpenMeteoResponse;
  try {
    parsed = JSON.parse(raw) as OpenMeteoResponse;
  } catch {
    return { dataset: null, errors: ['This file is not valid JSON. Export the raw Open-Meteo Air Quality API response and try again.'] };
  }

  const hourly = parsed.hourly;
  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
    return { dataset: null, errors: ['No hourly.time array was found. This does not look like an Open-Meteo Air Quality API response.'] };
  }

  const errors: string[] = [];
  const arrays: Record<string, (number | null)[] | undefined> = {
    pm10: hourly.pm10, pm2_5: hourly.pm2_5, carbon_monoxide: hourly.carbon_monoxide,
    nitrogen_dioxide: hourly.nitrogen_dioxide, sulphur_dioxide: hourly.sulphur_dioxide,
    ozone: hourly.ozone, uv_index: hourly.uv_index, uv_index_clear_sky: hourly.uv_index_clear_sky,
    wind_speed_10m: hourly.wind_speed_10m, us_aqi: hourly.us_aqi, european_aqi: hourly.european_aqi,
  };

  let length = hourly.time.length;
  for (const [key, values] of Object.entries(arrays)) {
    if (values && values.length !== hourly.time.length) {
      errors.push(`The "${key}" array length does not match "time". Only the overlapping rows were imported.`);
      length = Math.min(length, values.length);
    }
  }
  const truncatedByMismatch = Math.max(0, hourly.time.length - length);
  const capped = Math.min(length, MAX_ROWS);
  if (length > MAX_ROWS) errors.push(`This import has ${length} hourly rows; only the first ${MAX_ROWS} were loaded.`);

  const consideredTimestamps = hourly.time.slice(0, capped);
  const points: HourlyAtmosphericPoint[] = [];
  let invalidTimestamps = 0;
  for (let index = 0; index < capped; index += 1) {
    const iso = hourly.time[index];
    const epochMs = iso ? parseTimestampInZone(iso, parsed.timezone ?? null, parsed.utc_offset_seconds) : NaN;
    if (!iso || Number.isNaN(epochMs)) { invalidTimestamps += 1; continue; }
    points.push({
      isoTimestamp: iso,
      epochMs,
      pm25: validMeasurement(hourly.pm2_5?.[index]),
      pm10: validMeasurement(hourly.pm10?.[index]),
      carbonMonoxideUgM3: validMeasurement(hourly.carbon_monoxide?.[index]),
      nitrogenDioxide: validMeasurement(hourly.nitrogen_dioxide?.[index]),
      sulphurDioxide: validMeasurement(hourly.sulphur_dioxide?.[index]),
      ozone: validMeasurement(hourly.ozone?.[index]),
      uvIndex: validMeasurement(hourly.uv_index?.[index]),
      uvIndexClearSky: validMeasurement(hourly.uv_index_clear_sky?.[index]),
      windSpeedMs: validMeasurement(hourly.wind_speed_10m?.[index]),
      providedUsAqi: validMeasurement(hourly.us_aqi?.[index]),
      providedEuropeanAqi: validMeasurement(hourly.european_aqi?.[index]),
    });
  }
  if (invalidTimestamps > 0) errors.push(`${invalidTimestamps} row${invalidTimestamps === 1 ? '' : 's'} had invalid, nonexistent, or ambiguous timestamps and were skipped.`);
  if (points.length === 0) return { dataset: null, errors: [...errors, 'No usable hourly rows were found after validation.'] };

  return {
    dataset: {
      importSource: 'open-meteo-json',
      latitude: typeof parsed.latitude === 'number' ? parsed.latitude : null,
      longitude: typeof parsed.longitude === 'number' ? parsed.longitude : null,
      elevationMeters: typeof parsed.elevation === 'number' ? parsed.elevation : null,
      timezone: parsed.timezone ?? null,
      points,
      truncatedRows: truncatedByMismatch + invalidTimestamps,
      timestampReconciliation: reconciliationReport(consideredTimestamps, points.length, invalidTimestamps, parsed.timezone ?? null),
    },
    errors,
  };
}

export interface CsvColumnMap {
  timestamp: string;
  pm25?: string;
  pm10?: string;
  carbonMonoxideUgM3?: string;
  nitrogenDioxide?: string;
  sulphurDioxide?: string;
  ozone?: string;
  uvIndex?: string;
  uvIndexClearSky?: string;
  windSpeedMs?: string;
}

export type CsvMassUnit = 'UG_M3' | 'MG_M3';
export type CsvGasUnit = 'UG_M3' | 'PPB';
export type CsvCoUnit = 'UG_M3' | 'MG_M3' | 'PPM';
export type CsvWindUnit = 'M_S' | 'KM_H' | 'MPH';

export interface CsvUnitMap {
  pm25?: CsvMassUnit;
  pm10?: CsvMassUnit;
  carbonMonoxide?: CsvCoUnit;
  nitrogenDioxide?: CsvGasUnit;
  sulphurDioxide?: CsvGasUnit;
  ozone?: CsvGasUnit;
  windSpeed?: CsvWindUnit;
}

export interface CsvImportOptions {
  timezone?: string;
  units?: CsvUnitMap;
}

export function getCsvHeaders(raw: string): { headers: string[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(raw, { header: true, preview: 1, skipEmptyLines: true });
  return {
    headers: parsed.meta.fields?.filter(Boolean) ?? [],
    errors: parsed.errors.map((error) => error.message),
  };
}

const findHeader = (headers: readonly string[], candidates: readonly string[]): string | undefined => {
  const normalized = new Map(headers.map((header) => [header.toLowerCase().replace(/[^a-z0-9]+/g, ''), header]));
  for (const candidate of candidates) {
    const found = normalized.get(candidate.replace(/[^a-z0-9]+/g, ''));
    if (found) return found;
  }
  return undefined;
};

export function guessCsvColumnMap(headers: readonly string[]): CsvColumnMap {
  return {
    timestamp: findHeader(headers, ['timestamp', 'time', 'datetime', 'date']) ?? headers[0] ?? '',
    pm25: findHeader(headers, ['pm25', 'pm2_5', 'pm2.5']),
    pm10: findHeader(headers, ['pm10']),
    carbonMonoxideUgM3: findHeader(headers, ['carbonmonoxide', 'co']),
    nitrogenDioxide: findHeader(headers, ['nitrogendioxide', 'no2']),
    sulphurDioxide: findHeader(headers, ['sulphurdioxide', 'sulfurdioxide', 'so2']),
    ozone: findHeader(headers, ['ozone', 'o3']),
    uvIndex: findHeader(headers, ['uvindex', 'uvi', 'uv']),
    uvIndexClearSky: findHeader(headers, ['uvindexclearsky', 'uviclearsky']),
    windSpeedMs: findHeader(headers, ['windspeedms', 'windspeed', 'wind']),
  };
}

const massToUgM3 = (value: number, unit: CsvMassUnit | undefined): number => unit === 'MG_M3' ? value * 1000 : value;
const gasToUgM3 = (value: number, unit: CsvGasUnit | undefined, molarMass: number): number => unit === 'PPB' ? ppbToUgM3(value, molarMass) : value;
const coToUgM3 = (value: number, unit: CsvCoUnit | undefined): number => unit === 'PPM' ? ppmToUgM3(value) : unit === 'MG_M3' ? value * 1000 : value;
const windToMs = (value: number, unit: CsvWindUnit | undefined): number => unit === 'MPH' ? value * 0.44704 : unit === 'KM_H' ? value / 3.6 : value;

export function parseCsvWithMapping(raw: string, map: CsvColumnMap, options: CsvImportOptions = {}): ImportResult {
  const result = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    return { dataset: null, errors: result.errors.slice(0, 5).map((error) => `Row ${error.row ?? '?'}: ${error.message}`) };
  }
  if (!map.timestamp) return { dataset: null, errors: ['Choose a timestamp column before importing CSV data.'] };

  const rows = result.data.slice(0, MAX_ROWS);
  const truncated = Math.max(0, result.data.length - rows.length);
  const errors: string[] = truncated > 0 ? [`Only the first ${MAX_ROWS} rows were imported.`] : [];

  const toNumber = (value: string | undefined): number | null => {
    if (value === undefined || value.trim() === '') return null;
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
  };
  const mapped = (row: Record<string, string>, column: string | undefined, convert: (value: number) => number): number | null => {
    if (!column) return null;
    const value = toNumber(row[column]);
    return value === null ? null : convert(value);
  };

  const consideredTimestamps = rows.map((row) => row[map.timestamp]?.trim());
  const points: HourlyAtmosphericPoint[] = [];
  let skipped = 0;
  for (const row of rows) {
    const iso = row[map.timestamp]?.trim();
    const epochMs = iso ? parseTimestampInZone(iso, options.timezone?.trim() || null) : NaN;
    if (!iso || Number.isNaN(epochMs)) { skipped += 1; continue; }
    points.push({
      isoTimestamp: iso,
      epochMs,
      pm25: mapped(row, map.pm25, (value) => massToUgM3(value, options.units?.pm25)),
      pm10: mapped(row, map.pm10, (value) => massToUgM3(value, options.units?.pm10)),
      carbonMonoxideUgM3: mapped(row, map.carbonMonoxideUgM3, (value) => coToUgM3(value, options.units?.carbonMonoxide)),
      nitrogenDioxide: mapped(row, map.nitrogenDioxide, (value) => gasToUgM3(value, options.units?.nitrogenDioxide, 46.01)),
      sulphurDioxide: mapped(row, map.sulphurDioxide, (value) => gasToUgM3(value, options.units?.sulphurDioxide, 64.07)),
      ozone: mapped(row, map.ozone, (value) => gasToUgM3(value, options.units?.ozone, 48.0)),
      uvIndex: map.uvIndex ? toNumber(row[map.uvIndex]) : null,
      uvIndexClearSky: map.uvIndexClearSky ? toNumber(row[map.uvIndexClearSky]) : null,
      windSpeedMs: mapped(row, map.windSpeedMs, (value) => windToMs(value, options.units?.windSpeed)),
      providedUsAqi: null,
      providedEuropeanAqi: null,
    });
  }
  if (skipped > 0) errors.push(`${skipped} row${skipped === 1 ? '' : 's'} had invalid, nonexistent, or ambiguous timestamps and were skipped. Add an explicit UTC offset to disambiguate repeated wall times.`);
  if (points.length === 0) return { dataset: null, errors: [...errors, 'No usable rows were found. Check the timestamp column and timezone mapping.'] };

  points.sort((a, b) => a.epochMs - b.epochMs);
  const timezone = options.timezone?.trim() || null;
  return {
    dataset: {
      importSource: 'csv-mapped', latitude: null, longitude: null, elevationMeters: null,
      timezone, points, truncatedRows: truncated + skipped,
      timestampReconciliation: reconciliationReport(consideredTimestamps, points.length, skipped, timezone),
    },
    errors,
  };
}

export function parseAetherCastExport(raw: string): ImportResult {
  try {
    const parsed = JSON.parse(raw) as AetherCastDataset;
    if (!parsed.points || !Array.isArray(parsed.points)) throw new Error('missing points');
    const sourceTimestamps = parsed.points.map((point) => typeof point.isoTimestamp === 'string' ? point.isoTimestamp : undefined);
    const points = parsed.points
      .filter((point) => typeof point.isoTimestamp === 'string')
      .map((point) => ({ ...point, epochMs: parseTimestampInZone(point.isoTimestamp, parsed.timezone ?? null) }))
      .filter((point) => Number.isFinite(point.epochMs))
      .sort((a, b) => a.epochMs - b.epochMs);
    if (points.length === 0) throw new Error('no valid points');
    const rejectedRows = Math.max(0, parsed.points.length - points.length);
    return {
      dataset: {
        ...parsed,
        points,
        importSource: 'aethercast-export' as ImportSource,
        timestampReconciliation: parsed.timestampReconciliation
          ?? reconciliationReport(sourceTimestamps, points.length, rejectedRows, parsed.timezone ?? null),
      },
      errors: rejectedRows ? [`${rejectedRows} exported row${rejectedRows === 1 ? '' : 's'} had invalid, nonexistent, or ambiguous timestamps and were skipped.`] : [],
    };
  } catch {
    return { dataset: null, errors: ['This does not look like a valid previously exported AetherCast JSON file.'] };
  }
}
