// Routes a query through the keyless adapter chains and merges everything into
// one LocationProfile in which every field carries its own provenance.

import { bigDataCloudDevice, nominatimReverse, nominatimSearch, photonReverse, photonSearch } from '../adapters/geocoders';
import type { AdapterResult } from '../adapters/common';
import { elevation, nagerHolidays, solarTimes } from '../adapters/environment';
import { postcodesLookup, postcodesReverse, zippopotamLookup } from '../adapters/postal';
import { eurostatRegion, nutsForPoint, worldBankCountry } from '../adapters/statistics';
import { antipode, encodeGeohash, formatDDM, formatDMS, formatUtm, toMaidenhead, toMgrs } from '../core/coords';
import { metresToFeet } from '../core/geodesy';
import { decode, describeArea, encode, recoverNearest } from '../core/olc';
import { normalizePostal } from '../core/postal';
import { parseQuery, queryKindOf, type ParsedQuery } from '../core/query-parser';
import { field, upsertFields } from '../core/sources';
import { abbreviation, formatOffset, isDst, localDate, nextTransition, observesDst, offsetMinutes } from '../core/timezone';
import type { AdminLevel, ConfidenceClass, GeographyType, HolidayCalendar, LatLon, LocationProfile, ProfileField, QueryKind, SolarTimes, SourceId } from '../core/types';
import type { HttpClient } from '../net/http';
import type { GeoIntelSettings } from '../net/store';
import { admin1Match, countryAt, currencySymbol, languageNames, placesNear, timezoneAt, type CountryRecord } from '../offline/static-data';

/** Countries whose points GISCO can place in a NUTS 2024 region (EU, EFTA, candidates). */
export const NUTS_COUNTRIES = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'IS', 'LI', 'NO', 'CH', 'AL', 'ME', 'MK', 'RS', 'TR']);

export type ResolveInput =
  | { kind: 'text'; text: string }
  | { kind: 'device'; lat: number; lon: number; accuracy: number | null }
  /** precisionMetres: ground size of one screen pixel where the user clicked, if known. */
  | { kind: 'map'; lat: number; lon: number; precisionMetres?: number };

export interface ResolveOptions {
  client: HttpClient;
  settings: GeoIntelSettings;
  signal?: AbortSignal;
  now?: () => Date;
  /** Used to recover short Plus Codes typed without a locality. */
  referencePoint?: LatLon | null;
  onStep?: (step: string) => void;
}

export class ResolveError extends Error {
  constructor(message: string) { super(message); this.name = 'ResolveError'; }
}

export function confidenceForPrecision(metres: number): ConfidenceClass {
  if (metres <= 30) return 'rooftop';
  if (metres <= 250) return 'street';
  if (metres <= 5_000) return 'locality_centroid';
  return 'admin_centroid';
}

/** Precision implied by the number of decimals typed (worst axis). */
export function decimalPrecisionMetres(text: string): number {
  const decimals = (text.match(/\.(\d+)/g) ?? []).map((part) => part.length - 1);
  const least = decimals.length >= 2 ? Math.min(...decimals) : 0;
  return 111_320 / 10 ** least;
}

export const profileId = (point: LatLon) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;

interface Anchor {
  point: LatLon;
  kind: QueryKind;
  query: string;
  confidence: ConfidenceClass;
  source: SourceId;
  geography: GeographyType;
  recordId: string | null;
  note: string;
  primary: AdapterResult | null;
}

async function tryAdapter<T>(label: string, warnings: string[], task: () => Promise<T>, signal?: AbortSignal): Promise<T | null> {
  try { return await task(); }
  catch (error) {
    if (signal?.aborted) throw error;
    warnings.push(`${label}: ${(error as Error).message}`);
    return null;
  }
}

async function geocodePlace(text: string, options: ResolveOptions, warnings: string[]): Promise<AdapterResult> {
  const photon = await tryAdapter('Photon', warnings, () => photonSearch(options.client, text, options.signal), options.signal);
  if (photon?.point) return photon;
  if (options.settings.nominatimEnabled) {
    const nominatim = await tryAdapter('Nominatim', warnings, () => nominatimSearch(options.client, text, options.signal), options.signal);
    if (nominatim?.point) return nominatim;
  }
  throw new ResolveError(`No match for “${text}”.${options.settings.nominatimEnabled ? '' : ' You can enable Nominatim as a last-resort geocoder in Sources.'}`);
}

async function anchorFor(parsed: ParsedQuery, input: ResolveInput, options: ResolveOptions, warnings: string[]): Promise<Anchor> {
  if (input.kind === 'device') {
    const primary = await tryAdapter('BigDataCloud', warnings, () => bigDataCloudDevice(options.client, input, options.signal), options.signal);
    const precision = input.accuracy ?? 5_000;
    return { point: { lat: input.lat, lon: input.lon }, kind: 'device', query: 'Device location', confidence: confidenceForPrecision(precision), source: 'device', geography: 'point', recordId: null, note: input.accuracy ? `Reported accuracy ±${Math.round(input.accuracy)} m.` : 'Accuracy not reported by the device.', primary };
  }
  if (input.kind === 'map') {
    return { point: { lat: input.lat, lon: input.lon }, kind: 'map', query: `Map point ${profileId(input)}`, confidence: input.precisionMetres === undefined ? 'street' : confidenceForPrecision(input.precisionMetres), source: 'user', geography: 'point', recordId: null, note: input.precisionMetres === undefined ? 'Point chosen on the map or from a list.' : `Point clicked on the map; one screen pixel there is about ${Math.max(1, Math.round(input.precisionMetres)).toLocaleString('en-US')} m.`, primary: null };
  }
  switch (parsed.kind) {
    case 'empty': throw new ResolveError('Type a place, postal code, coordinates, or Plus Code.');
    case 'invalid': throw new ResolveError(parsed.error);
    case 'decimal': case 'dms': case 'utm': {
      const metres = parsed.kind === 'decimal' ? decimalPrecisionMetres(parsed.text) : parsed.kind === 'utm' ? 1 : 30;
      return { point: parsed.point, kind: parsed.kind, query: parsed.text, confidence: confidenceForPrecision(metres), source: 'user', geography: 'point', recordId: null, note: parsed.detail, primary: null };
    }
    case 'geohash': case 'maidenhead': {
      const metres = parsed.cellMetres ?? 1_000;
      return { point: parsed.point, kind: parsed.kind, query: parsed.text, confidence: confidenceForPrecision(metres), source: 'computed', geography: 'grid_cell', recordId: parsed.text.split(/[:=]/)[1]?.trim() ?? null, note: `Centre of the ${parsed.detail} cell.`, primary: null };
    }
    case 'mgrs': {
      const metres = Number(/\((\d+) m\)/.exec(parsed.detail)?.[1] ?? 100_000);
      return { point: parsed.point, kind: 'mgrs', query: parsed.text, confidence: confidenceForPrecision(metres), source: 'user', geography: 'grid_cell', recordId: parsed.text.replace(/\s/g, '').toUpperCase(), note: `Centre of the ${parsed.detail}.`, primary: null };
    }
    case 'plus-code-full': {
      const code = parsed.text.split(/\s+/)[0].toUpperCase();
      const area = decode(code);
      const metres = (area.latitudeHi - area.latitudeLo) * 111_320;
      return { point: parsed.point, kind: 'plus-code-full', query: parsed.text, confidence: confidenceForPrecision(metres), source: 'open-location-code', geography: 'grid_cell', recordId: code, note: `Centre of Plus Code cell ${describeArea(area)}.`, primary: null };
    }
    case 'plus-code-short': {
      let reference = options.referencePoint ?? null;
      let primary: AdapterResult | null = null;
      if (parsed.locality) { primary = await geocodePlace(parsed.locality, options, warnings); reference = primary.point; }
      if (!reference) throw new ResolveError('A short Plus Code needs a town after it (e.g. “V75V+9R Paris”) or a location already on the map.');
      const full = recoverNearest(parsed.code, reference.lat, reference.lon);
      const area = decode(full);
      return { point: { lat: area.latitudeCenter, lon: area.longitudeCenter }, kind: 'plus-code-short', query: parsed.text, confidence: confidenceForPrecision((area.latitudeHi - area.latitudeLo) * 111_320), source: 'open-location-code', geography: 'grid_cell', recordId: full, note: `Recovered ${full} relative to ${parsed.locality || 'the current map location'}.`, primary: null };
    }
    case 'postal': {
      const country = parsed.country ?? options.settings.defaultPostalCountry;
      const request = normalizePostal(country, parsed.code);
      if (!parsed.country) warnings.push(`No country given; assumed ${country} (change the default in Sources).`);
      options.onStep?.('Looking up the postal code…');
      let primary: AdapterResult | null = null;
      if (country === 'GB') primary = await tryAdapter('Postcodes.io', warnings, () => postcodesLookup(options.client, request, options.signal), options.signal);
      if (!primary?.point) primary = await tryAdapter('Zippopotam.us', warnings, () => zippopotamLookup(options.client, request, options.signal), options.signal);
      if (!primary?.point) {
        if (!parsed.country) {
          // A bare number may be a postal code elsewhere or part of a place name: let the geocoder try.
          const place = await geocodePlace(parsed.text, options, warnings).catch(() => null);
          if (place?.point) {
            warnings.push(`${request.display} is not a ${country} postal code; showing the best geocoder match instead. Add a country, e.g. “DE ${request.display}”.`);
            return { point: place.point, kind: 'place', query: parsed.text, confidence: place.confidence, source: place.source, geography: place.fields[0]?.geography_type ?? 'locality', recordId: place.recordId, note: 'Best single match from the geocoder.', primary: place };
          }
        }
        throw new ResolveError(`Postal code ${request.display} (${country}) was not found. Check the code, or pick the right country.`);
      }
      return { point: primary.point, kind: 'postal', query: parsed.text, confidence: primary.confidence, source: primary.source, geography: 'postal_code', recordId: primary.recordId, note: primary.fields[0]?.note ?? 'Postal code centroid.', primary };
    }
    case 'place': {
      options.onStep?.('Finding the place…');
      const primary = await geocodePlace(parsed.text, options, warnings);
      const geography = primary.fields[0]?.geography_type ?? 'locality';
      return { point: primary.point as LatLon, kind: 'place', query: parsed.text, confidence: primary.confidence, source: primary.source, geography, recordId: primary.recordId, note: 'Best single match from the geocoder.', primary };
    }
  }
}

function coordinateFields(anchor: Anchor, retrievedAt: string): ProfileField[] {
  const { point } = anchor;
  const meta = { source: anchor.source, geography: anchor.geography, confidence: anchor.confidence, retrievedAt, recordId: anchor.recordId, note: anchor.note };
  const computed = { source: 'computed' as const, geography: 'point' as const, confidence: anchor.confidence, retrievedAt, note: 'Converted locally from the resolved coordinate (WGS 84).' };
  const fields = [
    field('location.lat', 'Latitude', 'location', Number(point.lat.toFixed(6)), { ...meta, unit: '° (WGS 84)' }),
    field('location.lon', 'Longitude', 'location', Number(point.lon.toFixed(6)), { ...meta, unit: '° (WGS 84)' }),
    field('codes.plusCode', 'Plus Code', 'codes', encode(point.lat, point.lon, 11), { ...computed, source: 'open-location-code' }),
    field('codes.dms', 'Degrees, minutes, seconds', 'codes', formatDMS(point), computed),
    field('codes.ddm', 'Degrees, decimal minutes', 'codes', formatDDM(point), computed),
    field('codes.geohash', 'Geohash', 'codes', encodeGeohash(point, 9), { ...computed, note: '9 characters ≈ 5 m × 5 m cell.' }),
    field('codes.maidenhead', 'Maidenhead locator', 'codes', toMaidenhead(point, 4), { ...computed, note: 'IARU locator at extended-square precision (amateur radio).' }),
    field('codes.antipode', 'Antipode', 'codes', (() => { const a = antipode(point); return `${a.lat.toFixed(6)}, ${a.lon.toFixed(6)}`; })(), { ...computed, note: 'The point on the exact opposite side of the Earth.' }),
  ];
  if (point.lat >= -80 && point.lat <= 84) {
    fields.push(field('codes.utm', 'UTM', 'codes', formatUtm(point), computed));
    fields.push(field('codes.mgrs', 'MGRS (1 m)', 'codes', toMgrs(point, 5), computed));
  }
  return fields;
}

function countryFields(country: CountryRecord, retrievedAt: string, match: 'inside' | 'nearest', distance: number): ProfileField[] {
  const meta = { source: 'geonames' as const, geography: 'country' as const, confidence: 'admin_centroid' as const, retrievedAt, recordId: String(country.geonameId), geometryId: country.a3 };
  const ne = { ...meta, source: 'natural-earth' as const };
  const note = match === 'nearest' ? `Point is ${distance.toFixed(1)} km outside the simplified 1:50m coastline; nearest country used.` : undefined;
  const symbol = currencySymbol(country.currencyCode);
  return [
    field('country.name', 'Country', 'country', country.name, { ...ne, note: note ?? 'Point-in-polygon on bundled Natural Earth 1:50m boundaries.' }),
    field('country.official', 'Official name', 'country', country.official, ne),
    field('country.a2', 'ISO 3166-1 alpha-2', 'country', country.a2, meta),
    field('country.a3', 'ISO 3166-1 alpha-3', 'country', country.a3, meta),
    field('country.n3', 'ISO 3166-1 numeric', 'country', country.n3, meta),
    field('country.capital', 'Capital', 'country', country.capital, meta),
    field('country.continent', 'Continent', 'country', country.continentName, meta),
    field('country.region', 'UN region', 'country', country.region, ne),
    field('country.subregion', 'UN sub-region', 'country', country.subregion, ne),
    field('country.currency', 'Currency', 'country', country.currencyCode ? `${country.currencyCode}${symbol && symbol !== country.currencyCode ? ` (${symbol})` : ''} · ${country.currencyName ?? ''}`.trim() : null, meta),
    field('country.callingCodes', 'Calling code', 'country', country.callingCode.join(', ') || null, meta),
    field('country.tld', 'Internet TLD', 'country', country.tld, meta),
    field('country.languages', 'Languages', 'country', languageNames(country.languages).join(', ') || null, meta),
    field('country.drivingSide', 'Drives on the', 'country', country.drivingSide, { ...meta, source: 'wikidata', recordId: country.wikidata, note: 'Wikidata P1622 (current statement).' }),
    field('country.areaKm2', 'Area', 'country', country.areaKm2, { ...meta, unit: 'km²' }),
    field('country.neighbours', 'Land neighbours (ISO)', 'country', country.neighbours.join(', ') || null, meta),
    field('country.postalFormat', 'Postal code format', 'country', country.postalFormat, { ...meta, note: '# = digit, @ = letter (GeoNames notation).' }),
    field('population.geonames', 'Population (GeoNames country record)', 'population', country.geonamesPopulation, { ...meta, unit: 'people', note: 'GeoNames country total; GeoNames does not publish its reference year. Prefer the World Bank figure where shown.' }),
  ];
}

function timezoneFields(zone: string, match: 'polygon' | 'nautical', instant: Date): ProfileField[] {
  const meta = { source: 'timezone-boundary-builder' as const, geography: 'timezone' as const, confidence: 'admin_centroid' as const, retrievedAt: instant.toISOString(), recordId: zone, geometryId: zone };
  const computed = { ...meta, source: 'computed' as const, note: 'Evaluated with this browser’s IANA time-zone database.' };
  const offset = offsetMinutes(zone, instant);
  const transition = nextTransition(zone, instant);
  return [
    field('tz.name', 'IANA time zone', 'timezone', zone, { ...meta, note: match === 'nautical' ? 'No zone polygon covers this point; nautical zone from longitude.' : 'Point-in-polygon on bundled timezone-boundary-builder 2026d (simplified; 99.93% agreement on land).' }),
    field('tz.abbreviation', 'Abbreviation', 'timezone', abbreviation(zone, instant) || null, computed),
    field('tz.offset', 'Current UTC offset', 'timezone', formatOffset(offset), computed),
    field('tz.dst', 'Daylight saving time now', 'timezone', observesDst(zone, instant.getUTCFullYear()) ? isDst(zone, instant) : false, computed),
    field('tz.observesDst', 'Observes DST this year', 'timezone', observesDst(zone, instant.getUTCFullYear()), computed),
    field('tz.nextTransition', 'Next offset change', 'timezone', transition ? `${transition.at.toISOString()} (${formatOffset(transition.fromMinutes)} → ${formatOffset(transition.toMinutes)})` : null, computed),
  ];
}

function mergeChains(country: CountryRecord | null, chains: AdminLevel[][]): AdminLevel[] {
  const out: AdminLevel[] = [];
  if (country) out.push({ level: 0, name: country.name, code: country.a2, source: 'geonames', geonameId: country.geonameId, wikidata: country.wikidata });
  const richest = [...chains].sort((a, b) => b.length - a.length)[0] ?? [];
  for (const level of richest) if (!out.some((item) => item.level === level.level && item.name === level.name)) out.push(level);
  for (const chain of chains) for (const level of chain) {
    const same = out.find((item) => item.level === level.level);
    if (same && !same.code && level.code && same.name === level.name) same.code = level.code;
  }
  return out.sort((a, b) => a.level - b.level);
}


/** Profile fields derived from a SolarTimes record (also used when the user picks another date). */
export function solarFields(s: SolarTimes): ProfileField[] {
  const sp = s.provenance;
  const f = (key: string, label: string, value: string | number | null, unit: string | null = 'ISO 8601 instant'): ProfileField => ({ key, label, group: 'solar', value, ...sp, unit });
  const out = [
    f('solar.status', 'Sun status', s.status === 'normal' ? 'Rises and sets' : s.status === 'polar_day' ? 'Midnight sun (does not set)' : 'Polar night (does not rise)', null),
    f('solar.sunrise', 'Sunrise', s.sunrise), f('solar.sunset', 'Sunset', s.sunset), f('solar.solarNoon', 'Solar noon', s.solarNoon),
    f('solar.dayLength', 'Daylight duration', s.dayLengthSeconds, 's'),
    f('solar.civilDawn', 'Civil dawn', s.civilDawn), f('solar.civilDusk', 'Civil dusk', s.civilDusk),
    f('solar.nauticalDawn', 'Nautical dawn', s.nauticalDawn), f('solar.nauticalDusk', 'Nautical dusk', s.nauticalDusk),
    f('solar.astronomicalDawn', 'Astronomical dawn', s.astronomicalDawn), f('solar.astronomicalDusk', 'Astronomical dusk', s.astronomicalDusk),
    f('solar.goldenMorning', 'Golden hour (morning)', s.goldenMorning?.join(' – ') ?? null, 'ISO 8601 interval'),
    f('solar.goldenEvening', 'Golden hour (evening)', s.goldenEvening?.join(' – ') ?? null, 'ISO 8601 interval'),
    f('solar.blueMorning', 'Blue hour (morning)', s.blueMorning?.join(' – ') ?? null, 'ISO 8601 interval'),
    f('solar.blueEvening', 'Blue hour (evening)', s.blueEvening?.join(' – ') ?? null, 'ISO 8601 interval'),
  ];
  if (s.moon) {
    const moonMeta = s.moon.source === 'computed'
      ? { ...sp, source: 'computed' as const, license: 'n/a', attribution: 'Computed locally', note: 'Mean lunar cycle (about ±½ day); moonrise and moonset need a sun-time service.' }
      : sp;
    out.push(
      { key: 'solar.moonPhase', label: 'Moon phase', group: 'solar', value: s.moon.phase, ...moonMeta, unit: null },
      { key: 'solar.moonIllumination', label: 'Moon illuminated', group: 'solar', value: s.moon.illumination, ...moonMeta, unit: '%' },
      { key: 'solar.moonrise', label: 'Moonrise', group: 'solar', value: s.moon.rise, ...moonMeta, unit: 'ISO 8601 instant' },
      { key: 'solar.moonset', label: 'Moonset', group: 'solar', value: s.moon.set, ...moonMeta, unit: 'ISO 8601 instant' },
    );
  }
  return out;
}

/** Holiday summary fields relative to `today` (YYYY-MM-DD in the location's zone). */
export function holidayFields(holidays: HolidayCalendar, today: string): ProfileField[] {
  const hp = holidays.provenance;
  const upcoming = holidays.items.find((item) => item.date >= today);
  return [
    { key: 'holidays.count', label: `Public holidays in ${holidays.year}`, group: 'holidays', value: holidays.items.length, ...hp, unit: 'days' },
    { key: 'holidays.nationwide', label: 'Nationwide holidays', group: 'holidays', value: holidays.items.filter((item) => item.global).length, ...hp, unit: 'days' },
    { key: 'holidays.next', label: 'Next public holiday', group: 'holidays', value: upcoming ? `${upcoming.date} · ${upcoming.name}${upcoming.global ? '' : ' (regional)'}` : null, ...hp, unit: null },
  ];
}

export async function resolveLocation(input: ResolveInput, options: ResolveOptions): Promise<LocationProfile> {
  const now = options.now?.() ?? new Date();
  const retrievedAt = now.toISOString();
  const warnings: string[] = [];
  const parsed = input.kind === 'text' ? parseQuery(input.text) : ({ kind: 'empty' } as ParsedQuery);
  const anchor = await anchorFor(parsed, input, options, warnings);
  const { point } = anchor;
  const { client, signal } = options;
  options.onStep?.('Checking country and time zone…');
  const [countryHit, tzHit, nearest] = await Promise.all([countryAt(point), timezoneAt(point), placesNear(point, 50, 1)]);
  const country = countryHit?.country ?? null;
  const countryCode = country?.a2 ?? anchor.primary?.countryCode ?? null;
  const zone = tzHit.zone;
  const dateHere = localDate(zone, now);
  const year = Number(dateHere.slice(0, 4));
  const needsReverse = !anchor.primary || anchor.kind === 'plus-code-short';

  options.onStep?.('Gathering details from open data sources…');
  const [reverse, ukDepth, elev, solar, wb, holidays, nuts] = await Promise.all([
    needsReverse ? tryAdapter('Reverse geocoding', warnings, async () => (await photonReverse(client, point.lat, point.lon, signal))
      ?? (options.settings.nominatimEnabled ? nominatimReverse(client, point.lat, point.lon, signal) : null), signal) : Promise.resolve(null),
    countryCode === 'GB' && anchor.source !== 'postcodes-io' ? tryAdapter('Postcodes.io', warnings, () => postcodesReverse(client, point.lat, point.lon, signal), signal) : Promise.resolve(null),
    elevation(client, point.lat, point.lon, signal),
    solarTimes(client, point.lat, point.lon, dateHere, signal),
    country && !country.withdrawn ? tryAdapter('World Bank', warnings, () => worldBankCountry(client, country.a3, signal), signal) : Promise.resolve(null),
    countryCode ? tryAdapter('Nager.Date', warnings, async () => {
      const calendar = await nagerHolidays(client, year, countryCode, signal);
      // Late in the year every holiday may be past: show next year's calendar instead.
      if (calendar && calendar.items.length && !calendar.items.some((item) => item.date >= dateHere)) return (await nagerHolidays(client, year + 1, countryCode, signal)) ?? calendar;
      return calendar;
    }, signal) : Promise.resolve(null),
    countryCode && NUTS_COUNTRIES.has(countryCode) ? tryAdapter('Eurostat GISCO', warnings, () => nutsForPoint(client, point.lat, point.lon, signal), signal) : Promise.resolve(null),
  ]);
  warnings.push(...elev.warnings, ...solar.warnings);
  const eu = nuts?.nuts3 ? await tryAdapter('Eurostat', warnings, () => eurostatRegion(client, nuts.nuts3 as string, signal), signal) : null;

  let fields: ProfileField[] = coordinateFields(anchor, retrievedAt);
  for (const result of [anchor.primary, reverse, ukDepth]) if (result) fields = upsertFields(fields, result.fields);
  if (country && countryHit) fields = upsertFields(fields, countryFields(country, retrievedAt, countryHit.match, countryHit.distanceKm));
  else warnings.push('No country at this point (open ocean or Antarctica outside the bundled boundaries).');
  fields = upsertFields(fields, timezoneFields(zone, tzHit.match, now));
  if (wb) fields = upsertFields(fields, wb);
  if (eu) fields = upsertFields(fields, eu);

  const state = fields.find((item) => item.key === 'admin.state');
  if (countryCode && typeof state?.value === 'string') {
    const match = await admin1Match(countryCode, state.value);
    if (match) fields = upsertFields(fields, [field('admin.geonamesAdmin1', 'GeoNames admin-1', 'admin', `${match.code} · ${match.name} (geonameId ${match.geonameId})`, { source: 'geonames', geography: 'admin1', confidence: 'admin_centroid', retrievedAt, recordId: String(match.geonameId), note: 'Matched by name against the bundled GeoNames admin1CodesASCII table.' })]);
  }

  if (elev.field) {
    const metres = elev.field.value as number;
    fields = upsertFields(fields, [elev.field, { ...elev.field, key: 'elevation.feet', label: 'Elevation (feet)', value: Math.round(metresToFeet(metres)), unit: 'ft' }]);
  }

  const s = solar.solar;
  fields = upsertFields(fields, solarFields(s));
  if (holidays) fields = upsertFields(fields, holidayFields(holidays, dateHere));
  else if (countryCode) warnings.push(`Nager.Date publishes no holiday calendar for ${countryCode}.`);

  const place = nearest[0];
  if (place) fields = upsertFields(fields, [field('population.nearestPlace', 'Nearest populated place (bundled)', 'population', `${place.name} · ${place.distanceKm.toFixed(1)} km · pop. ≈${place.popMax.toLocaleString('en-US')}`, { source: 'natural-earth', geography: 'populated_place', confidence: 'locality_centroid', retrievedAt, unit: null, note: 'Natural Earth pop_max is an urban-agglomeration estimate for the named place, not the population of this point or postal code.' })]);

  if (anchor.kind === 'postal') warnings.push('Population is not reported for postal codes: postal areas are delivery routes, not census geographies. Figures shown belong to the named country, NUTS region, or populated place.');

  const chains = [anchor.primary, reverse, ukDepth].filter((item): item is AdapterResult => !!item).map((item) => item.adminChain);
  const sourcesUsed = [...new Set(fields.map((item) => item.source))];
  if (s.provenance.source) sourcesUsed.push(s.provenance.source);
  if (holidays) sourcesUsed.push('nager-date');
  const labelSource = anchor.primary?.label ?? reverse?.label ?? (place ? `${place.name}, ${country?.name ?? ''}` : null);
  const label = (anchor.kind === 'postal' || anchor.kind === 'place' || anchor.kind === 'device') && labelSource ? labelSource
    : labelSource ?? `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;

  const staleSources = [anchor.primary, reverse, ukDepth].filter((item) => item?.stale).map((item) => item?.source);
  if (staleSources.length) warnings.push(`Showing cached data for ${staleSources.join(', ')} because the source could not be reached.`);

  return {
    id: profileId(point),
    schema: 'geo-intel-profile/1',
    createdAt: retrievedAt,
    updatedAt: retrievedAt,
    query: anchor.query,
    queryKind: input.kind === 'text' ? queryKindOf(parsed) : anchor.kind,
    label: label.replace(/,\s*$/, ''),
    lat: point.lat,
    lon: point.lon,
    countryCode,
    timezone: zone,
    fields,
    adminChain: mergeChains(country, chains),
    holidays: holidays ?? null,
    solar: s,
    bbox: null,
    warnings: [...new Set(warnings)],
    sourcesUsed: [...new Set(sourcesUsed)],
    alternatives: anchor.primary?.alternatives?.length ? anchor.primary.alternatives : undefined,
  };
}
