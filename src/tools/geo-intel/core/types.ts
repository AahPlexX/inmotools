// Shared data model for Geo Intelligence Hub. Every value shown to the user is
// a ProfileField that carries its own provenance.

export type ConfidenceClass =
  | 'rooftop'
  | 'street'
  | 'postal_centroid'
  | 'locality_centroid'
  | 'admin_centroid'
  | 'modeled_grid';

export type GeographyType =
  | 'point'
  | 'postal_code'
  | 'locality'
  | 'populated_place'
  | 'admin1'
  | 'admin2'
  | 'admin3'
  | 'country'
  | 'nuts1'
  | 'nuts2'
  | 'nuts3'
  | 'timezone'
  | 'grid_cell';

export type SourceId =
  | 'zippopotam'
  | 'postcodes-io'
  | 'world-bank'
  | 'eurostat'
  | 'gisco-id'
  | 'geoboundaries'
  | 'bigdatacloud'
  | 'photon'
  | 'nominatim'
  | 'nager-date'
  | 'sunrise-sunset-org'
  | 'sunrisesunset-io'
  | 'terrain-tiles'
  | 'open-elevation'
  | 'natural-earth'
  | 'geonames'
  | 'wikidata'
  | 'timezone-boundary-builder'
  | 'open-location-code'
  | 'computed'
  | 'device'
  | 'user';

export type FieldValue = string | number | boolean | null;

export interface Provenance {
  unit: string | null;
  source: SourceId;
  source_record_id: string | null;
  reference_year: number | null;
  /** ISO 8601 instant the value was fetched or computed. */
  retrieved_at: string;
  geography_type: GeographyType;
  geometry_id: string | null;
  license: string;
  attribution: string;
  confidence_class: ConfidenceClass;
  /** Methodology or caveat the user must see next to the value. */
  note?: string;
}

export interface Provenanced<T> extends Provenance {
  value: T;
}

export type FieldGroup =
  | 'location'
  | 'address'
  | 'admin'
  | 'country'
  | 'population'
  | 'indicators'
  | 'eu'
  | 'timezone'
  | 'solar'
  | 'elevation'
  | 'holidays'
  | 'codes';

export const FIELD_GROUPS: readonly FieldGroup[] = [
  'location', 'address', 'admin', 'country', 'population', 'indicators', 'eu', 'timezone', 'solar', 'elevation', 'holidays', 'codes',
];

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  location: 'Location',
  address: 'Address',
  admin: 'Administrative areas',
  country: 'Country',
  population: 'Population',
  indicators: 'Country indicators',
  eu: 'EU regional statistics',
  timezone: 'Time zone',
  solar: 'Sun',
  elevation: 'Elevation',
  holidays: 'Public holidays',
  codes: 'Codes & formats',
};

export interface ProfileField extends Provenanced<FieldValue> {
  /** Stable machine key, e.g. `country.capital`. Unique within a profile. */
  key: string;
  label: string;
  group: FieldGroup;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface AdminLevel {
  level: number;
  name: string;
  code: string | null;
  source: SourceId;
  geonameId?: number | null;
  wikidata?: string | null;
}

export interface Holiday {
  date: string;
  localName: string;
  name: string;
  global: boolean;
  counties: string[] | null;
  types: string[];
}

export interface HolidayCalendar {
  year: number;
  countryCode: string;
  items: Holiday[];
  provenance: Provenance;
}

export interface SolarTimes {
  /** ISO instants (UTC offset included) or null when the event does not occur. */
  sunrise: string | null;
  sunset: string | null;
  solarNoon: string | null;
  dayLengthSeconds: number | null;
  civilDawn: string | null;
  civilDusk: string | null;
  nauticalDawn: string | null;
  nauticalDusk: string | null;
  astronomicalDawn: string | null;
  astronomicalDusk: string | null;
  goldenMorning: [string, string] | null;
  goldenEvening: [string, string] | null;
  blueMorning: [string, string] | null;
  blueEvening: [string, string] | null;
  status: 'normal' | 'polar_day' | 'polar_night';
  /** Optional so profiles saved before moon data existed still load. */
  moon?: MoonInfo | null;
  provenance: Provenance;
}

export interface MoonInfo {
  rise: string | null;
  set: string | null;
  phase: string;
  /** Percent of the disc lit. */
  illumination: number;
  source: SourceId;
}

export type QueryKind =
  | 'empty'
  | 'decimal'
  | 'dms'
  | 'plus-code-full'
  | 'plus-code-short'
  | 'utm'
  | 'mgrs'
  | 'geohash'
  | 'maidenhead'
  | 'postal'
  | 'place'
  | 'device'
  | 'map';

export interface LocationProfile {
  id: string;
  schema: 'geo-intel-profile/1';
  createdAt: string;
  updatedAt: string;
  query: string;
  queryKind: QueryKind;
  label: string;
  lat: number;
  lon: number;
  countryCode: string | null;
  timezone: string | null;
  fields: ProfileField[];
  adminChain: AdminLevel[];
  holidays: HolidayCalendar | null;
  solar: SolarTimes | null;
  bbox: BBox | null;
  warnings: string[];
  sourcesUsed: SourceId[];
}

export interface ExportMetadata {
  title: string;
  author: string;
  description: string;
  tags: string[];
  /** ISO date (YYYY-MM-DD) that replaces the export date when set. */
  dateOverride: string;
  license: 'CC0-1.0' | 'CC-BY-4.0' | 'custom';
  customLicense: string;
  notes: string;
}

export const EMPTY_METADATA: ExportMetadata = {
  title: '',
  author: '',
  description: '',
  tags: [],
  dateOverride: '',
  license: 'CC-BY-4.0',
  customLicense: '',
  notes: '',
};
