import { km2ToMi2, kmToMiles, metresToFeet } from '../core/geodesy';
import type { ProfileField } from '../core/types';
import type { GeoIntelSettings } from '../net/store';

export type Units = GeoIntelSettings['units'];

const nf = (digits: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits });

export function formatNumber(value: number, digits = 2): string {
  return nf(Math.abs(value) >= 1000 ? Math.min(digits, 1) : digits).format(value);
}

export function formatTime(iso: string | null | undefined, zone: string | null, withDate = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: zone ?? 'UTC', hour: '2-digit', minute: '2-digit', ...(withDate ? { month: 'short', day: 'numeric' } : {}) }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export function formatInterval(value: string, zone: string | null): string {
  const [a, b] = value.split(' – ');
  return b ? `${formatTime(a, zone)} – ${formatTime(b, zone)}` : formatTime(a, zone);
}

export function formatDistance(km: number, units: Units): string {
  const metric = km < 1 ? `${formatNumber(km * 1000, 0)} m` : `${formatNumber(km, km < 10 ? 2 : 1)} km`;
  const imperial = `${formatNumber(kmToMiles(km), km < 10 ? 2 : 1)} mi`;
  return units === 'metric' ? metric : units === 'imperial' ? imperial : `${metric} (${imperial})`;
}

export function formatArea(km2: number, units: Units): string {
  const metric = `${formatNumber(km2, km2 < 10 ? 3 : 1)} km²`;
  const imperial = `${formatNumber(km2ToMi2(km2), km2 < 10 ? 3 : 1)} mi²`;
  return units === 'metric' ? metric : units === 'imperial' ? imperial : `${metric} (${imperial})`;
}

export function formatElevation(m: number, units: Units): string {
  const metric = `${formatNumber(m, 0)} m`;
  const imperial = `${formatNumber(metresToFeet(m), 0)} ft`;
  return units === 'metric' ? metric : units === 'imperial' ? imperial : `${metric} (${imperial})`;
}

export function formatDurationSeconds(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/** Human rendering of any profile field. */
export function displayValue(item: ProfileField, zone: string | null, units: Units): string {
  const { value } = item;
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (item.unit === 'ISO 8601 instant' && typeof value === 'string') return formatTime(value, zone);
  if (item.unit === 'ISO 8601 interval' && typeof value === 'string') return formatInterval(value, zone);
  if (item.unit === 's' && typeof value === 'number') return formatDurationSeconds(value);
  if (item.key === 'elevation.metres' && typeof value === 'number') return formatElevation(value, units);
  if (item.key === 'country.areaKm2' && typeof value === 'number') return formatArea(value, units);
  if (item.key === 'tz.nextTransition' && typeof value === 'string') {
    const [iso, rest] = value.split(' (');
    return `${formatTime(iso, zone, true)}${rest ? ` (${rest}` : ''}`;
  }
  if (typeof value === 'number') {
    const digits = item.unit === 'people' ? 0 : 2;
    const unit = item.unit && !['°', '° (WGS 84)', 'people', 'm', 'ft'].includes(item.unit) ? ` ${item.unit}` : '';
    return `${item.unit === '° (WGS 84)' ? value.toFixed(6) : formatNumber(value, digits)}${unit}`;
  }
  return String(value);
}

export const CONFIDENCE_LABEL: Record<string, string> = {
  rooftop: 'Rooftop / exact',
  street: 'Street level',
  postal_centroid: 'Postal-code centroid',
  locality_centroid: 'Locality centroid',
  admin_centroid: 'Administrative area',
  modeled_grid: 'Modelled / gridded',
};

export const CONFIDENCE_HELP: Record<string, string> = {
  rooftop: 'Precise to a building or better (≤ 30 m).',
  street: 'Precise to a street segment (≤ 250 m).',
  postal_centroid: 'Centre point of a postal code area or route.',
  locality_centroid: 'Centre point of a town, district, or neighbourhood.',
  admin_centroid: 'Describes a whole administrative area (region, country).',
  modeled_grid: 'Derived from a raster grid or a physical model.',
};
