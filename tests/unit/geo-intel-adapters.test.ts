import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HttpClient, MemoryCache } from '../../src/tools/geo-intel/net/http';
import { normalizePostal } from '../../src/tools/geo-intel/core/postal';
import { postcodesLookup, postcodesReverse, zippopotamLookup } from '../../src/tools/geo-intel/adapters/postal';
import { eurostatRegion, nutsChain, nutsForPoint, parseJsonStat, worldBankAllCountries, worldBankCountry } from '../../src/tools/geo-intel/adapters/statistics';
import { boundaryLayer, corsSafeGithubUrl, featureAt } from '../../src/tools/geo-intel/adapters/boundaries';
import { bigDataCloudDevice, deviceConfidence, nominatimReverse, nominatimSearch, photonReverse, photonSearch } from '../../src/tools/geo-intel/adapters/geocoders';
import { decodePng, elevation, nagerHolidays, solarTimes, sunriseSunsetIo, sunriseSunsetOrg, terrariumHeight, tilePixel } from '../../src/tools/geo-intel/adapters/environment';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/geo-intel/responses/${name}`, import.meta.url));

/** Maps URL substrings to recorded 2026-09-29 responses. */
function client(routes: Array<[RegExp, string | number]>) {
  const seen: string[] = [];
  const http = new HttpClient({
    cache: new MemoryCache(),
    sleep: async () => undefined,
    fetch: async (input) => {
      const url = String(input);
      seen.push(url);
      const route = routes.find(([pattern]) => pattern.test(url));
      if (!route) return new Response('not mocked', { status: 599 });
      if (typeof route[1] === 'number') return new Response(route[1] === 204 ? null : '{}', { status: route[1] });
      const body = fixture(route[1]);
      return new Response(body, { status: 200, headers: { 'Content-Type': route[1].endsWith('.png') ? 'image/png' : 'application/json' } });
    },
  });
  return { http, seen };
}

describe('postal adapters', () => {
  it('reads Zippopotam places with postal-centroid provenance', async () => {
    const { http, seen } = client([[/zippopotam\.us\/us\/90210/, 'zippopotam-us-90210.json']]);
    const result = await zippopotamLookup(http, normalizePostal('US', '90210'));
    expect(seen[0]).toBe('https://api.zippopotam.us/us/90210');
    expect(result.point).toEqual({ lat: 34.0901, lon: -118.4065 });
    expect(result.confidence).toBe('postal_centroid');
    const place = result.fields.find((item) => item.key === 'address.place');
    expect(place).toMatchObject({ value: 'Beverly Hills', source: 'zippopotam', license: expect.stringContaining('ODbL'), geography_type: 'locality' });
    expect(result.adminChain[0]).toMatchObject({ name: 'California', code: 'CA' });
  });

  it('reads Postcodes.io full codes, outward codes and reverse lookups', async () => {
    const { http } = client([
      [/postcodes\/SW1A1AA/, 'postcodes-sw1a1aa.json'],
      [/outcodes\/SW1A/, 'postcodes-outcode-sw1a.json'],
      [/postcodes\?lon=/, 'postcodes-reverse.json'],
    ]);
    const full = await postcodesLookup(http, normalizePostal('GB', 'SW1A 1AA'));
    expect(full.confidence).toBe('rooftop');
    expect(full.fields.find((item) => item.key === 'admin.district')?.value).toBe('Westminster');
    expect(full.fields.find((item) => item.key === 'codes.itl3')?.value).toBe('TLI35');
    const outward = await postcodesLookup(http, normalizePostal('GB', 'SW1A'));
    expect(outward.confidence).toBe('postal_centroid');
    expect(outward.fields.find((item) => item.key === 'admin.district')?.value).toBe('Wandsworth; Westminster');
    const reverse = await postcodesReverse(http, 51.501, -0.1416);
    expect(reverse?.fields.find((item) => item.key === 'address.postcode')?.label).toBe('Nearest postcode');
  });
});

describe('statistics adapters', () => {
  it('reads World Bank indicators with reference years', async () => {
    const { http, seen } = client([[/api\.worldbank\.org\/v2\/country\/DEU/, 'worldbank-de.json']]);
    const fields = await worldBankCountry(http, 'DEU');
    expect(seen[0]).toContain('source=2');
    const pop = fields.find((item) => item.key === 'wb.SP.POP.TOTL');
    expect(pop).toMatchObject({ value: 83491249, reference_year: 2025, unit: 'people', license: 'CC BY 4.0', geography_type: 'country' });
    expect(fields.find((item) => item.key === 'wb.EN.POP.DNST')?.reference_year).toBe(2023);
  });

  it('builds a choropleth map keyed by ISO3 and drops aggregates without ISO3', async () => {
    const { http } = client([[/country\/all\/indicator\/EN\.POP\.DNST/, 'worldbank-all-density.json']]);
    const data = await worldBankAllCountries(http, 'EN.POP.DNST');
    expect(data.values.get('DEU')?.value).toBeGreaterThan(200);
    expect(data.values.size).toBeGreaterThan(180);
  });

  it('parses JSON-stat and composes NUTS 1–3 statistics', async () => {
    const { http } = client([
      [/gisco-services.*x=13\.4/, 'gisco-nuts-berlin.json'],
      [/demo_r_pjanaggr3/, 'eurostat-pop-de300.json'],
      [/demo_r_d3dens/, 'eurostat-dens-de300.json'],
      [/nama_10r_3gdp/, 'eurostat-gdp-de300.json'],
      [/lfst_r_lfe2emprt/, 'eurostat-emp-de30.json'],
    ]);
    const { nuts3 } = await nutsForPoint(http, 52.5, 13.4);
    expect(nuts3).toBe('DE300');
    expect(nutsChain('DE300')).toEqual(['DE', 'DE3', 'DE30', 'DE300']);
    const fields = await eurostatRegion(http, 'DE300');
    expect(fields.find((item) => item.key === 'eu.population.nuts3')).toMatchObject({ value: 3685265, reference_year: 2025, geography_type: 'nuts3' });
    expect(fields.find((item) => item.key === 'eu.gdpPerInhabitant.nuts3')).toMatchObject({ value: 54700, reference_year: 2023 });
    expect(fields.find((item) => item.key === 'eu.employmentRate.nuts2')?.value).toBe(76.7);
    expect(fields.find((item) => item.key === 'eu.density.nuts3')?.unit).toBe('people per km²');
    const gdp = JSON.parse(fixture('eurostat-gdp-de300.json').toString());
    expect(parseJsonStat(gdp).map((point) => point.time)).toEqual(['2022', '2023']);
  });

  it('returns no NUTS code over the ocean', async () => {
    const { http } = client([[/gisco-services/, 'gisco-nuts-ocean.json']]);
    expect((await nutsForPoint(http, 40, -30)).nuts3).toBeNull();
  });
});

describe('boundaries adapter', () => {
  it('rewrites GitHub raw links to the CORS-enabled media host and finds the containing unit', async () => {
    expect(corsSafeGithubUrl('https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/LUX/ADM1/x.geojson'))
      .toBe('https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/LUX/ADM1/x.geojson');
    const { http, seen } = client([
      [/geoboundaries\.org\/api/, 'geoboundaries-lux-adm1.json'],
      [/media\.githubusercontent\.com/, 'geoboundaries-lux-adm1.geojson'],
    ]);
    const layer = await boundaryLayer(http, 'LUX', 'ADM1');
    expect(seen[1]).toMatch(/^https:\/\/media\.githubusercontent\.com\//);
    expect(layer.meta.boundaryLicense).toContain('Open Database License');
    expect(layer.features.length).toBeGreaterThan(5);
    const hit = featureAt(layer, 6.1296, 49.6116);
    expect(hit?.properties.shapeName).toMatch(/Luxembourg/);
  });
});

describe('geocoders', () => {
  it('maps BigDataCloud device results and device accuracy to confidence', async () => {
    const { http } = client([[/bigdatacloud/, 'bigdatacloud-paris.json']]);
    const result = await bigDataCloudDevice(http, { lat: 48.8584, lon: 2.2945 });
    expect(result.countryCode).toBe('FR');
    expect(result.fields.find((item) => item.key === 'address.postcode')?.value).toBe('75007');
    expect(result.adminChain.map((item) => item.name)).toContain('Ile-de-France');
    expect([deviceConfidence(12), deviceConfidence(120), deviceConfidence(2000), deviceConfidence(null)]).toEqual(['rooftop', 'street', 'locality_centroid', 'locality_centroid']);
  });

  it('maps Photon search and reverse results', async () => {
    const { http } = client([[/photon\.komoot\.io\/api/, 'photon-search-berlin.json'], [/photon\.komoot\.io\/reverse/, 'photon-reverse.json']]);
    const search = await photonSearch(http, 'Berlin');
    expect(search).toMatchObject({ countryCode: 'DE', confidence: 'locality_centroid', recordId: 'R62422' });
    expect(search?.point?.lat).toBeCloseTo(52.5173885, 6);
    const reverse = await photonReverse(http, 48.8584, 2.2945);
    expect(reverse?.confidence).toBe('rooftop');
    expect(reverse?.fields.find((item) => item.key === 'address.street')?.value).toBe('Avenue Anatole France 5');
  });

  it('maps Nominatim results with ISO 3166-2 codes', async () => {
    const { http } = client([[/nominatim.*search/, 'nominatim-search.json'], [/nominatim.*reverse/, 'nominatim-reverse.json']]);
    const search = await nominatimSearch(http, 'Berlin');
    expect(search?.countryCode).toBe('DE');
    const reverse = await nominatimReverse(http, 48.8584, 2.2945);
    expect(reverse?.fields.find((item) => item.key === 'admin.stateCode')?.value).toBe('FR-IDF');
    expect(reverse?.confidence).toBe('rooftop');
  });
});

describe('environment adapters', () => {
  it('reads Nager.Date holidays and treats 204 as unsupported', async () => {
    const { http } = client([[/PublicHolidays\/2026\/DE/, 'nager-2026-de.json'], [/PublicHolidays\/2026\/IN/, 204]]);
    const calendar = await nagerHolidays(http, 2026, 'de');
    expect(calendar?.items.length).toBeGreaterThan(15);
    expect(calendar?.items[0]).toMatchObject({ date: '2026-01-01', global: true });
    expect(await nagerHolidays(http, 2026, 'IN')).toBeNull();
    expect(http.healthOf('nager-date').consecutiveFailures).toBe(0);
  });

  it('reads Sunrise-Sunset.org v2 incl. polar status and SunriseSunset.io unix times', async () => {
    const { http } = client([[/sunrise-sunset\.org\/v2\?lat=36/, 'sunrise-org-v2.json'], [/sunrise-sunset\.org\/v2\?lat=78/, 'sunrise-org-v2-polar.json'], [/sunrisesunset\.io/, 'sunrisesunset-io.json']]);
    const org = await sunriseSunsetOrg(http, 36.72, -4.42, '2026-09-29');
    expect(org.sunrise).toBe('2026-09-29T06:11:12.000Z');
    expect(org.goldenEvening?.[0]).toMatch(/^2026-09-29T17:/);
    expect(org.provenance.source).toBe('sunrise-sunset-org');
    expect((await sunriseSunsetOrg(http, 78.2, 15.6, '2026-06-21')).status).toBe('polar_day');
    const io = await sunriseSunsetIo(http, 36.72, -4.42, '2026-09-29');
    expect(io.sunrise).toBe(new Date(1790662236 * 1000).toISOString());
    expect(io.dayLengthSeconds).toBe(11 * 3600 + 54 * 60 + 11);
  });

  it('falls back to the offline model when both sun services fail', async () => {
    const { http } = client([]);
    const { solar, warnings } = await solarTimes(http, 36.72, -4.42, '2026-09-29');
    expect(solar.provenance.source).toBe('computed');
    expect(warnings).toHaveLength(2);
    expect(Math.abs(Date.parse(solar.sunrise ?? '') - Date.parse('2026-09-29T06:10:03Z'))).toBeLessThan(120_000);
  });

  it('decodes a recorded Terrarium tile to a plausible Alpine elevation', async () => {
    const tile = tilePixel(46.5, 7.9);
    expect([tile.x, tile.y]).toEqual([2137, 1448]);
    const png = decodePng(fixture('terrarium-12-2137-1448.png').buffer.slice(0) as ArrayBuffer);
    expect([png.width, png.height, png.channels]).toEqual([256, 256, 3]);
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    const { http } = client([[/terrarium\/12\/2137\/1448/, 'terrarium-12-2137-1448.png']]);
    const result = await elevation(http, 46.5, 7.9);
    // Open-Elevation (SRTM 250 m) reports 2352 m here; a 30 m pixel in steep terrain differs by tens of metres.
    expect(result.field?.value as number).toBeGreaterThan(2100);
    expect(result.field?.value as number).toBeLessThan(2600);
    expect(result.field).toMatchObject({ source: 'terrain-tiles', unit: 'm', confidence_class: 'modeled_grid' });
  });

  it('falls back to Open-Elevation when the tile fails', async () => {
    const { http } = client([[/open-elevation/, 'open-elevation.json']]);
    const result = await elevation(http, 46.5, 7.9);
    expect(result.field).toMatchObject({ source: 'open-elevation', value: 2352.1 });
    expect(result.warnings[0]).toMatch(/Terrain Tiles/);
  });
});
