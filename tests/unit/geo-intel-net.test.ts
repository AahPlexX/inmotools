import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CircuitOpenError, HttpClient, HttpError, MemoryCache, NotFoundError, OfflineError, TTL } from '../../src/tools/geo-intel/net/http';
import {
  clearHistory, DexieResponseCache, getProfile, HISTORY_LIMIT, listProfiles, loadSettings, normalizeTags, parseTagInput,
  pruneResponses, recordProfile, resetGeoIntelDbForTests, responseCacheStats, saveSettings, updateProfileMeta,
} from '../../src/tools/geo-intel/net/store';
import type { LocationProfile } from '../../src/tools/geo-intel/core/types';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function harness(responses: Array<Response | Error>, online = true) {
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const calls: string[] = [];
  const client = new HttpClient({
    fetch: async (input) => {
      calls.push(String(input));
      const next = responses.shift();
      if (!next) throw new Error('no more responses');
      if (next instanceof Error) throw next;
      return next;
    },
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    random: () => 0.5,
    isOnline: () => online,
    cache: new MemoryCache(),
  });
  return { client, sleeps, calls, advance: (ms: number) => { clock += ms; } };
}

describe('HttpClient', () => {
  it('caches within TTL and refetches after expiry', async () => {
    const h = harness([json({ a: 1 }), json({ a: 2 })]);
    const first = await h.client.get<{ a: number }>('https://x.test/a', { source: 'photon', ttlMs: TTL.hour });
    const second = await h.client.get<{ a: number }>('https://x.test/a', { source: 'photon', ttlMs: TTL.hour });
    expect([first.data.a, first.fromCache, second.data.a, second.fromCache]).toEqual([1, false, 1, true]);
    h.advance(TTL.hour + 1);
    const third = await h.client.get<{ a: number }>('https://x.test/a', { source: 'photon', ttlMs: TTL.hour });
    expect(third.data.a).toBe(2);
    expect(h.calls).toHaveLength(2);
  });

  it('de-duplicates concurrent requests for the same URL', async () => {
    const h = harness([json({ ok: true })]);
    const [a, b] = await Promise.all([
      h.client.get('https://x.test/same', { source: 'world-bank', ttlMs: TTL.day }),
      h.client.get('https://x.test/same', { source: 'world-bank', ttlMs: TTL.day }),
    ]);
    expect(a.data).toEqual(b.data);
    expect(h.calls).toHaveLength(1);
  });

  it('spaces Nominatim requests at least 1.1 s apart', async () => {
    const h = harness([json([]), json([]), json([])]);
    await Promise.all(['q1', 'q2', 'q3'].map((q) => h.client.get(`https://n.test/${q}`, { source: 'nominatim', ttlMs: TTL.day })));
    expect(h.calls).toEqual(['https://n.test/q1', 'https://n.test/q2', 'https://n.test/q3']);
    expect(h.sleeps.filter((ms) => ms >= 1_100)).toHaveLength(2);
  });

  it('retries 5xx with exponential backoff and honours Retry-After', async () => {
    const h = harness([json({}, 503), json({}, 429, { 'Retry-After': '3' }), json({ done: 1 })]);
    const result = await h.client.get<{ done: number }>('https://x.test/r', { source: 'world-bank', ttlMs: TTL.day });
    expect(result.data.done).toBe(1);
    expect(h.sleeps).toContain(500);
    expect(h.sleeps).toContain(3_000);
  });

  it('does not retry or trip the breaker on 404', async () => {
    const h = harness([json({}, 404)]);
    await expect(h.client.get('https://x.test/missing', { source: 'zippopotam', ttlMs: TTL.day })).rejects.toBeInstanceOf(NotFoundError);
    expect(h.calls).toHaveLength(1);
    expect(h.client.healthOf('zippopotam').consecutiveFailures).toBe(0);
  });

  it('opens the circuit after repeated failures, then half-opens after cooldown', async () => {
    const h = harness(Array.from({ length: 20 }, () => new TypeError('Failed to fetch')));
    for (let i = 0; i < 4; i += 1) {
      await expect(h.client.get(`https://x.test/f${i}`, { source: 'nager-date', ttlMs: TTL.day })).rejects.toBeInstanceOf(TypeError);
    }
    expect(h.client.healthOf('nager-date').state).toBe('open');
    await expect(h.client.get('https://x.test/f9', { source: 'nager-date', ttlMs: TTL.day })).rejects.toBeInstanceOf(CircuitOpenError);
    h.advance(60_001);
    expect(h.client.healthOf('nager-date').state).toBe('half-open');
    h.client.resetBreaker('nager-date');
    expect(h.client.healthOf('nager-date').state).toBe('closed');
  });

  it('serves stale cache when offline or after failure, and errors when nothing is cached', async () => {
    const h = harness([json({ v: 1 }), new TypeError('down'), new TypeError('down'), new TypeError('down')]);
    await h.client.get('https://x.test/s', { source: 'eurostat', ttlMs: 10 });
    h.advance(100);
    const stale = await h.client.get<{ v: number }>('https://x.test/s', { source: 'eurostat', ttlMs: 10 });
    expect(stale).toMatchObject({ stale: true, fromCache: true, data: { v: 1 } });
    const offline = harness([], false);
    await expect(offline.client.get('https://x.test/o', { source: 'eurostat', ttlMs: 10 })).rejects.toBeInstanceOf(OfflineError);
  });

  it('converts a timeout into an HttpError with status 0 and counts it as a failure', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    const h = harness([abort, abort, abort]);
    await expect(h.client.get('https://x.test/t', { source: 'terrain-tiles', ttlMs: 10 })).rejects.toMatchObject({ status: 0 });
    expect(h.client.healthOf('terrain-tiles').consecutiveFailures).toBe(1);
    expect(new HttpError('x', 500, 'photon').status).toBe(500);
  });
});

const profile = (id: string, label = id): LocationProfile => ({
  id, schema: 'geo-intel-profile/1', createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z', query: label, queryKind: 'place',
  label, lat: 0, lon: 0, countryCode: null, timezone: null, fields: [], adminChain: [], holidays: null, solar: null, bbox: null, warnings: [], sourcesUsed: [],
});

describe('IndexedDB store', () => {
  afterEach(async () => { await clearHistory(false); resetGeoIntelDbForTests(); });

  it('keeps the newest 50 unstarred profiles and never trims starred ones', async () => {
    await recordProfile(profile('keep'), 1);
    await updateProfileMeta('keep', { starred: true, name: '  Home  ', tags: ['a', ' A ', 'b'] });
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) await recordProfile(profile(`p${i}`), 10 + i);
    const all = await listProfiles();
    expect(all.filter((item) => !item.starred)).toHaveLength(HISTORY_LIMIT);
    expect(all[0]).toMatchObject({ id: 'keep', starred: true, name: 'Home', tags: ['a', 'b'] });
    expect(await getProfile('p0')).toBeUndefined();
    expect(await getProfile(`p${HISTORY_LIMIT + 4}`)).toBeDefined();
  });

  it('persists responses, prunes the oldest and reports stats', async () => {
    const cache = new DexieResponseCache();
    for (let i = 0; i < 5; i += 1) await cache.set({ key: `k${i}`, source: 'photon', storedAt: i, value: { i } });
    expect((await cache.get('k3'))?.value).toEqual({ i: 3 });
    expect(await pruneResponses(3)).toBe(2);
    expect(await cache.get('k0')).toBeUndefined();
    expect((await responseCacheStats()).bySource.photon).toBe(3);
  });

  it('round-trips settings with validation', async () => {
    expect((await loadSettings()).nominatimEnabled).toBe(false);
    await saveSettings({ nominatimEnabled: true, defaultPostalCountry: 'DE', units: 'metric', choroplethIndicator: 'SP.POP.TOTL' });
    expect(await loadSettings()).toEqual({ nominatimEnabled: true, defaultPostalCountry: 'DE', units: 'metric', choroplethIndicator: 'SP.POP.TOTL' });
  });

  it('normalises tags', () => {
    expect(normalizeTags(['  Coast ', 'coast', '', 'x'.repeat(60)])).toEqual(['Coast', 'x'.repeat(40)]);
    expect(parseTagInput('trip, Work ,trip')).toEqual(['trip', 'Work']);
  });
});
