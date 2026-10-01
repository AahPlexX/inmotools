// Regressions for the PR #89 review findings (CodeAnt / Copilot).
import { describe, expect, it } from 'vitest';
import { normalizePostal } from '../../src/tools/geo-intel/core/postal';
import { icsEscape, neutralizeFormula, parseProfileImport } from '../../src/tools/geo-intel/export/formats';
import { formatDurationSeconds } from '../../src/tools/geo-intel/ui/format';
import { parseUtm } from '../../src/tools/geo-intel/core/coords';
import { greatCirclePoints, ringAreaKm2 } from '../../src/tools/geo-intel/core/geodesy';
import { observesDst } from '../../src/tools/geo-intel/core/timezone';
import { parseBatchCsv, runBatch } from '../../src/tools/geo-intel/engine/batch';
import { HttpClient, MemoryCache } from '../../src/tools/geo-intel/net/http';

describe('input validation', () => {
  it('accepts Dutch codes with zero or two letters only', () => {
    expect(normalizePostal('NL', '1012 AB').code).toBe('1012');
    expect(normalizePostal('NL', '1012').code).toBe('1012');
    expect(() => normalizePostal('NL', '1234 A')).toThrow(/Dutch/);
  });
  it('rejects UTM northings outside 0–10,000,000 m', () => {
    expect(() => parseUtm('31N 448251 12000000')).toThrow(/northing/);
  });
});

describe('export safety', () => {
  it('neutralises formulas but keeps plain signed numbers', () => {
    expect(neutralizeFormula('-1+HYPERLINK("x")')).toBe(`'-1+HYPERLINK("x")`);
    expect(neutralizeFormula('=SUM(A1)')).toBe(`'=SUM(A1)`);
    expect(neutralizeFormula('-12.5')).toBe('-12.5');
    expect(neutralizeFormula(42)).toBe(42);
  });
  it('escapes lone carriage returns in iCalendar text', () => {
    expect(icsEscape('a\rb\r\nc\nd')).toBe('a\\nb\\nc\\nd');
  });
  it('rejects imported profiles that cite unknown sources', () => {
    const base = { id: '1,2', schema: 'geo-intel-profile/1', label: 'x', lat: 1, lon: 2, sourcesUsed: ['photon', 'evil'], fields: [] as unknown[] };
    const field = (source: string) => ({ key: 'k', source, confidence_class: 'street' });
    expect(parseProfileImport(JSON.stringify([{ ...base, fields: [field('photon')] }])).profiles[0].sourcesUsed).toEqual(['photon']);
    expect(() => parseProfileImport(JSON.stringify([{ ...base, fields: [field('nope')] }]))).toThrow(/No Geo Intelligence Hub locations/);
  });
});

describe('math edge cases', () => {
  it('never shows "60 min"', () => {
    expect(formatDurationSeconds(7199)).toBe('2 h 00 min');
    expect(formatDurationSeconds(3540)).toBe('0 h 59 min');
  });
  it('draws a finite arc between antipodes', () => {
    const points = greatCirclePoints({ lat: 10, lon: 20 }, { lat: -10, lon: -160 }, 8);
    expect(points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))).toBe(true);
    expect(points.at(-1)?.lat).toBeCloseTo(-10, 5);
  });
  it('measures rings crossing the antimeridian at their true size', () => {
    const box = [{ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 }, { lat: 1, lon: -179.5 }, { lat: 1, lon: 179.5 }];
    expect(ringAreaKm2(box)).toBeCloseTo(12363.7, 0);
  });
  it('detects offset changes outside January/July (Morocco)', () => {
    expect(observesDst('Africa/Casablanca', 2026)).toBe(true);
    expect(observesDst('Asia/Tokyo', 2026)).toBe(false);
  });
});

describe('batch CSV', () => {
  it('reports an unclosed quote instead of guessing', () => {
    expect(() => parseBatchCsv('zip,country\n"90210,US\n')).toThrow(/unclosed quote/);
  });
  it('uses the default country when the cell is only whitespace', async () => {
    const seen: string[] = [];
    const client = new HttpClient({ cache: new MemoryCache(), sleep: async () => undefined, fetch: async (url) => { seen.push(String(url)); return new Response('{}', { status: 404 }); } });
    await runBatch(parseBatchCsv('zip,country\n10115,   \n'), { client, defaultCountry: 'DE' });
    expect(seen[0]).toContain('/de/10115');
  });
});

describe('request sharing', () => {
  it('cancelling one caller does not cancel another caller of the same URL', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const client = new HttpClient({ cache: new MemoryCache(), sleep: async () => undefined, fetch: async () => { await gate; return new Response('{"ok":1}', { status: 200 }); } });
    const first = new AbortController();
    const a = client.get<{ ok: number }>('https://x.test/same', { source: 'photon', ttlMs: 1000, signal: first.signal });
    const b = client.get<{ ok: number }>('https://x.test/same', { source: 'photon', ttlMs: 1000, signal: new AbortController().signal });
    first.abort();
    release();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await expect(b).resolves.toMatchObject({ data: { ok: 1 } });
  });
});
