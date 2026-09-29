// Registry of every data source the tool may use. Licensing and usage-policy
// text here is what the provenance inspector and attribution footer display.

import type { ConfidenceClass, FieldGroup, FieldValue, GeographyType, ProfileField, Provenance, SourceId } from './types';

export interface SourceInfo {
  id: SourceId;
  name: string;
  homepage: string;
  license: string;
  attribution: string;
  /** Usage rule the adapter enforces; shown in the source-controls panel. */
  policy: string;
  network: boolean;
  /** Visible link is a license/terms requirement. */
  requiresVisibleLink: boolean;
}

const s = (info: SourceInfo) => info;

export const SOURCES: Record<SourceId, SourceInfo> = {
  zippopotam: s({ id: 'zippopotam', name: 'Zippopotam.us', homepage: 'https://www.zippopotam.us/', license: 'ODbL 1.0 (database) / DbCL 1.0 (contents)', attribution: 'Postal data: Zippopotam.us (ODbL)', policy: 'User-triggered lookups; batch rows are throttled to one request per second.', network: true, requiresVisibleLink: true }),
  'postcodes-io': s({ id: 'postcodes-io', name: 'Postcodes.io', homepage: 'https://postcodes.io/', license: 'OGL v3.0 (ONS Postcode Directory); service MIT', attribution: 'Contains OS data © Crown copyright and database right; Royal Mail data © Royal Mail copyright and database right; ONS data licensed under the Open Government Licence v3.0 (via Postcodes.io)', policy: 'User-triggered UK postcode lookups.', network: true, requiresVisibleLink: true }),
  'world-bank': s({ id: 'world-bank', name: 'World Bank Indicators API v2', homepage: 'https://data.worldbank.org/', license: 'CC BY 4.0', attribution: 'World Bank, World Development Indicators (CC BY 4.0)', policy: 'Cached for 7 days.', network: true, requiresVisibleLink: true }),
  eurostat: s({ id: 'eurostat', name: 'Eurostat dissemination API', homepage: 'https://ec.europa.eu/eurostat/', license: 'Eurostat reuse policy (CC BY 4.0)', attribution: 'Source: Eurostat', policy: 'Cached for 7 days; only requested inside NUTS coverage.', network: true, requiresVisibleLink: true }),
  'gisco-id': s({ id: 'gisco-id', name: 'Eurostat GISCO ID service', homepage: 'https://ec.europa.eu/eurostat/web/gisco', license: 'GISCO terms (non-commercial use of geodata)', attribution: '© EuroGeographics for the administrative boundaries', policy: 'Returns NUTS codes only (no geometry is downloaded).', network: true, requiresVisibleLink: true }),
  geoboundaries: s({ id: 'geoboundaries', name: 'geoBoundaries (gbOpen)', homepage: 'https://www.geoboundaries.org/', license: 'Per boundary (see boundaryLicense)', attribution: 'geoBoundaries — Runfola et al. (2020), PLOS ONE 15(4): e0231866', policy: 'Fetched only when you open a boundary; cached for 30 days.', network: true, requiresVisibleLink: true }),
  bigdatacloud: s({ id: 'bigdatacloud', name: 'BigDataCloud client-side reverse geocoding', homepage: 'https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api', license: 'Free client-side API, fair use', attribution: 'Reverse geocoding by BigDataCloud', policy: 'Used only for your device’s current location after you grant permission, as its fair-use policy requires.', network: true, requiresVisibleLink: true }),
  photon: s({ id: 'photon', name: 'Photon (komoot public demo)', homepage: 'https://photon.komoot.io/', license: 'ODbL 1.0 (OpenStreetMap data)', attribution: 'Geocoding by Photon/komoot · © OpenStreetMap contributors', policy: 'Explicit search/confirm only; no search-as-you-type; cached.', network: true, requiresVisibleLink: true }),
  nominatim: s({ id: 'nominatim', name: 'Nominatim (OpenStreetMap Foundation)', homepage: 'https://operations.osmfoundation.org/policies/nominatim/', license: 'ODbL 1.0 (OpenStreetMap data)', attribution: '© OpenStreetMap contributors (Nominatim)', policy: 'Off unless you enable it. Last resort only, at most 1 request per second, never for batch, autocomplete, or grids; results cached.', network: true, requiresVisibleLink: true }),
  'nager-date': s({ id: 'nager-date', name: 'Nager.Date', homepage: 'https://date.nager.at/', license: 'Free public API (MIT project)', attribution: 'Public holidays: Nager.Date', policy: 'Cached for 7 days per country and year.', network: true, requiresVisibleLink: true }),
  'sunrise-sunset-org': s({ id: 'sunrise-sunset-org', name: 'Sunrise-Sunset.org', homepage: 'https://sunrise-sunset.org/', license: 'Free API, attribution link required', attribution: 'Sun times by sunrise-sunset.org', policy: 'Cached per location and date; visible link shown.', network: true, requiresVisibleLink: true }),
  'sunrisesunset-io': s({ id: 'sunrisesunset-io', name: 'SunriseSunset.io', homepage: 'https://sunrisesunset.io/', license: 'Free API, attribution link required', attribution: 'Sun times by SunriseSunset.io', policy: 'Fallback only; visible link shown.', network: true, requiresVisibleLink: true }),
  'terrain-tiles': s({ id: 'terrain-tiles', name: 'Terrain Tiles on AWS (Tilezen)', homepage: 'https://registry.opendata.aws/terrain-tiles/', license: 'Mixed open sources (see attribution)', attribution: 'Terrain Tiles (Mapzen/Tilezen) — SRTM, GMTED2010 and 3DEP courtesy of the U.S. Geological Survey; ETOPO1 by NOAA; EU-DEM (Copernicus) and other national sources', policy: 'One tile per lookup, cached.', network: true, requiresVisibleLink: true }),
  'open-elevation': s({ id: 'open-elevation', name: 'Open-Elevation', homepage: 'https://open-elevation.com/', license: 'Free keyless tier (500 coordinates/month per IP)', attribution: 'Elevation: Open-Elevation (NASA/USGS SRTM)', policy: 'Fallback only when Terrain Tiles fail; cached.', network: true, requiresVisibleLink: true }),
  'natural-earth': s({ id: 'natural-earth', name: 'Natural Earth 5.1.2', homepage: 'https://www.naturalearthdata.com/', license: 'Public domain', attribution: 'Made with Natural Earth', policy: 'Bundled offline.', network: false, requiresVisibleLink: false }),
  geonames: s({ id: 'geonames', name: 'GeoNames', homepage: 'https://www.geonames.org/', license: 'CC BY 4.0', attribution: 'GeoNames (geonames.org), CC BY 4.0', policy: 'Bundled offline.', network: false, requiresVisibleLink: true }),
  wikidata: s({ id: 'wikidata', name: 'Wikidata', homepage: 'https://www.wikidata.org/', license: 'CC0 1.0', attribution: 'Wikidata', policy: 'Bundled offline.', network: false, requiresVisibleLink: false }),
  'timezone-boundary-builder': s({ id: 'timezone-boundary-builder', name: 'timezone-boundary-builder 2026d', homepage: 'https://github.com/evansiroky/timezone-boundary-builder', license: 'ODbL 1.0', attribution: 'Time zone boundaries © OpenStreetMap contributors, timezone-boundary-builder (ODbL)', policy: 'Bundled offline (simplified).', network: false, requiresVisibleLink: true }),
  'open-location-code': s({ id: 'open-location-code', name: 'Open Location Code', homepage: 'https://github.com/google/open-location-code', license: 'Apache-2.0 (specification)', attribution: 'Plus Codes (Open Location Code)', policy: 'Computed offline.', network: false, requiresVisibleLink: false }),
  computed: s({ id: 'computed', name: 'Computed in this browser', homepage: '', license: 'n/a', attribution: 'Computed locally', policy: 'Derived from other fields; no network.', network: false, requiresVisibleLink: false }),
  device: s({ id: 'device', name: 'Device location (Geolocation API)', homepage: '', license: 'n/a', attribution: 'Your device', policy: 'Only after you grant permission.', network: false, requiresVisibleLink: false }),
  user: s({ id: 'user', name: 'Entered by you', homepage: '', license: 'n/a', attribution: 'User input', policy: 'Typed or clicked by you.', network: false, requiresVisibleLink: false }),
};

export interface ProvenanceInput {
  source: SourceId;
  geography: GeographyType;
  confidence: ConfidenceClass;
  retrievedAt: string;
  unit?: string | null;
  recordId?: string | null;
  year?: number | null;
  geometryId?: string | null;
  license?: string;
  attribution?: string;
  note?: string;
}

export function provenance(input: ProvenanceInput): Provenance {
  const info = SOURCES[input.source];
  return {
    unit: input.unit ?? null,
    source: input.source,
    source_record_id: input.recordId ?? null,
    reference_year: input.year ?? null,
    retrieved_at: input.retrievedAt,
    geography_type: input.geography,
    geometry_id: input.geometryId ?? null,
    license: input.license ?? info.license,
    attribution: input.attribution ?? info.attribution,
    confidence_class: input.confidence,
    ...(input.note ? { note: input.note } : {}),
  };
}

export function field(key: string, label: string, group: FieldGroup, value: FieldValue, meta: ProvenanceInput): ProfileField {
  return { key, label, group, value, ...provenance(meta) };
}

/** Insert or replace fields by key, preserving first-seen order. */
export function upsertFields(existing: ProfileField[], incoming: ProfileField[]): ProfileField[] {
  const out = [...existing];
  for (const next of incoming) {
    if (next.value === null || next.value === '' || (typeof next.value === 'number' && !Number.isFinite(next.value))) continue;
    const index = out.findIndex((item) => item.key === next.key);
    if (index >= 0) out[index] = next; else out.push(next);
  }
  return out;
}

/** Confidence order, most precise first; used to pick the best coordinate. */
export const CONFIDENCE_RANK: Record<ConfidenceClass, number> = {
  rooftop: 0, street: 1, postal_centroid: 2, locality_centroid: 3, admin_centroid: 4, modeled_grid: 5,
};
