// Postal adapters: Zippopotam.us (70 countries) and Postcodes.io (UK depth).

import { field } from '../core/sources';
import type { PostalRequest } from '../core/postal';
import type { AdminLevel, ProfileField } from '../core/types';
import { TTL, type HttpClient } from '../net/http';
import { emptyResult, enc, num, str, type AdapterResult } from './common';

interface ZippoResponse {
  country: string;
  'country abbreviation': string;
  'post code': string;
  places: Array<{ 'place name': string; longitude: string; latitude: string; state: string; 'state abbreviation': string }>;
}

const RESOLVES_NOTE: Record<PostalRequest['resolves'], string> = {
  full_code: 'Centroid of the postal code as published by the source; postal codes are delivery routes, not guaranteed areas.',
  outward_code: 'UK outward code (district) centroid, coarser than a full postcode.',
  forward_sortation_area: 'Canadian forward sortation area (first three characters) centroid; the source does not publish full codes.',
  numeric_district: 'Dutch four-digit postal district centroid; the letter suffix is not published by the source.',
};

export async function zippopotamLookup(client: HttpClient, request: PostalRequest, signal?: AbortSignal): Promise<AdapterResult> {
  const url = `https://api.zippopotam.us/${enc(request.country.toLowerCase())}/${enc(request.code)}`;
  const response = await client.get<ZippoResponse>(url, { source: 'zippopotam', ttlMs: TTL.month, signal });
  const { data } = response;
  const result = emptyResult('zippopotam', response.retrievedAt, response.stale);
  const first = data.places?.[0];
  if (!first) { result.warnings.push(`No places published for ${request.display}`); return result; }
  const lat = num(first.latitude); const lon = num(first.longitude);
  const meta = { source: 'zippopotam' as const, geography: 'postal_code' as const, confidence: 'postal_centroid' as const, retrievedAt: response.retrievedAt, recordId: `${data['country abbreviation']}/${data['post code']}`, note: RESOLVES_NOTE[request.resolves] };
  result.point = lat !== null && lon !== null ? { lat, lon } : null;
  result.confidence = 'postal_centroid';
  result.countryCode = data['country abbreviation'];
  result.recordId = meta.recordId;
  result.label = `${data['post code']} ${first['place name']}`.trim();
  const others = data.places.slice(1).map((place) => place['place name']);
  result.fields = [
    field('address.postcode', 'Postal code', 'address', data['post code'], meta),
    field('address.place', 'Place name', 'address', first['place name'], { ...meta, geography: 'locality' }),
    field('admin.state', 'State / region', 'admin', str(first.state), { ...meta, geography: 'admin1' }),
    field('admin.stateCode', 'State / region code', 'admin', str(first['state abbreviation']), { ...meta, geography: 'admin1' }),
  ];
  if (others.length) {
    result.fields.push(field('address.otherPlaces', 'Other places sharing this code', 'address', others.slice(0, 12).join('; ') + (others.length > 12 ? ` (+${others.length - 12} more)` : ''), meta));
    result.warnings.push(`${data.places.length} places share ${data['post code']}; the first listed place's centroid is used.`);
  }
  if (first.state) result.adminChain.push({ level: 1, name: first.state, code: str(first['state abbreviation']), source: 'zippopotam' });
  return result;
}

interface PostcodesResult {
  postcode?: string;
  outcode: string;
  longitude: number | null;
  latitude: number | null;
  country: string | string[];
  region?: string | null;
  admin_district: string | string[] | null;
  admin_county?: string | string[] | null;
  admin_ward: string | string[] | null;
  parish: string | string[] | null;
  parliamentary_constituency: string | string[] | null;
  lsoa?: string | null;
  msoa?: string | null;
  quality?: number;
  codes?: Record<string, string | null>;
}

// Postcodes.io positional quality (docs/postcode/schema.mdx): 1–2 within the
// building, 3 within 50 m, 4 unit mean, 5 ONS estimate, 6 sector mean, 8 historic, 9 none.
const QUALITY_CONFIDENCE: Record<number, 'rooftop' | 'street' | 'postal_centroid'> = { 1: 'rooftop', 2: 'rooftop', 3: 'street', 4: 'postal_centroid', 5: 'postal_centroid', 6: 'postal_centroid', 8: 'postal_centroid', 9: 'postal_centroid' };

const joinList = (value: string | string[] | null | undefined) => (Array.isArray(value) ? value.filter(Boolean).join('; ') || null : str(value));

function postcodesFields(record: PostcodesResult, retrievedAt: string, outcodeOnly: boolean): { fields: ProfileField[]; chain: AdminLevel[] } {
  const confidence = outcodeOnly ? 'postal_centroid' as const : QUALITY_CONFIDENCE[record.quality ?? 9] ?? 'postal_centroid';
  const recordId = record.postcode ?? record.outcode;
  const meta = { source: 'postcodes-io' as const, geography: 'postal_code' as const, confidence, retrievedAt, recordId };
  const fields = [
    field('address.postcode', 'Postcode', 'address', record.postcode ?? record.outcode, { ...meta, note: outcodeOnly ? 'Outward code (postcode district) centroid.' : 'ONS Postcode Directory grid reference for this postcode.' }),
    field('admin.ukNation', 'UK nation', 'admin', joinList(record.country), { ...meta, geography: 'admin1' }),
    field('admin.ukRegion', 'Region', 'admin', str(record.region), { ...meta, geography: 'admin1' }),
    field('admin.district', 'Local authority district', 'admin', joinList(record.admin_district), { ...meta, geography: 'admin2' }),
    field('admin.county', 'County', 'admin', joinList(record.admin_county), { ...meta, geography: 'admin2' }),
    field('admin.ward', 'Electoral ward', 'admin', joinList(record.admin_ward), { ...meta, geography: 'admin3' }),
    field('admin.parish', 'Parish', 'admin', joinList(record.parish), { ...meta, geography: 'admin3' }),
    field('admin.constituency', 'Parliamentary constituency', 'admin', joinList(record.parliamentary_constituency), { ...meta, geography: 'admin2' }),
    field('codes.lsoa', 'LSOA', 'codes', str(record.lsoa), { ...meta, geography: 'admin3' }),
    field('codes.msoa', 'MSOA', 'codes', str(record.msoa), { ...meta, geography: 'admin3' }),
    field('codes.itl3', 'ITL 3 code (UK successor to NUTS 3)', 'codes', str(record.codes?.nuts), { ...meta, geography: 'nuts3' }),
    field('codes.gssDistrict', 'GSS code (district)', 'codes', str(record.codes?.admin_district), { ...meta, geography: 'admin2' }),
  ];
  const chain: AdminLevel[] = [];
  const nation = joinList(record.country); if (nation) chain.push({ level: 1, name: nation, code: null, source: 'postcodes-io' });
  const district = joinList(record.admin_district); if (district) chain.push({ level: 2, name: district, code: str(record.codes?.admin_district), source: 'postcodes-io' });
  const ward = joinList(record.admin_ward); if (ward) chain.push({ level: 3, name: ward, code: str(record.codes?.admin_ward), source: 'postcodes-io' });
  return { fields, chain };
}

export async function postcodesLookup(client: HttpClient, request: PostalRequest, signal?: AbortSignal): Promise<AdapterResult> {
  const outcodeOnly = request.resolves === 'outward_code';
  const url = outcodeOnly ? `https://api.postcodes.io/outcodes/${enc(request.code)}` : `https://api.postcodes.io/postcodes/${enc(request.code)}`;
  const response = await client.get<{ result: PostcodesResult }>(url, { source: 'postcodes-io', ttlMs: TTL.month, signal });
  const record = response.data.result;
  const result = emptyResult('postcodes-io', response.retrievedAt, response.stale);
  const { fields, chain } = postcodesFields(record, response.retrievedAt, outcodeOnly);
  result.fields = fields;
  result.adminChain = chain;
  result.countryCode = 'GB';
  result.recordId = record.postcode ?? record.outcode;
  result.label = record.postcode ?? record.outcode;
  if (record.latitude !== null && record.longitude !== null) result.point = { lat: record.latitude, lon: record.longitude };
  else result.warnings.push('This postcode has no published grid reference.');
  result.confidence = fields[0].confidence_class;
  if (/^BT/i.test(request.code)) result.warnings.push('Northern Ireland (BT) postcode data is free for non-commercial use only (ONSPD licence).');
  return result;
}

/** Nearest UK postcode to a point (depth layer for UK map clicks / searches). */
export async function postcodesReverse(client: HttpClient, lat: number, lon: number, signal?: AbortSignal): Promise<AdapterResult | null> {
  const url = `https://api.postcodes.io/postcodes?lon=${lon.toFixed(5)}&lat=${lat.toFixed(5)}&limit=1&radius=500`;
  const response = await client.get<{ result: PostcodesResult[] | null }>(url, { source: 'postcodes-io', ttlMs: TTL.month, signal });
  const record = response.data.result?.[0];
  if (!record) return null;
  const result = emptyResult('postcodes-io', response.retrievedAt, response.stale);
  const { fields, chain } = postcodesFields(record, response.retrievedAt, false);
  result.fields = fields.map((item) => (item.key === 'address.postcode' ? { ...item, label: 'Nearest postcode', note: 'Nearest postcode centroid within 500 m of the point.' } : item));
  result.adminChain = chain;
  result.countryCode = 'GB';
  result.recordId = record.postcode ?? null;
  return result;
}
