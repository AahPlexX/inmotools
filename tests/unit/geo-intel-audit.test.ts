import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { antipode, decodeGeohash, encodeGeohash, fromMaidenhead, toMaidenhead } from '../../src/tools/geo-intel/core/coords';
import { moonPhaseAt, solarNoon, sunPositionAt } from '../../src/tools/geo-intel/core/solar';
import { buildGeoJson, buildKml, parseProfileImport, resolveMetadata } from '../../src/tools/geo-intel/export/formats';
import { EMPTY_METADATA, type LocationProfile } from '../../src/tools/geo-intel/core/types';
import { HttpClient, MemoryCache } from '../../src/tools/geo-intel/net/http';
import { DEFAULT_SETTINGS } from '../../src/tools/geo-intel/net/store';
import { resolveLocation, solarFields } from '../../src/tools/geo-intel/engine/synthesize';
import { sunriseSunsetIo, sunriseSunsetOrg } from '../../src/tools/geo-intel/adapters/environment';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/geo-intel/responses/${name}`, import.meta.url));
function client(routes: Array<[RegExp, string]>) {
  return new HttpClient({
    cache: new MemoryCache(), sleep: async () => undefined,
    fetch: async (input) => {
      const hit = routes.find(([re]) => re.test(String(input)));
      return hit ? new Response(fixture(hit[1]), { status: 200 }) : new Response('offline', { status: 503 });
    },
  });
}

describe('geohash, Maidenhead and antipode', () => {
  it('matches the published geohash example and round-trips', () => {
    expect(encodeGeohash({ lat: 57.64911, lon: 10.40744 }, 11)).toBe('u4pruydqqvj');
    const cell = decodeGeohash('u4pruydqqvj');
    expect(cell.center.lat).toBeCloseTo(57.64911, 4);
    expect(cell.center.lon).toBeCloseTo(10.40744, 4);
    expect(decodeGeohash('ezs42').center.lat).toBeCloseTo(42.6, 1);
    expect(() => decodeGeohash('abc!')).toThrow();
  });

  it('encodes IARU locators (FN31PR for ARRL W1AW, Newington CT) and decodes them', () => {
    expect(toMaidenhead({ lat: 41.714775, lon: -72.727260 }, 3)).toBe('FN31PR');
    expect(toMaidenhead({ lat: 41.714775, lon: -72.727260 }, 2)).toBe('FN31');
    expect(toMaidenhead({ lat: 90, lon: 180 }, 3)).toMatch(/^R[R]\d\d[A-X]{2}$/);
    const back = fromMaidenhead('FN31pr');
    expect(back.center.lat).toBeCloseTo(41.7, 1);
    expect(back.east - back.west).toBeCloseTo(2 / 24, 9);
    expect(() => fromMaidenhead('ZZ99')).toThrow();
  });

  it('computes antipodes', () => {
    expect(antipode({ lat: 40, lon: -74 })).toEqual({ lat: -40, lon: 106 });
    expect(antipode({ lat: -33.9, lon: 151.2 }).lon).toBeCloseTo(-28.8, 6);
  });
});

describe('sun position and moon phase', () => {
  it('puts the sun due south at solar noon with the provider altitude (Málaga, 2026-09-29)', () => {
    // SunriseSunset.io fixture: sun_altitude 50.76°, azimuth 180° at solar noon.
    const noon = solarNoon('2026-09-29', -4.42);
    const pos = sunPositionAt(noon, 36.72, -4.42);
    expect(pos.azimuth).toBeGreaterThan(179);
    expect(pos.azimuth).toBeLessThan(181);
    expect(pos.altitude).toBeCloseTo(50.76, 0);
    expect(sunPositionAt(noon + 12 * 3_600_000, 36.72, -4.42).altitude).toBeLessThan(-40);
  });

  it('agrees with the provider moon phase', () => {
    // SunriseSunset.io fixture for 2026-09-29: Waning Gibbous, 90.81 % lit.
    const moon = moonPhaseAt(Date.parse('2026-09-29T12:00:00Z'));
    expect(moon.phase).toBe('Waning Gibbous');
    expect(Math.abs(moon.illumination - 90.81)).toBeLessThan(8);
  });

  it('reads moon data from both providers and adds moon fields', async () => {
    const http = client([[/sunrise-sunset\.org\/v2\?lat=78/, 'sunrise-org-v2-polar.json'], [/sunrisesunset\.io/, 'sunrisesunset-io.json']]);
    const org = await sunriseSunsetOrg(http, 78.2, 15.6, '2026-06-21');
    expect(org.moon).toMatchObject({ phase: 'First Quarter', illumination: 44.8, source: 'sunrise-sunset-org' });
    const io = await sunriseSunsetIo(http, 36.72, -4.42, '2026-09-29');
    expect(io.moon).toMatchObject({ phase: 'Waning Gibbous', illumination: 90.8, rise: new Date(1790710006 * 1000).toISOString() });
    expect(solarFields(io).find((item) => item.key === 'solar.moonIllumination')).toMatchObject({ value: 90.8, unit: '%', source: 'sunrisesunset-io' });
  });
});

describe('resolver fixes', () => {
  it('adds geohash, Maidenhead and antipode codes', async () => {
    const profile = await resolveLocation({ kind: 'map', lat: 57.64911, lon: 10.40744 }, { client: client([]), settings: DEFAULT_SETTINGS });
    const get = (key: string) => profile.fields.find((item) => item.key === key)?.value;
    expect(get('codes.geohash')).toBe('u4pruydqq');
    expect(String(get('codes.maidenhead'))).toMatch(/^JO57/);
    expect(get('solar.moonPhase')).toBeTruthy();
  });

  it('falls back to the geocoder when a bare number is not a postal code in the default country', async () => {
    const http = client([[/photon\.komoot\.io\/api/, 'photon-search-berlin.json']]);
    const profile = await resolveLocation({ kind: 'text', text: '10115' }, { client: http, settings: DEFAULT_SETTINGS });
    expect(profile.countryCode).toBe('DE');
    expect(profile.warnings.join(' ')).toMatch(/not a US postal code/);
  });
});

describe('GeoJSON, KML and import', () => {
  const profile: LocationProfile = {
    id: '1,2', schema: 'geo-intel-profile/1', createdAt: 'x', updatedAt: 'x', query: 'A & B', queryKind: 'place', label: 'A & B', lat: 1, lon: 2,
    countryCode: null, timezone: 'UTC', adminChain: [], holidays: null, solar: null, bbox: null, warnings: [], sourcesUsed: ['photon'],
    fields: [{ key: 'x.y', label: 'X', group: 'codes', value: '<v>', unit: null, source: 'photon', source_record_id: null, reference_year: null, retrieved_at: '2026-09-29T00:00:00Z', geography_type: 'point', geometry_id: null, license: 'ODbL', attribution: 'OSM', confidence_class: 'street' }],
  };
  const meta = resolveMetadata({ ...EMPTY_METADATA, title: 'T', author: 'Ada', tags: ['a'] }, [profile]);

  it('writes RFC 7946 GeoJSON with [lon, lat] order and per-field provenance', () => {
    const geo = JSON.parse(buildGeoJson([profile], meta));
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features[0].geometry.coordinates).toEqual([2, 1]);
    expect(geo.features[0].properties['x.y']).toBe('<v>');
    expect(geo.features[0].properties.provenance['x.y'].license).toBe('ODbL');
    expect(geo.metadata.author).toBe('Ada');
  });

  it('writes escaped KML 2.2', () => {
    const kml = buildKml([profile], meta);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2"');
    expect(kml).toContain('<name>A &amp; B</name>');
    expect(kml).toContain('<value>&lt;v&gt;</value>');
    expect(kml).toContain('<coordinates>2.0000000,1.0000000,0</coordinates>');
  });

  it('imports its own export and rejects invalid entries', () => {
    const exported = JSON.stringify({ schema: 'geo-intel-export/1', metadata: { title: 'T', tags: ['a'] }, profiles: [profile, { ...profile, lat: 200 }, { nope: 1 }] });
    const result = parseProfileImport(exported);
    expect(result.profiles).toHaveLength(1);
    expect(result.rejected).toBe(2);
    expect(parseProfileImport(JSON.stringify(profile)).profiles[0].id).toBe('1,2');
    expect(() => parseProfileImport('{bad')).toThrow(/not valid JSON/);
    expect(() => parseProfileImport('[]')).toThrow(/No Geo Intelligence Hub locations/);
  });
});

describe('prefixed geohash / locator search', async () => {
  const { parseQuery } = await import('../../src/tools/geo-intel/core/query-parser');
  it('parses prefixed codes and leaves UK postcodes alone', () => {
    expect(parseQuery('geohash: u4pruydqqvj')).toMatchObject({ kind: 'geohash' });
    expect(parseQuery('grid:FN31pr')).toMatchObject({ kind: 'maidenhead' });
    expect(parseQuery('AB12DE')).toMatchObject({ kind: 'postal', country: 'GB' });
    expect(parseQuery('gh:abc!')).toMatchObject({ kind: 'invalid' });
  });
});
