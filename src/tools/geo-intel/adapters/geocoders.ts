// Geocoders: BigDataCloud (device location only), Photon, Nominatim (opt-in).

import { field } from '../core/sources';
import type { AdminLevel, ConfidenceClass, GeographyType, SourceId } from '../core/types';
import { TTL, type HttpClient } from '../net/http';
import { emptyResult, enc, num, str, type AdapterResult } from './common';

// ---------------- BigDataCloud (client-side, device location only) ----------------

interface BdcAdmin { name: string; isoCode?: string; adminLevel?: number; order: number; wikidataId?: string; geonameId?: number }
interface BdcResponse {
  latitude: number; longitude: number; countryName: string; countryCode: string; principalSubdivision: string; principalSubdivisionCode: string;
  city: string; locality: string; postcode: string; localityInfo?: { administrative?: BdcAdmin[] };
}

export function deviceConfidence(accuracyMetres: number | null): ConfidenceClass {
  if (accuracyMetres === null) return 'locality_centroid';
  if (accuracyMetres <= 30) return 'rooftop';
  if (accuracyMetres <= 250) return 'street';
  return 'locality_centroid';
}

/**
 * Must only be called with the device's current position from the Geolocation
 * API (BigDataCloud fair-use policy for the free client endpoint).
 */
export async function bigDataCloudDevice(client: HttpClient, position: { lat: number; lon: number }, signal?: AbortSignal): Promise<AdapterResult> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.lat.toFixed(6)}&longitude=${position.lon.toFixed(6)}&localityLanguage=en`;
  const response = await client.get<BdcResponse>(url, { source: 'bigdatacloud', ttlMs: TTL.day, signal });
  const d = response.data;
  const result = emptyResult('bigdatacloud', response.retrievedAt, response.stale);
  const meta = { source: 'bigdatacloud' as const, confidence: 'locality_centroid' as const, retrievedAt: response.retrievedAt, geography: 'locality' as GeographyType };
  result.countryCode = str(d.countryCode);
  result.label = [str(d.locality), str(d.city), str(d.countryName)].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') || null;
  result.fields = [
    field('address.locality', 'Locality', 'address', str(d.locality), meta),
    field('address.city', 'City', 'address', str(d.city), meta),
    field('address.postcode', 'Postal code', 'address', str(d.postcode), { ...meta, geography: 'postal_code' }),
    field('admin.state', 'State / region', 'admin', str(d.principalSubdivision), { ...meta, geography: 'admin1', confidence: 'admin_centroid' }),
    field('admin.stateCode', 'State / region code (ISO 3166-2)', 'admin', str(d.principalSubdivisionCode), { ...meta, geography: 'admin1', confidence: 'admin_centroid' }),
  ];
  const admins = (d.localityInfo?.administrative ?? []).filter((item) => typeof item.adminLevel === 'number' && item.adminLevel > 2).sort((a, b) => a.order - b.order);
  const seen = new Set<string>();
  for (const item of admins) {
    const key = `${item.adminLevel}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.adminChain.push({ level: Math.max(1, (item.adminLevel ?? 4) - 2), name: item.name, code: str(item.isoCode), source: 'bigdatacloud', wikidata: str(item.wikidataId), geonameId: item.geonameId ?? null });
  }
  return result;
}

// ---------------- Photon ----------------

interface PhotonFeature {
  properties: {
    osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; type?: string; name?: string; housenumber?: string; street?: string;
    locality?: string; district?: string; city?: string; county?: string; state?: string; country?: string; countrycode?: string; postcode?: string;
    extent?: [number, number, number, number];
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

export function photonConfidence(type: string | undefined): { confidence: ConfidenceClass; geography: GeographyType } {
  switch (type) {
    case 'house': return { confidence: 'rooftop', geography: 'point' };
    case 'street': return { confidence: 'street', geography: 'point' };
    case 'locality': case 'district': case 'city': case 'other': return { confidence: 'locality_centroid', geography: 'locality' };
    case 'county': return { confidence: 'admin_centroid', geography: 'admin2' };
    case 'state': return { confidence: 'admin_centroid', geography: 'admin1' };
    case 'country': return { confidence: 'admin_centroid', geography: 'country' };
    default: return { confidence: 'locality_centroid', geography: 'locality' };
  }
}

function photonResult(feature: PhotonFeature, retrievedAt: string, stale: boolean, reverse: boolean): AdapterResult {
  const p = feature.properties;
  const result = emptyResult('photon', retrievedAt, stale);
  const { confidence, geography } = photonConfidence(p.type);
  const recordId = p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : null;
  const meta = { source: 'photon' as const, geography, confidence, retrievedAt, recordId, geometryId: recordId };
  const [lon, lat] = feature.geometry.coordinates;
  result.point = { lat, lon };
  result.confidence = confidence;
  result.countryCode = str(p.countrycode)?.toUpperCase() ?? null;
  result.recordId = recordId;
  const street = [str(p.street), str(p.housenumber)].filter(Boolean).join(' ');
  result.label = [str(p.name), street || null, str(p.city), str(p.country)].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') || null;
  result.fields = [
    field('address.name', 'Place', 'address', str(p.name), meta),
    field('address.street', 'Street', 'address', street || null, { ...meta, confidence: 'street' }),
    field('address.locality', 'Locality', 'address', str(p.locality) ?? str(p.district), { ...meta, geography: 'locality', confidence: 'locality_centroid' }),
    field('address.city', 'City', 'address', str(p.city), { ...meta, geography: 'locality', confidence: 'locality_centroid' }),
    field('address.postcode', 'Postal code', 'address', str(p.postcode), { ...meta, geography: 'postal_code', confidence: 'postal_centroid' }),
    field('admin.county', 'County', 'admin', str(p.county), { ...meta, geography: 'admin2', confidence: 'admin_centroid' }),
    field('admin.state', 'State / region', 'admin', str(p.state), { ...meta, geography: 'admin1', confidence: 'admin_centroid' }),
    field('address.osmType', 'OSM feature type', 'address', [p.osm_key, p.osm_value].filter(Boolean).join('=') || null, meta),
  ];
  if (p.state) result.adminChain.push({ level: 1, name: p.state, code: null, source: 'photon' });
  if (p.county) result.adminChain.push({ level: 2, name: p.county, code: null, source: 'photon' });
  if (reverse) result.warnings.push('Nearest OpenStreetMap feature to the point.');
  return result;
}

export async function photonSearch(client: HttpClient, text: string, signal?: AbortSignal): Promise<AdapterResult | null> {
  const url = `https://photon.komoot.io/api/?q=${enc(text)}&limit=1&lang=en`;
  const response = await client.get<{ features: PhotonFeature[] }>(url, { source: 'photon', ttlMs: TTL.week, signal });
  const first = response.data.features?.[0];
  if (!first) return null;
  const result = photonResult(first, response.retrievedAt, response.stale, false);
  const extent = first.properties.extent;
  if (extent) result.fields.push(field('location.extent', 'Feature extent (W,N,E,S)', 'location', extent.join(', '), { source: 'photon', geography: result.fields[0].geography_type, confidence: result.confidence, retrievedAt: response.retrievedAt, recordId: result.recordId }));
  return result;
}

export async function photonReverse(client: HttpClient, lat: number, lon: number, signal?: AbortSignal): Promise<AdapterResult | null> {
  const url = `https://photon.komoot.io/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&limit=1&lang=en`;
  const response = await client.get<{ features: PhotonFeature[] }>(url, { source: 'photon', ttlMs: TTL.week, signal });
  const first = response.data.features?.[0];
  return first ? photonResult(first, response.retrievedAt, response.stale, true) : null;
}

// ---------------- Nominatim (opt-in, last resort) ----------------

interface NominatimPlace {
  osm_type?: string; osm_id?: number; lat: string; lon: string; place_rank?: number; display_name?: string; name?: string; addresstype?: string;
  address?: Record<string, string>; boundingbox?: [string, string, string, string];
}

export function nominatimConfidence(rank: number | undefined): { confidence: ConfidenceClass; geography: GeographyType } {
  const r = rank ?? 16;
  if (r >= 30) return { confidence: 'rooftop', geography: 'point' };
  if (r >= 26) return { confidence: 'street', geography: 'point' };
  if (r >= 13) return { confidence: 'locality_centroid', geography: 'locality' };
  // Nominatim search ranks: 4 country, 8 state, 12 county, 16 city, 26–27 streets, 30 houses/POIs.
  if (r >= 5) return { confidence: 'admin_centroid', geography: r >= 10 ? 'admin2' : 'admin1' };
  return { confidence: 'admin_centroid', geography: 'country' };
}

function nominatimResult(place: NominatimPlace, retrievedAt: string, stale: boolean): AdapterResult {
  const a = place.address ?? {};
  const result = emptyResult('nominatim', retrievedAt, stale);
  const { confidence, geography } = nominatimConfidence(place.place_rank);
  const recordId = place.osm_type && place.osm_id ? `${place.osm_type.charAt(0).toUpperCase()}${place.osm_id}` : null;
  const meta = { source: 'nominatim' as const, geography, confidence, retrievedAt, recordId, geometryId: recordId };
  const lat = num(place.lat); const lon = num(place.lon);
  result.point = lat !== null && lon !== null ? { lat, lon } : null;
  result.confidence = confidence;
  result.countryCode = str(a.country_code)?.toUpperCase() ?? null;
  result.recordId = recordId;
  result.label = str(place.display_name);
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? null;
  result.fields = [
    field('address.name', 'Place', 'address', str(place.name), meta),
    field('address.street', 'Street', 'address', [a.road, a.house_number].filter(Boolean).join(' ') || null, { ...meta, confidence: 'street' }),
    field('address.locality', 'Locality', 'address', a.suburb ?? a.quarter ?? a.neighbourhood ?? null, { ...meta, geography: 'locality', confidence: 'locality_centroid' }),
    field('address.city', 'City', 'address', city, { ...meta, geography: 'locality', confidence: 'locality_centroid' }),
    field('address.postcode', 'Postal code', 'address', a.postcode ?? null, { ...meta, geography: 'postal_code', confidence: 'postal_centroid' }),
    field('admin.county', 'County', 'admin', a.county ?? null, { ...meta, geography: 'admin2', confidence: 'admin_centroid' }),
    field('admin.state', 'State / region', 'admin', a.state ?? null, { ...meta, geography: 'admin1', confidence: 'admin_centroid' }),
    field('admin.stateCode', 'State / region code (ISO 3166-2)', 'admin', a['ISO3166-2-lvl4'] ?? a['ISO3166-2-lvl3'] ?? null, { ...meta, geography: 'admin1', confidence: 'admin_centroid' }),
    field('address.display', 'Full address (OSM)', 'address', str(place.display_name), meta),
  ];
  const chain: AdminLevel[] = [];
  if (a.state) chain.push({ level: 1, name: a.state, code: a['ISO3166-2-lvl4'] ?? null, source: 'nominatim' });
  if (a.county) chain.push({ level: 2, name: a.county, code: a['ISO3166-2-lvl6'] ?? null, source: 'nominatim' });
  if (a.city_district ?? a.suburb) chain.push({ level: 3, name: (a.city_district ?? a.suburb) as string, code: null, source: 'nominatim' });
  result.adminChain = chain;
  return result;
}

export async function nominatimSearch(client: HttpClient, text: string, signal?: AbortSignal): Promise<AdapterResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${enc(text)}&format=jsonv2&limit=1&addressdetails=1&accept-language=en`;
  const response = await client.get<NominatimPlace[]>(url, { source: 'nominatim', ttlMs: TTL.month, signal });
  const first = response.data?.[0];
  return first ? nominatimResult(first, response.retrievedAt, response.stale) : null;
}

export async function nominatimReverse(client: HttpClient, lat: number, lon: number, signal?: AbortSignal): Promise<AdapterResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&format=jsonv2&addressdetails=1&zoom=18&accept-language=en`;
  const response = await client.get<NominatimPlace & { error?: string }>(url, { source: 'nominatim', ttlMs: TTL.month, signal });
  return response.data && !response.data.error ? nominatimResult(response.data, response.retrievedAt, response.stale) : null;
}

export const GEOCODER_SOURCES: SourceId[] = ['bigdatacloud', 'photon', 'nominatim'];
