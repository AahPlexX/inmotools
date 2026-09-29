import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HttpClient, MemoryCache } from '../../src/tools/geo-intel/net/http';
import { DEFAULT_SETTINGS } from '../../src/tools/geo-intel/net/store';
import { confidenceForPrecision, decimalPrecisionMetres, resolveLocation, ResolveError } from '../../src/tools/geo-intel/engine/synthesize';
import { batchToCsv, parseBatchCsv, runBatch } from '../../src/tools/geo-intel/engine/batch';
import { FIELD_GROUPS } from '../../src/tools/geo-intel/core/types';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/geo-intel/responses/${name}`, import.meta.url));
type Route = [RegExp, string | number | object];

function client(routes: Route[]) {
  const seen: string[] = [];
  const http = new HttpClient({
    cache: new MemoryCache(),
    sleep: async () => undefined,
    fetch: async (input) => {
      const url = String(input);
      seen.push(url);
      const route = routes.find(([pattern]) => pattern.test(url));
      if (!route) return new Response('offline', { status: 503 });
      const [, target] = route;
      if (typeof target === 'number') return new Response(target === 204 ? null : '{}', { status: target });
      if (typeof target === 'object') return new Response(JSON.stringify(target), { status: 200 });
      return new Response(fixture(target), { status: 200 });
    },
  });
  return { http, seen };
}

const NOW = () => new Date('2026-09-29T12:00:00Z');
const BERLIN_ROUTES: Route[] = [
  [/photon\.komoot\.io\/api/, 'photon-search-berlin.json'],
  [/worldbank\.org\/v2\/country\/DEU/, 'worldbank-de.json'],
  [/PublicHolidays\/2026\/DE/, 'nager-2026-de.json'],
  [/gisco-services/, 'gisco-nuts-berlin.json'],
  [/demo_r_pjanaggr3/, 'eurostat-pop-de300.json'],
  [/demo_r_d3dens/, 'eurostat-dens-de300.json'],
  [/nama_10r_3gdp/, 'eurostat-gdp-de300.json'],
  [/lfst_r_lfe2emprt/, 'eurostat-emp-de30.json'],
  [/sunrise-sunset\.org/, 'sunrise-org-v2.json'],
  [/open-elevation/, 'open-elevation.json'],
];

describe('resolveLocation', () => {
  it('synthesises a place-name profile where every field carries full provenance', async () => {
    const { http, seen } = client(BERLIN_ROUTES);
    const profile = await resolveLocation({ kind: 'text', text: 'Berlin' }, { client: http, settings: DEFAULT_SETTINGS, now: NOW });
    expect(profile).toMatchObject({ countryCode: 'DE', timezone: 'Europe/Berlin', queryKind: 'place', id: '52.51739,13.39513' });
    const get = (key: string) => profile.fields.find((item) => item.key === key);
    expect(get('country.name')?.value).toBe('🇩🇪 Germany');
    expect(get('wb.SP.POP.TOTL')).toMatchObject({ value: 83491249, reference_year: 2025, source: 'world-bank' });
    expect(get('eu.population.nuts3')).toMatchObject({ value: 3685265, geography_type: 'nuts3' });
    expect(get('tz.offset')?.value).toBe('UTC+02:00');
    expect(get('tz.dst')?.value).toBe(true);
    expect(get('holidays.next')?.value).toMatch(/^2026-10-03/);
    expect(get('elevation.feet')?.unit).toBe('ft');
    expect(get('admin.geonamesAdmin1')?.value ?? null).toBeNull();
    expect(profile.adminChain[0]).toMatchObject({ level: 0, name: 'Germany', code: 'DE' });
    for (const item of profile.fields) {
      expect(FIELD_GROUPS).toContain(item.group);
      expect(item.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(item.license).toBeTruthy();
      expect(item.attribution).toBeTruthy();
      expect(['rooftop', 'street', 'postal_centroid', 'locality_centroid', 'admin_centroid', 'modeled_grid']).toContain(item.confidence_class);
    }
    expect(profile.sourcesUsed).toEqual(expect.arrayContaining(['photon', 'world-bank', 'eurostat', 'nager-date', 'sunrise-sunset-org', 'natural-earth', 'geonames', 'timezone-boundary-builder']));
    expect(seen.some((url) => url.includes('nominatim'))).toBe(false);
    expect(seen.some((url) => url.includes('photon.komoot.io/reverse'))).toBe(false);
  });

  it('resolves postal codes without inventing a postal-code population', async () => {
    const { http, seen } = client([[/zippopotam\.us\/us\/90210/, 'zippopotam-us-90210.json']]);
    const profile = await resolveLocation({ kind: 'text', text: 'US 90210' }, { client: http, settings: DEFAULT_SETTINGS, now: NOW });
    expect(profile.label).toBe('90210 Beverly Hills');
    expect(profile.fields.find((item) => item.key === 'location.lat')?.confidence_class).toBe('postal_centroid');
    expect(profile.fields.some((item) => /postal/i.test(item.label) && item.group === 'population')).toBe(false);
    expect(profile.warnings.join(' ')).toMatch(/Population is not reported for postal codes/);
    expect(seen.some((url) => url.includes('gisco'))).toBe(false);
    expect(profile.timezone).toBe('America/Los_Angeles');
  });

  it('reverse-geocodes typed coordinates and still works fully offline', async () => {
    const online = client([[/photon\.komoot\.io\/reverse/, 'photon-reverse.json']]);
    const profile = await resolveLocation({ kind: 'text', text: '48.8584, 2.2945' }, { client: online.http, settings: DEFAULT_SETTINGS, now: NOW });
    expect(profile.fields.find((item) => item.key === 'address.postcode')?.value).toBe('75007');
    expect(profile.fields.find((item) => item.key === 'location.lat')?.confidence_class).toBe('rooftop');

    const offline = client([]);
    const cold = await resolveLocation({ kind: 'map', lat: 48.8584, lon: 2.2945 }, { client: offline.http, settings: DEFAULT_SETTINGS, now: NOW });
    expect(cold.countryCode).toBe('FR');
    expect(cold.timezone).toBe('Europe/Paris');
    expect(cold.solar?.provenance.source).toBe('computed');
    expect(cold.fields.find((item) => item.key === 'codes.plusCode')?.value).toBe('8FW4V75V+9R6');
    expect(cold.warnings.length).toBeGreaterThan(2);
  });

  it('keeps Nominatim off unless enabled', async () => {
    const empty = { features: [] };
    const off = client([[/photon/, empty], [/nominatim.*search/, 'nominatim-search.json']]);
    await expect(resolveLocation({ kind: 'text', text: 'Somewhere obscure' }, { client: off.http, settings: DEFAULT_SETTINGS, now: NOW })).rejects.toThrow(/enable Nominatim/);
    expect(off.seen.some((url) => url.includes('nominatim'))).toBe(false);
    const on = client([[/photon/, empty], [/nominatim.*search/, 'nominatim-search.json']]);
    const profile = await resolveLocation({ kind: 'text', text: 'Somewhere obscure' }, { client: on.http, settings: { ...DEFAULT_SETTINGS, nominatimEnabled: true }, now: NOW });
    expect(profile.sourcesUsed).toContain('nominatim');
  });

  it('recovers short Plus Codes from a reference point and rejects invalid input', async () => {
    const { http } = client([]);
    const profile = await resolveLocation({ kind: 'text', text: 'V75V+9R' }, { client: http, settings: DEFAULT_SETTINGS, now: NOW, referencePoint: { lat: 48.86, lon: 2.35 } });
    expect(profile.lat).toBeCloseTo(48.85844, 4);
    await expect(resolveLocation({ kind: 'text', text: 'V75V+9R' }, { client: http, settings: DEFAULT_SETTINGS, now: NOW })).rejects.toBeInstanceOf(ResolveError);
    await expect(resolveLocation({ kind: 'text', text: '151.2, -33.9' }, { client: http, settings: DEFAULT_SETTINGS, now: NOW })).rejects.toThrow(/longitude first/);
  });

  it('derives coordinate confidence from typed precision', () => {
    expect(decimalPrecisionMetres('48.8584, 2.2945')).toBeCloseTo(11.132, 2);
    expect(confidenceForPrecision(decimalPrecisionMetres('48.88, 2.29'))).toBe('locality_centroid');
    expect(confidenceForPrecision(decimalPrecisionMetres('48.8, 2.2'))).toBe('admin_centroid');
    expect(confidenceForPrecision(decimalPrecisionMetres('48, 2'))).toBe('admin_centroid');
  });
});

describe('batch postal lookup', () => {
  it('detects columns, de-duplicates requests, reports failures and writes CSV', async () => {
    const { http, seen } = client([
      [/zippopotam\.us\/us\/90210/, 'zippopotam-us-90210.json'],
      [/postcodes\.io\/postcodes\/SW1A1AA/, 'postcodes-sw1a1aa.json'],
      [/zippopotam\.us\/us\/00000/, 404],
    ]);
    const input = parseBatchCsv('\uFEFFid,Zip Code,Country\n1,90210,US\n2,SW1A 1AA,gb\n3,00000,US\n4,90210,US\n5,123,XX\n');
    expect([input.postalColumn, input.countryColumn]).toEqual(['Zip Code', 'Country']);
    const progress: number[] = [];
    const result = await runBatch(input, { client: http, defaultCountry: 'US', onProgress: (p) => progress.push(p.done), now: NOW });
    expect(result.rows.map((row) => row.gi_status)).toEqual(['ok', 'ok', 'not_found', 'ok', 'error']);
    expect(seen.filter((url) => url.includes('90210'))).toHaveLength(1);
    expect(result.rows[1]).toMatchObject({ gi_source: 'postcodes-io', gi_country: 'GB', gi_timezone: 'Europe/London', gi_utc_offset: 'UTC+01:00' });
    expect(progress.at(-1)).toBe(5);
    const csv = batchToCsv(input, result.rows);
    expect(csv.split('\n')[0]).toMatch(/^id,Zip Code,Country,gi_status,gi_postcode/);
    expect(csv).toContain('Beverly Hills');
  });

  it('stops when cancelled', async () => {
    const { http } = client([[/zippopotam/, 'zippopotam-us-90210.json']]);
    const controller = new AbortController();
    const input = parseBatchCsv('zip\n90210\n90211\n90212');
    const result = await runBatch(input, { client: http, defaultCountry: 'US', signal: controller.signal, onProgress: (p) => { if (p.done === 1) controller.abort(); } });
    expect(result.cancelled).toBe(true);
    expect(result.rows).toHaveLength(1);
  });
});
