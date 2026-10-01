import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as olc from '../../src/tools/geo-intel/core/olc';
import { formatDDM, formatDMS, fromUtm, parseDegrees, parseMgrs, parseUtm, toMgrs, toUtm } from '../../src/tools/geo-intel/core/coords';
import {
  bboxAreaKm2, bboxContains, compassPoint, destination, distanceKm, finalBearing, greatCirclePoints, initialBearing,
  kmToMiles, midpoint, normalizeLon, ringAreaKm2,
} from '../../src/tools/geo-intel/core/geodesy';
import { invert, project, WORLD_EXTENT } from '../../src/tools/geo-intel/core/projection';
import { formatOffset, isDst, localDate, nauticalZone, nextTransition, offsetMinutes, observesDst } from '../../src/tools/geo-intel/core/timezone';
import { altitudeCrossing, computeSolarTimes, HORIZON, ruleOfThumbGolden, solarNoon } from '../../src/tools/geo-intel/core/solar';
import { parseQuery } from '../../src/tools/geo-intel/core/query-parser';
import { normalizePostal } from '../../src/tools/geo-intel/core/postal';
import { field, provenance, upsertFields } from '../../src/tools/geo-intel/core/sources';

const csv = (name: string) => readFileSync(new URL(`../fixtures/geo-intel/${name}`, import.meta.url), 'utf8')
  .split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => line.split(','));

describe('Open Location Code (official test_data)', () => {
  it('encodes integer inputs exactly', () => {
    const rows = csv('olc-encoding.csv');
    expect(rows.length).toBeGreaterThan(250);
    for (const [, , latInt, lngInt, length, expected] of rows) {
      expect(olc.encodeIntegers(Number(latInt), Number(lngInt), Number(length))).toBe(expected);
    }
  });

  it('encodes float inputs; only rows whose float→integer step is off by one differ', () => {
    // Like the reference JS, the conversion floors lat × 2.5e7 in binary floating
    // point, so e.g. 40.6 becomes 1014999999.99…; the integer test above is exact.
    const rows = csv('olc-encoding.csv');
    const mismatches = rows.filter(([lat, lng, , , length, expected]) => olc.encode(Number(lat), Number(lng), Number(length)) !== expected);
    expect(mismatches.length).toBeLessThanOrEqual(13);
    for (const [lat, lng, latInt, lngInt] of mismatches) {
      const [a, b] = olc.locationToIntegers(Number(lat), Number(lng));
      expect(Math.abs(a - Number(latInt)) + Math.abs(b - Number(lngInt))).toBe(1);
    }
  });

  it('decodes to the published bounding boxes', () => {
    for (const [code, length, latLo, lngLo, latHi, lngHi] of csv('olc-decoding.csv')) {
      const area = olc.decode(code);
      expect(area.codeLength).toBe(Number(length));
      expect(area.latitudeLo).toBeCloseTo(Number(latLo), 9);
      expect(area.longitudeLo).toBeCloseTo(Number(lngLo), 9);
      expect(area.latitudeHi).toBeCloseTo(Number(latHi), 9);
      expect(area.longitudeHi).toBeCloseTo(Number(lngHi), 9);
    }
  });

  it('classifies validity, short and full codes', () => {
    for (const [code, valid, short, full] of csv('olc-validityTests.csv')) {
      expect([code, olc.isValid(code), olc.isShort(code), olc.isFull(code)]).toEqual([code, valid === 'true', short === 'true', full === 'true']);
    }
  });

  it('shortens and recovers codes', () => {
    for (const [full, lat, lng, short, kind] of csv('olc-shortCodeTests.csv')) {
      if (kind === 'B' || kind === 'S') expect(olc.shorten(full, Number(lat), Number(lng))).toBe(short);
      if (kind === 'B' || kind === 'R') expect(olc.recoverNearest(short, Number(lat), Number(lng))).toBe(full);
    }
  });

  it('describes the cell size', () => {
    expect(olc.describeArea(olc.decode('8FW4V75V+9R'))).toMatch(/^≈1[34] m × 9\.\d m$/);
  });
});

describe('UTM and MGRS', () => {
  it('matches the proj4js/mgrs reference vectors', () => {
    expect(toMgrs({ lat: 0, lon: 0 }, 5)).toBe('31NAA6602100000');
    expect(toMgrs({ lat: 0.00001, lon: 0 }, 5)).toBe('31NAA6602100001');
    expect(toMgrs({ lat: 36.2361322, lon: -115.0820944 }, 5)).toBe('11SPA7234911844');
    expect(toMgrs({ lat: 36.2361322, lon: -115.0820944 }, 0)).toBe('11SPA');
    const vienna = parseMgrs('33UXP04');
    expect(vienna.center.lon).toBeCloseTo(16.4145, 3);
    expect(vienna.center.lat).toBeCloseTo(48.24949, 3);
    // Near a zone border: zone 24 reference, re-expressed in the regular zone 25.
    const arctic = parseMgrs('24XWT783908');
    expect(arctic.center.lon).toBeCloseTo(-32.66433, 4);
    expect(arctic.center.lat).toBeCloseTo(83.62778, 4);
    expect(toMgrs(arctic.center, 3)).toBe('25XEN041865');
  });

  it('accepts MGRS with spaces and round-trips a cell centre', () => {
    const spaced = parseMgrs('4QFJ 12345 67890');
    const compact = parseMgrs('4QFJ1234567890');
    expect(spaced.center.lat).toBeCloseTo(compact.center.lat, 9);
    const center = parseMgrs('34PBQ').center;
    expect(toMgrs(center, 0)).toBe('34PBQ');
  });

  it('projects and inverts UTM', () => {
    const utm = toUtm({ lat: 0, lon: 0 });
    expect(utm.zone).toBe(31);
    expect(utm.easting).toBeCloseTo(166021.44, 1);
    expect(utm.northing).toBeCloseTo(0, 3);
    const sydney = { lat: -33.8688, lon: 151.2093 };
    const s = toUtm(sydney);
    expect(s.hemisphere).toBe('S');
    const back = fromUtm(s.zone, s.hemisphere, s.easting, s.northing);
    expect(back.lat).toBeCloseTo(sydney.lat, 8);
    expect(back.lon).toBeCloseTo(sydney.lon, 8);
    expect(toUtm({ lat: 60, lon: 5 }).zone).toBe(32);
    expect(toUtm({ lat: 78, lon: 15 }).zone).toBe(33);
    expect(() => toUtm({ lat: 85, lon: 0 })).toThrow(/UPS/);
  });

  it('reads UTM strings with band letters or hemisphere words', () => {
    const s = toUtm({ lat: -33.8688, lon: 151.2093 });
    const text = `${s.zone}H ${s.easting.toFixed(1)} ${s.northing.toFixed(1)}`;
    expect(parseUtm(text).lat).toBeCloseTo(-33.8688, 5);
    expect(parseUtm(`${s.zone} south ${s.easting} ${s.northing}`).lon).toBeCloseTo(151.2093, 5);
    // "S" written as a hemisphere is resolved by the band check.
    expect(parseUtm(`${s.zone}S ${s.easting} ${s.northing}`).lat).toBeCloseTo(-33.8688, 5);
  });
});

describe('degree parsing and formatting', () => {
  it.each([
    ['48°51\'30.24"N 2°17\'40.2"E', 48.8584, 2.2945, 'dms'],
    ['40d26m46s S 79d58m56s W', -40.44611, -79.98222, 'dms'],
    ['N 48 51.504, E 2 17.67', 48.8584, 2.2945, 'ddm'],
    ['-33 52 04 151 12 26', -33.86778, 151.20722, 'dms'],
    ['2.2945 E, 48.8584 N', 48.8584, 2.2945, 'dd'],
    ['48,8584 N 2,2945 E', 48.8584, 2.2945, 'dd'],
  ])('parses %s', (text, lat, lon, format) => {
    const parsed = parseDegrees(text);
    expect(parsed.lat).toBeCloseTo(lat, 4);
    expect(parsed.lon).toBeCloseTo(lon, 4);
    expect(parsed.format).toBe(format);
  });

  it('rejects invalid minutes', () => {
    expect(() => parseDegrees('48 75 00 N 2 0 0 E')).toThrow(/below 60/);
  });

  it('formats DMS and DDM with carry', () => {
    expect(formatDMS({ lat: 48.8584, lon: 2.2945 })).toBe('48°51′30.24″N 2°17′40.20″E');
    expect(formatDDM({ lat: -33.86778, lon: 151.20722 }, 3)).toBe('33°52.067′S 151°12.433′E');
    expect(formatDMS({ lat: 10.999999999, lon: -0.5 }, 0)).toBe('11°00′00″N 0°30′00″W');
  });
});

describe('geodesy', () => {
  const london = { lat: 51.5074, lon: -0.1278 };
  const paris = { lat: 48.8566, lon: 2.3522 };

  it('computes haversine distance, bearings and midpoint', () => {
    expect(distanceKm(london, paris)).toBeCloseTo(343.56, 0);
    expect(kmToMiles(distanceKm(london, paris))).toBeCloseTo(213.5, 0);
    expect(initialBearing(london, paris)).toBeCloseTo(148.1, 0);
    expect(compassPoint(initialBearing(london, paris))).toBe('SSE');
    expect(finalBearing(london, paris)).toBeGreaterThan(initialBearing(london, paris));
    const mid = midpoint(london, paris);
    expect(distanceKm(london, mid)).toBeCloseTo(distanceKm(mid, paris), 6);
  });

  it('round-trips destination and draws great circles', () => {
    const d = destination(london, initialBearing(london, paris), distanceKm(london, paris));
    expect(d.lat).toBeCloseTo(paris.lat, 6);
    expect(d.lon).toBeCloseTo(paris.lon, 6);
    const arc = greatCirclePoints(london, paris, 10);
    expect(arc).toHaveLength(11);
    expect(arc[10].lat).toBeCloseTo(paris.lat, 9);
  });

  it('computes spherical rectangle and ring areas', () => {
    const box = { south: 0, north: 1, west: 0, east: 1 };
    expect(bboxAreaKm2(box)).toBeCloseTo(12363.7, 0);
    const ring = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: 0 }];
    expect(ringAreaKm2(ring)).toBeCloseTo(bboxAreaKm2(box), 3);
    expect(bboxAreaKm2({ south: 0, north: 1, west: 179.5, east: -179.5 })).toBeCloseTo(12363.7, 0);
    expect(bboxContains({ south: 0, north: 1, west: 179.5, east: -179.5 }, { lat: 0.5, lon: -179.9 })).toBe(true);
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(180)).toBe(180);
  });
});

describe('Equal Earth projection', () => {
  it('inverts its forward projection', () => {
    for (const [lon, lat] of [[0, 0], [2.29, 48.86], [-122.4, 37.8], [151.2, -33.9], [179.9, 80], [-179.9, -85]]) {
      const [x, y] = project(lon, lat);
      const back = invert(x, y);
      expect(back?.lat).toBeCloseTo(lat, 8);
      expect(back?.lon).toBeCloseTo(lon, 8);
    }
    expect(invert(WORLD_EXTENT[0] - 50, 0)).toBeNull();
    expect(WORLD_EXTENT[2] / WORLD_EXTENT[3]).toBeCloseTo(2.05458, 3);
  });
});

describe('time zones', () => {
  it('reads offsets and DST from Intl', () => {
    const autumn = new Date('2026-09-29T12:00:00Z');
    expect(offsetMinutes('America/New_York', autumn)).toBe(-240);
    expect(isDst('America/New_York', autumn)).toBe(true);
    expect(offsetMinutes('Asia/Kolkata', autumn)).toBe(330);
    expect(observesDst('Asia/Kolkata', 2026)).toBe(false);
    expect(isDst('Australia/Sydney', new Date('2026-12-01T00:00:00Z'))).toBe(true);
    expect(formatOffset(-570)).toBe('UTC−09:30');
    expect(localDate('Pacific/Kiritimati', new Date('2026-09-29T20:00:00Z'))).toBe('2026-09-30');
  });

  it('finds the next transition to the minute', () => {
    const next = nextTransition('America/New_York', new Date('2026-09-29T12:00:00Z'));
    expect(next?.at.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect([next?.fromMinutes, next?.toMinutes]).toEqual([-240, -300]);
    expect(nextTransition('Asia/Tokyo', new Date('2026-09-29T12:00:00Z'))).toBeNull();
  });

  it('names nautical zones with POSIX sign inversion', () => {
    expect(nauticalZone(-75)).toBe('Etc/GMT+5');
    expect(nauticalZone(120)).toBe('Etc/GMT-8');
    expect(nauticalZone(3)).toBe('Etc/GMT');
  });
});

describe('offline solar model', () => {
  // Reference: api.sunrise-sunset.org (v1, UTC) for Málaga 36.72, -4.42 on 2026-09-29.
  it('agrees with the reference within two minutes', () => {
    const near = (ms: number | null, iso: string) => expect(Math.abs((ms ?? 0) - Date.parse(iso)) / 60_000).toBeLessThan(2);
    near(altitudeCrossing('2026-09-29', 36.72, -4.42, HORIZON, true), '2026-09-29T06:10:03Z');
    near(altitudeCrossing('2026-09-29', 36.72, -4.42, HORIZON, false), '2026-09-29T18:05:54Z');
    near(solarNoon('2026-09-29', -4.42), '2026-09-29T12:07:58Z');
    near(altitudeCrossing('2026-09-29', 36.72, -4.42, -6, true), '2026-09-29T05:45:35Z');
    near(altitudeCrossing('2026-09-29', 36.72, -4.42, -18, false), '2026-09-29T19:30:38Z');
  });

  it('reports polar day and night', () => {
    const p = provenance({ source: 'computed', geography: 'point', confidence: 'modeled_grid', retrievedAt: '2026-09-29T00:00:00Z' });
    expect(computeSolarTimes('2026-06-21', 78.2, 15.6, p).status).toBe('polar_day');
    expect(computeSolarTimes('2026-12-21', 78.2, 15.6, p).status).toBe('polar_night');
    const normal = computeSolarTimes('2026-09-29', 36.72, -4.42, p);
    expect(normal.status).toBe('normal');
    expect(normal.goldenEvening?.[0] && normal.sunset && normal.goldenEvening[0] < normal.sunset).toBe(true);
    expect(ruleOfThumbGolden('2026-09-29T06:10:00.000Z', null).morning?.[1]).toBe('2026-09-29T07:10:00.000Z');
  });
});

describe('query parser', () => {
  it.each([
    ['48.8584, 2.2945', 'decimal'],
    ['8FW4V75V+9R', 'plus-code-full'],
    ['V75V+9R Paris', 'plus-code-short'],
    ['33UXP04', 'mgrs'],
    ['31N 448251 5411932', 'utm'],
    ['48°51′30″N 2°17′40″E', 'dms'],
    ['US 90210', 'postal'],
    ['90210, US', 'postal'],
    ['SW1A 1AA', 'postal'],
    ['K1A 0B1', 'postal'],
    ['10115', 'postal'],
    ['Paris', 'place'],
    ['US Route 66', 'place'],
    ['geo:48.8584,2.2945', 'decimal'],
    ['https://www.openstreetmap.org/#map=15/48.8584/2.2945', 'decimal'],
    ['https://www.google.com/maps/@48.8584,2.2945,15z', 'decimal'],
  ])('classifies %s', (text, kind) => {
    expect(parseQuery(text).kind).toBe(kind);
  });

  it('extracts countries and flags swapped coordinates', () => {
    expect(parseQuery('SW1A 1AA')).toMatchObject({ kind: 'postal', country: 'GB' });
    expect(parseQuery('K1A 0B1')).toMatchObject({ kind: 'postal', country: 'CA' });
    expect(parseQuery('10115')).toMatchObject({ kind: 'postal', country: null });
    expect(parseQuery('151.2, -33.9')).toMatchObject({ kind: 'invalid' });
    expect(parseQuery('')).toEqual({ kind: 'empty' });
  });
});

describe('postal normalisation', () => {
  it('routes to the geography each adapter actually publishes', () => {
    expect(normalizePostal('ca', 'k1a 0b1')).toMatchObject({ code: 'K1A', resolves: 'forward_sortation_area' });
    expect(normalizePostal('GB', 'sw1a 1aa')).toMatchObject({ code: 'SW1A1AA', resolves: 'full_code' });
    expect(normalizePostal('GB', 'SW1A')).toMatchObject({ resolves: 'outward_code' });
    expect(normalizePostal('NL', '1012 AB')).toMatchObject({ code: '1012', resolves: 'numeric_district' });
    expect(normalizePostal('LU', '1009').code).toBe('L-1009');
    expect(() => normalizePostal('XX', '1')).toThrow(/not available/);
  });
});

describe('provenance helpers', () => {
  it('fills license and attribution from the registry and skips empty values', () => {
    const meta = { source: 'world-bank' as const, geography: 'country' as const, confidence: 'admin_centroid' as const, retrievedAt: '2026-09-29T00:00:00Z', year: 2025, unit: 'people' };
    const population = field('population.country', 'Population', 'population', 341784857, meta);
    expect(population).toMatchObject({ license: 'CC BY 4.0', reference_year: 2025, unit: 'people', confidence_class: 'admin_centroid' });
    const merged = upsertFields([population], [field('population.country', 'Population', 'population', null, meta), field('x', 'X', 'codes', 'y', meta)]);
    expect(merged.map((item) => [item.key, item.value])).toEqual([['population.country', 341784857], ['x', 'y']]);
  });
});
