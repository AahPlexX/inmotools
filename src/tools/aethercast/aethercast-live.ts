import { parseOpenMeteoJson } from './aethercast-import';
import type { AetherCastDataset } from './aethercast-types';

const AIR_QUALITY_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const LOCATION_STORAGE_KEY = 'inmotools.aethercast.live-location.v1';

export const LIVE_REFRESH_MS = 15 * 60 * 1000;
export const LIVE_PAST_HOURS = 24;
export const LIVE_FORECAST_HOURS = 72;

const AIR_QUALITY_HOURLY = [
  'pm2_5',
  'pm10',
  'carbon_monoxide',
  'nitrogen_dioxide',
  'sulphur_dioxide',
  'ozone',
  'uv_index',
  'uv_index_clear_sky',
  'us_aqi',
  'european_aqi',
] as const;

export interface LiveLocation {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone?: string | null;
}

export interface LiveAetherCastResult {
  readonly dataset: AetherCastDataset;
  readonly warnings: string[];
  readonly fetchedAt: number;
}

interface OpenMeteoHourlyResponse {
  readonly time?: string[];
  readonly wind_speed_10m?: Array<number | null>;
  readonly [key: string]: unknown;
}

interface OpenMeteoApiResponse {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly elevation?: number;
  readonly timezone?: string;
  readonly utc_offset_seconds?: number;
  readonly hourly?: OpenMeteoHourlyResponse;
  readonly error?: boolean;
  readonly reason?: string;
  readonly [key: string]: unknown;
}

interface GeocodingResponse {
  readonly results?: Array<{
    readonly id?: number;
    readonly name?: string;
    readonly latitude?: number;
    readonly longitude?: number;
    readonly timezone?: string;
    readonly country?: string;
    readonly admin1?: string;
  }>;
  readonly reason?: string;
}

const roundCoordinate = (value: number): number => Math.round(value * 1000) / 1000;

const requestJson = async <T>(url: URL, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The status below still gives a useful failure when the upstream body is not JSON.
  }
  if (!response.ok) {
    const reason = payload && typeof payload === 'object' && 'reason' in payload && typeof payload.reason === 'string'
      ? payload.reason
      : `${response.status} ${response.statusText}`.trim();
    throw new Error(`Open-Meteo request failed: ${reason}`);
  }
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error === true) {
    const reason = 'reason' in payload && typeof payload.reason === 'string' ? payload.reason : 'The API rejected this request.';
    throw new Error(`Open-Meteo request failed: ${reason}`);
  }
  return payload as T;
};

const baseLiveParams = (location: LiveLocation): URLSearchParams => new URLSearchParams({
  latitude: String(location.latitude),
  longitude: String(location.longitude),
  past_hours: String(LIVE_PAST_HOURS),
  forecast_hours: String(LIVE_FORECAST_HOURS),
  timezone: 'auto',
});

const mergeWind = (
  air: OpenMeteoApiResponse,
  weather: OpenMeteoApiResponse,
): { merged: OpenMeteoApiResponse; warning: string | null } => {
  const airTimes = Array.isArray(air.hourly?.time) ? air.hourly.time : [];
  const weatherTimes = Array.isArray(weather.hourly?.time) ? weather.hourly.time : [];
  const weatherWinds = Array.isArray(weather.hourly?.wind_speed_10m) ? weather.hourly.wind_speed_10m : [];
  const windByTime = new Map<string, number | null>();
  for (let index = 0; index < Math.min(weatherTimes.length, weatherWinds.length); index += 1) {
    const timestamp = weatherTimes[index];
    if (timestamp) windByTime.set(timestamp, weatherWinds[index] ?? null);
  }
  const alignedWind = airTimes.map((timestamp) => windByTime.get(timestamp) ?? null);
  const missing = alignedWind.filter((value) => value === null).length;
  return {
    merged: {
      ...air,
      hourly: {
        ...(air.hourly ?? {}),
        wind_speed_10m: alignedWind,
      },
    },
    warning: airTimes.length > 0 && missing > 0
      ? `Wind speed was unavailable for ${missing} of ${airTimes.length} live hourly rows; those wind values remain unknown.`
      : null,
  };
};

export async function fetchLiveAetherCastDataset(location: LiveLocation, signal?: AbortSignal): Promise<LiveAetherCastResult> {
  const airUrl = new URL(AIR_QUALITY_API);
  airUrl.search = baseLiveParams(location).toString();
  airUrl.searchParams.set('hourly', AIR_QUALITY_HOURLY.join(','));

  const weatherUrl = new URL(FORECAST_API);
  weatherUrl.search = baseLiveParams(location).toString();
  weatherUrl.searchParams.set('hourly', 'wind_speed_10m');
  weatherUrl.searchParams.set('wind_speed_unit', 'ms');

  const [air, weather] = await Promise.all([
    requestJson<OpenMeteoApiResponse>(airUrl, signal),
    requestJson<OpenMeteoApiResponse>(weatherUrl, signal),
  ]);
  const { merged, warning } = mergeWind(air, weather);
  const parsed = parseOpenMeteoJson(JSON.stringify(merged));
  if (!parsed.dataset) {
    throw new Error(parsed.errors.join(' ') || 'Open-Meteo returned no usable hourly data.');
  }
  return {
    dataset: { ...parsed.dataset, importSource: 'open-meteo-live' },
    warnings: warning ? [...parsed.errors, warning] : parsed.errors,
    fetchedAt: Date.now(),
  };
}

const locationLabel = (result: NonNullable<GeocodingResponse['results']>[number]): string => {
  const pieces = [result.name, result.admin1, result.country].filter((value): value is string => Boolean(value?.trim()));
  return [...new Set(pieces)].join(', ');
};

export async function searchOpenMeteoLocations(query: string, signal?: AbortSignal): Promise<LiveLocation[]> {
  const name = query.trim();
  if (name.length < 2) return [];
  const url = new URL(GEOCODING_API);
  url.search = new URLSearchParams({ name, count: '5', language: 'en', format: 'json' }).toString();
  const payload = await requestJson<GeocodingResponse>(url, signal);
  const seen = new Set<string>();
  const locations: LiveLocation[] = [];
  for (const result of payload.results ?? []) {
    if (typeof result.latitude !== 'number' || !Number.isFinite(result.latitude)
      || typeof result.longitude !== 'number' || !Number.isFinite(result.longitude)) continue;
    const label = locationLabel(result);
    if (!label) continue;
    const key = `${label}|${result.latitude}|${result.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({
      label,
      latitude: roundCoordinate(result.latitude),
      longitude: roundCoordinate(result.longitude),
      timezone: result.timezone ?? null,
    });
  }
  return locations;
}

export async function getBrowserLiveLocation(): Promise<LiveLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Browser location is unavailable. Search by city or postal code instead.');
  }
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8_000,
      maximumAge: LIVE_REFRESH_MS,
    });
  });
  return {
    label: 'Current location',
    latitude: roundCoordinate(position.coords.latitude),
    longitude: roundCoordinate(position.coords.longitude),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  };
}

const validStoredLocation = (value: unknown): value is LiveLocation => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LiveLocation>;
  return typeof candidate.label === 'string' && candidate.label.length > 0 && candidate.label.length <= 160
    && typeof candidate.latitude === 'number' && Number.isFinite(candidate.latitude) && candidate.latitude >= -90 && candidate.latitude <= 90
    && typeof candidate.longitude === 'number' && Number.isFinite(candidate.longitude) && candidate.longitude >= -180 && candidate.longitude <= 180
    && (candidate.timezone === undefined || candidate.timezone === null || typeof candidate.timezone === 'string');
};

export function readSavedLiveLocation(storage?: Pick<Storage, 'getItem'>): LiveLocation | null {
  try {
    const source = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    const raw = source?.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; location?: unknown };
    return parsed.version === 1 && validStoredLocation(parsed.location) ? parsed.location : null;
  } catch {
    return null;
  }
}

export function writeSavedLiveLocation(location: LiveLocation, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    target?.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ version: 1, location }));
  } catch {
    // Persistence is an enhancement; live loading remains usable without storage access.
  }
}
