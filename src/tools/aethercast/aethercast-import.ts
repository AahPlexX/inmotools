import Papa from 'papaparse';
import type { AetherCastDataset, HourlyAtmosphericPoint, ImportSource } from './aethercast-types';

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
  hourly?: OpenMeteoHourly;
}

const MAX_ROWS = 17_520;

export function parseOpenMeteoJson(raw: string): ImportResult {
  let parsed: OpenMeteoResponse;
  try {
    parsed = JSON.parse(raw) as OpenMeteoResponse;
  } catch {
    return {
      dataset: null,
      errors: ['This file is not valid JSON. Export the raw Open-Meteo Air Quality API response and try again.'],
    };
  }

  const hourly = parsed.hourly;
  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
    return {
      dataset: null,
      errors: ['No hourly.time array was found. This does not look like an Open-Meteo Air Quality API response.'],
    };
  }

  const errors: string[] = [];
  const arrays: Record<string, (number | null)[] | undefined> = {
    pm10: hourly.pm10,
    pm2_5: hourly.pm2_5,
    carbon_monoxide: hourly.carbon_monoxide,
    nitrogen_dioxide: hourly.nitrogen_dioxide,
    sulphur_dioxide: hourly.sulphur_dioxide,
    ozone: hourly.ozone,
    uv_index: hourly.uv_index,
    uv_index_clear_sky: hourly.uv_index_clear_sky,
    wind_speed_10m: hourly.wind_speed_10m,
    us_aqi: hourly.us_aqi,
    european_aqi: hourly.european_aqi,
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
  if (length > MAX_ROWS) {
    errors.push(`This import has ${length} hourly rows; only the first ${MAX_ROWS} (about two years) were loaded to keep the browser responsive.`);
  }

  const points: HourlyAtmosphericPoint[] = [];
  for (let index = 0; index < capped; index += 1) {
    const iso = hourly.time[index];
    const epochMs = Date.parse(iso);
    if (!iso || Number.isNaN(epochMs)) continue;
    points.push({
      isoTimestamp: iso,
      epochMs,
      pm25: hourly.pm2_5?.[index] ?? null,
      pm10: hourly.pm10?.[index] ?? null,
      carbonMonoxideUgM3: hourly.carbon_monoxide?.[index] ?? null,
      nitrogenDioxide: hourly.nitrogen_dioxide?.[index] ?? null,
      sulphurDioxide: hourly.sulphur_dioxide?.[index] ?? null,
      ozone: hourly.ozone?.[index] ?? null,
      uvIndex: hourly.uv_index?.[index] ?? null,
      uvIndexClearSky: hourly.uv_index_clear_sky?.[index] ?? null,
      windSpeedMs: hourly.wind_speed_10m?.[index] ?? null,
      providedUsAqi: hourly.us_aqi?.[index] ?? null,
      providedEuropeanAqi: hourly.european_aqi?.[index] ?? null,
    });
  }

  if (points.length === 0) {
    return { dataset: null, errors: [...errors, 'No usable hourly rows were found after validation.'] };
  }

  return {
    dataset: {
      importSource: 'open-meteo-json',
      latitude: typeof parsed.latitude === 'number' ? parsed.latitude : null,
      longitude: typeof parsed.longitude === 'number' ? parsed.longitude : null,
      elevationMeters: typeof parsed.elevation === 'number' ? parsed.elevation : null,
      timezone: parsed.timezone ?? null,
      points,
      truncatedRows: truncatedByMismatch,
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
  windSpeedMs?: string;
}

export function parseCsvWithMapping(raw: string, map: CsvColumnMap): ImportResult {
  const result = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    return {
      dataset: null,
      errors: result.errors.slice(0, 5).map((error) => `Row ${error.row ?? '?'}: ${error.message}`),
    };
  }

  const rows = result.data.slice(0, MAX_ROWS);
  const truncated = Math.max(0, result.data.length - rows.length);

  const toNumber = (value: string | undefined): number | null => {
    if (value === undefined || value.trim() === '') return null;
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  };

  const points: HourlyAtmosphericPoint[] = [];
  for (const row of rows) {
    const iso = row[map.timestamp];
    const epochMs = iso ? Date.parse(iso) : NaN;
    if (!iso || Number.isNaN(epochMs)) continue;
    points.push({
      isoTimestamp: iso,
      epochMs,
      pm25: map.pm25 ? toNumber(row[map.pm25]) : null,
      pm10: map.pm10 ? toNumber(row[map.pm10]) : null,
      carbonMonoxideUgM3: map.carbonMonoxideUgM3 ? toNumber(row[map.carbonMonoxideUgM3]) : null,
      nitrogenDioxide: map.nitrogenDioxide ? toNumber(row[map.nitrogenDioxide]) : null,
      sulphurDioxide: map.sulphurDioxide ? toNumber(row[map.sulphurDioxide]) : null,
      ozone: map.ozone ? toNumber(row[map.ozone]) : null,
      uvIndex: map.uvIndex ? toNumber(row[map.uvIndex]) : null,
      uvIndexClearSky: null,
      windSpeedMs: map.windSpeedMs ? toNumber(row[map.windSpeedMs]) : null,
      providedUsAqi: null,
      providedEuropeanAqi: null,
    });
  }

  if (points.length === 0) {
    return { dataset: null, errors: ['No usable rows were found. Check the timestamp column mapping.'] };
  }

  return {
    dataset: {
      importSource: 'csv-mapped',
      latitude: null,
      longitude: null,
      elevationMeters: null,
      timezone: null,
      points,
      truncatedRows: truncated,
    },
    errors: truncated > 0 ? [`Only the first ${MAX_ROWS} rows were imported to keep the browser responsive.`] : [],
  };
}

export function parseAetherCastExport(raw: string): ImportResult {
  try {
    const parsed = JSON.parse(raw) as AetherCastDataset;
    if (!parsed.points || !Array.isArray(parsed.points)) throw new Error('missing points');
    return { dataset: { ...parsed, importSource: 'aethercast-export' as ImportSource }, errors: [] };
  } catch {
    return { dataset: null, errors: ['This does not look like a previously exported AetherCast JSON file.'] };
  }
}
