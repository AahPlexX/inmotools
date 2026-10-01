import { describe, expect, it } from 'vitest';
import {
  admin1Match, countryAt, currencySymbol, decodeTopology, flagEmoji, languageNames, loadCountryShapes, loadCountryTable, loadManifest,
  loadTimezones, normalizeName, placesNear, timezoneAt,
} from '../../src/tools/geo-intel/offline/static-data';

describe('TopoJSON decoding', () => {
  it('decodes quantized, delta-encoded arcs including reversed arcs', () => {
    const topology = {
      type: 'Topology' as const,
      transform: { scale: [1, 1] as [number, number], translate: [0, 0] as [number, number] },
      arcs: [[[0, 0], [10, 0], [0, 10]], [[10, 10], [-10, 0], [0, -10]]],
      objects: { o: { type: 'GeometryCollection' as const, geometries: [{ type: 'Polygon' as const, id: 'sq', arcs: [[0, 1]], properties: { n: 1 } }, { type: 'Polygon' as const, id: 'rev', arcs: [[~1, ~0]] }] } },
    };
    const [square, reversed] = decodeTopology<{ n: number }>(topology, 'o');
    expect(square.polygons[0][0]).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    expect(square.bbox).toEqual([0, 0, 10, 10]);
    expect(reversed.polygons[0][0][0]).toEqual([0, 0]);
  });
});

describe('bundled data', () => {
  it('loads every dataset with the expected record counts', async () => {
    const [table, shapes, zones, manifest] = await Promise.all([loadCountryTable(), loadCountryShapes(), loadTimezones(), loadManifest()]);
    expect(table.rows).toHaveLength(252);
    expect(shapes).toHaveLength(242);
    expect(zones.length).toBeGreaterThan(440);
    expect(manifest.datasets.timezones.license).toBe('ODbL 1.0');
    expect(table.byA2.get('JP')).toMatchObject({ a3: 'JPN', drivingSide: 'left', capital: 'Tokyo', currencyCode: 'JPY' });
  });
});

describe('offline country lookup', () => {
  it.each([
    [48.8584, 2.2945, 'FR'], [40.7128, -74.006, 'US'], [-33.8688, 151.2093, 'AU'], [35.6762, 139.6503, 'JP'],
    [-1.2921, 36.8219, 'KE'], [64.1466, -21.9426, 'IS'], [52.52, 13.405, 'DE'], [-34.6037, -58.3816, 'AR'],
  ])('finds the country containing %f, %f', async (lat, lon, a2) => {
    const hit = await countryAt({ lat, lon });
    expect(hit?.country?.a2).toBe(a2);
  });

  it('snaps near-coast points and returns null in open ocean', async () => {
    expect(await countryAt({ lat: 0, lon: -30 })).toBeNull();
    const nearCoast = await countryAt({ lat: 43.2951, lon: 5.3615 - 0.02 });
    expect(nearCoast?.country?.a2).toBe('FR');
  });
});

describe('offline timezone lookup', () => {
  it.each([
    [40.7128, -74.006, 'America/New_York'], [51.5074, -0.1278, 'Europe/London'], [35.6762, 139.6503, 'Asia/Tokyo'],
    [28.6139, 77.209, 'Asia/Kolkata'], [-33.8688, 151.2093, 'Australia/Sydney'], [41.8781, -87.6298, 'America/Chicago'],
    [33.4484, -112.074, 'America/Phoenix'], [-23.5505, -46.6333, 'America/Sao_Paulo'],
  ])('resolves %f, %f', async (lat, lon, zone) => {
    expect((await timezoneAt({ lat, lon })).zone).toBe(zone);
  });

  it('uses ocean polygons, and nautical zones only where no polygon exists', async () => {
    const ocean = await timezoneAt({ lat: 0, lon: -30 });
    expect(ocean.zone).toMatch(/^Etc\/GMT/);
  });
});

describe('nearby places and names', () => {
  it('finds populated places within a radius, nearest first', async () => {
    const near = await placesNear({ lat: 48.8584, lon: 2.2945 }, 25);
    expect(near[0].name).toBe('Paris');
    expect(near.every((place, i) => i === 0 || place.distanceKm >= near[i - 1].distanceKm)).toBe(true);
    expect(near.every((place) => place.distanceKm <= 25)).toBe(true);
    const wrapped = await placesNear({ lat: -17.8, lon: 179.9 }, 300);
    expect(wrapped.some((place) => place.a2 === 'FJ')).toBe(true);
  });

  it('matches admin-1 names to GeoNames codes', async () => {
    expect(await admin1Match('US', 'California')).toMatchObject({ code: 'US.CA', geonameId: 5332921 });
    expect(await admin1Match('US', 'CA')).toMatchObject({ code: 'US.CA' });
    expect(await admin1Match('FR', 'Île-de-France')).toMatchObject({ code: 'FR.11' });
    expect(normalizeName('State of São Paulo')).toBe('sao paulo');
  });

  it('formats flags, currency symbols and language names', () => {
    expect(flagEmoji('JP')).toBe('🇯🇵');
    expect(flagEmoji(null)).toBe('');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol(null)).toBeNull();
    expect(languageNames(['de', 'fr-CH'])).toEqual(['German', 'Swiss French']);
  });
});
