import type { AdminLevel, ConfidenceClass, LatLon, ProfileField, SourceId } from '../core/types';

export interface AdapterResult {
  source: SourceId;
  point: LatLon | null;
  confidence: ConfidenceClass;
  label: string | null;
  countryCode: string | null;
  fields: ProfileField[];
  adminChain: AdminLevel[];
  warnings: string[];
  /** Raw record identifier for provenance (OSM id, postcode, …). */
  recordId: string | null;
  retrievedAt: string;
  stale: boolean;
  /** Other candidates from a search (label + point), best first. */
  alternatives?: Array<{ label: string; lat: number; lon: number }>;
}

export const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function emptyResult(source: SourceId, retrievedAt: string, stale: boolean): AdapterResult {
  return { source, point: null, confidence: 'modeled_grid', label: null, countryCode: null, fields: [], adminChain: [], warnings: [], recordId: null, retrievedAt, stale };
}

export const enc = encodeURIComponent;
