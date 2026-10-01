// Second production audit (2026-10-01): antimeridian geometry, scale bar, sun curve, planner, label copy.
import { describe, expect, it } from 'vitest';
import { polygonContains } from '../../src/tools/geo-intel/adapters/boundaries';
import { ringPath } from '../../src/tools/geo-intel/core/projection';
import { scaleFor } from '../../src/tools/geo-intel/ui/MapCanvas';
import { sunCurve } from '../../src/tools/geo-intel/ui/ProfilePanel';
import { workHours } from '../../src/tools/geo-intel/ui/CollectionPanels';
import { solarNoon } from '../../src/tools/geo-intel/core/solar';
import { HttpClient, MemoryCache } from '../../src/tools/geo-intel/net/http';
import { DEFAULT_SETTINGS } from '../../src/tools/geo-intel/net/store';
import { resolveLocation } from '../../src/tools/geo-intel/engine/synthesize';

// A Fiji-like island straddling ±180°.
const straddle = { type: 'Polygon' as const, coordinates: [[[179.5, -17], [-179.5, -17], [-179.5, -16], [179.5, -16], [179.5, -17]]] };

describe('antimeridian geometry', () => {
  it('finds points inside a boundary that crosses ±180°, and not outside it', () => {
    expect(polygonContains(straddle, 179.9, -16.5)).toBe(true);
    expect(polygonContains(straddle, -179.9, -16.5)).toBe(true);
    expect(polygonContains(straddle, 0, -16.5)).toBe(false);
    expect(polygonContains(straddle, 179.9, -15)).toBe(false);
  });
  it('starts a new subpath instead of drawing across the whole map', () => {
    const d = ringPath(straddle.coordinates[0]);
    expect(d.match(/M/g)?.length).toBe(3);
    expect(ringPath([[0, 0], [1, 0], [1, 1], [0, 0]]).match(/M/g)?.length).toBe(1);
  });
});

describe('map scale bar', () => {
  it('picks a round 1/2/5 distance no longer than the target width', () => {
    expect(scaleFor(10)).toEqual({ label: '1 km', px: 100 });
    expect(scaleFor(1000)?.label).toBe('100 km');
    expect(scaleFor(0.5)?.label).toBe('50 m');
    expect(scaleFor(0)).toBeNull();
    for (const mpp of [0.3, 7, 123, 4567, 98765]) {
      const s = scaleFor(mpp)!;
      expect(s.px).toBeLessThanOrEqual(140);
      expect(s.px).toBeGreaterThanOrEqual(28);
    }
  });
});

describe('sun height curve', () => {
  it('peaks at solar noon and dips below the horizon at night', () => {
    const noon = new Date(solarNoon('2026-09-29', -4.42)).toISOString();
    const curve = sunCurve(36.72, -4.42, noon);
    const peak = curve.reduce((a, b) => (b.altitude > a.altitude ? b : a));
    expect(Math.abs(peak.t - Date.parse(noon))).toBeLessThan(16 * 60_000);
    expect(peak.altitude).toBeCloseTo(50.76, 0);
    expect(curve[0].altitude).toBeLessThan(-40);
  });
});

describe('meeting planner', () => {
  it('marks weekday 09:00–17:00 local time only', () => {
    const tueNoonUtc = new Date('2026-09-29T12:00:00Z');
    expect(workHours(tueNoonUtc, 'Europe/London')).toBe(true);
    expect(workHours(tueNoonUtc, 'Asia/Tokyo')).toBe(false);
    expect(workHours(new Date('2026-10-03T12:00:00Z'), 'Europe/London')).toBe(false);
    expect(workHours(tueNoonUtc, 'Not/AZone')).toBe(false);
  });
});

describe('profile copy', () => {
  it('shows one country population and plain labels', async () => {
    const client = new HttpClient({ cache: new MemoryCache(), sleep: async () => undefined, fetch: async () => new Response('x', { status: 503 }) });
    const offline = await resolveLocation({ kind: 'map', lat: 48.8584, lon: 2.2945 }, { client, settings: DEFAULT_SETTINGS });
    const labels = offline.fields.map((f) => f.label);
    expect(labels).toContain('Population (GeoNames estimate)');
    expect(labels).toContain('Nearest town or city');
    expect(labels).toContain('Bordering countries (ISO codes)');
    expect(labels.join(' ')).not.toMatch(/bundled|DST this year/);
  });
});
