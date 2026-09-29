// Resilient, polite fetch layer shared by every adapter:
//   · TTL cache (IndexedDB via ResponseCache) checked before any request
//   · in-flight de-duplication by URL
//   · per-source throttle gate (serialised; Nominatim ≥ 1.1 s apart)
//   · per-attempt timeout via AbortController
//   · exponential backoff with jitter on network errors, 429 and 5xx (Retry-After honoured)
//   · circuit breaker per source (open after N consecutive failures, half-open after cooldown)
//   · stale-cache fallback when offline, when the breaker is open, or after final failure

import type { SourceId } from '../core/types';

export interface SourcePolicy {
  minIntervalMs: number;
  timeoutMs: number;
  retries: number;
  breakerThreshold: number;
  breakerCooldownMs: number;
}

const DEFAULT_POLICY: SourcePolicy = { minIntervalMs: 250, timeoutMs: 10_000, retries: 2, breakerThreshold: 4, breakerCooldownMs: 60_000 };

export const SOURCE_POLICIES: Partial<Record<SourceId, Partial<SourcePolicy>>> = {
  nominatim: { minIntervalMs: 1_100, retries: 0, timeoutMs: 12_000 },
  photon: { minIntervalMs: 1_000, retries: 1 },
  bigdatacloud: { minIntervalMs: 1_000, retries: 1 },
  zippopotam: { minIntervalMs: 1_000 },
  'postcodes-io': { minIntervalMs: 250 },
  'open-elevation': { minIntervalMs: 1_000, retries: 0 },
  geoboundaries: { timeoutMs: 30_000, retries: 1 },
  eurostat: { timeoutMs: 20_000 },
  'world-bank': { timeoutMs: 15_000 },
};

export const policyFor = (source: SourceId): SourcePolicy => ({ ...DEFAULT_POLICY, ...SOURCE_POLICIES[source] });

export interface CachedEntry {
  key: string;
  source: SourceId;
  storedAt: number;
  value: unknown;
}

export interface ResponseCache {
  get(key: string): Promise<CachedEntry | undefined>;
  set(entry: CachedEntry): Promise<void>;
}

export class MemoryCache implements ResponseCache {
  readonly entries = new Map<string, CachedEntry>();
  async get(key: string) { return this.entries.get(key); }
  async set(entry: CachedEntry) { this.entries.set(entry.key, entry); }
}

export type BreakerState = 'closed' | 'open' | 'half-open';

export class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly source: SourceId) { super(message); this.name = 'HttpError'; }
}
export class NotFoundError extends HttpError {
  constructor(source: SourceId, url: string) { super(`No record at ${url}`, 404, source); this.name = 'NotFoundError'; }
}
export class CircuitOpenError extends Error {
  constructor(readonly source: SourceId, readonly retryAt: number) { super(`${source} is paused after repeated failures`); this.name = 'CircuitOpenError'; }
}
export class OfflineError extends Error {
  constructor(readonly source: SourceId) { super('You are offline and this request is not cached yet'); this.name = 'OfflineError'; }
}

export interface FetchResult<T> {
  data: T;
  fromCache: boolean;
  stale: boolean;
  /** ISO instant the response was originally received. */
  retrievedAt: string;
}

export interface RequestOptions {
  source: SourceId;
  ttlMs: number;
  parse?: 'json' | 'arrayBuffer';
  signal?: AbortSignal;
  /** Cache key override (defaults to the URL). */
  cacheKey?: string;
}

export interface SourceHealth {
  source: SourceId;
  state: BreakerState;
  consecutiveFailures: number;
  lastError: string | null;
  retryAt: number | null;
  requests: number;
  cacheHits: number;
}

interface HttpDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  isOnline?: () => boolean;
  cache?: ResponseCache;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly isOnline: () => boolean;
  readonly cache: ResponseCache;
  private readonly inflight = new Map<string, Promise<FetchResult<unknown>>>();
  private readonly gates = new Map<SourceId, Promise<void>>();
  private readonly lastStart = new Map<SourceId, number>();
  private readonly health = new Map<SourceId, SourceHealth>();
  private readonly listeners = new Set<() => void>();

  constructor(deps: HttpDeps = {}) {
    this.fetchImpl = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? defaultSleep;
    this.random = deps.random ?? Math.random;
    this.isOnline = deps.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
    this.cache = deps.cache ?? new MemoryCache();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  healthOf(source: SourceId): SourceHealth {
    let entry = this.health.get(source);
    if (!entry) {
      entry = { source, state: 'closed', consecutiveFailures: 0, lastError: null, retryAt: null, requests: 0, cacheHits: 0 };
      this.health.set(source, entry);
    }
    if (entry.state === 'open' && entry.retryAt !== null && this.now() >= entry.retryAt) entry.state = 'half-open';
    return entry;
  }

  allHealth(): SourceHealth[] {
    return [...this.health.keys()].map((source) => ({ ...this.healthOf(source) }));
  }

  resetBreaker(source: SourceId): void {
    this.health.set(source, { ...this.healthOf(source), state: 'closed', consecutiveFailures: 0, retryAt: null, lastError: null });
    this.emit();
  }

  private emit() { for (const listener of this.listeners) listener(); }

  async get<T>(url: string, options: RequestOptions): Promise<FetchResult<T>> {
    const key = options.cacheKey ?? url;
    const cached = await this.cache.get(key).catch(() => undefined);
    const health = this.healthOf(options.source);
    if (cached && this.now() - cached.storedAt < options.ttlMs) {
      health.cacheHits += 1;
      this.emit();
      return { data: cached.value as T, fromCache: true, stale: false, retrievedAt: new Date(cached.storedAt).toISOString() };
    }
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<FetchResult<T>>;
    const task = this.fetchWithFallback<T>(url, key, options, cached).finally(() => { this.inflight.delete(key); });
    this.inflight.set(key, task as Promise<FetchResult<unknown>>);
    return task;
  }

  private staleResult<T>(cached: CachedEntry): FetchResult<T> {
    return { data: cached.value as T, fromCache: true, stale: true, retrievedAt: new Date(cached.storedAt).toISOString() };
  }

  private async fetchWithFallback<T>(url: string, key: string, options: RequestOptions, cached: CachedEntry | undefined): Promise<FetchResult<T>> {
    const { source } = options;
    const health = this.healthOf(source);
    if (!this.isOnline()) {
      if (cached) return this.staleResult<T>(cached);
      throw new OfflineError(source);
    }
    if (health.state === 'open') {
      if (cached) return this.staleResult<T>(cached);
      throw new CircuitOpenError(source, health.retryAt ?? this.now());
    }
    try {
      const data = await this.fetchWithRetry<T>(url, options);
      const storedAt = this.now();
      await this.cache.set({ key, source, storedAt, value: data }).catch(() => undefined);
      health.state = 'closed';
      health.consecutiveFailures = 0;
      health.lastError = null;
      health.retryAt = null;
      this.emit();
      return { data, fromCache: false, stale: false, retrievedAt: new Date(storedAt).toISOString() };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && options.signal?.aborted) throw error;
      if (!(error instanceof HttpError) || error.status === 0 || error.status === 429 || error.status >= 500) {
        health.consecutiveFailures += 1;
        health.lastError = (error as Error).message;
        const policy = policyFor(source);
        if (health.state === 'half-open' || health.consecutiveFailures >= policy.breakerThreshold) {
          health.state = 'open';
          health.retryAt = this.now() + policy.breakerCooldownMs;
        }
        this.emit();
      }
      if (cached && !(error instanceof NotFoundError)) return this.staleResult<T>(cached);
      throw error;
    }
  }

  private async gate(source: SourceId, minIntervalMs: number): Promise<void> {
    const previous = this.gates.get(source) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    this.gates.set(source, previous.then(() => next));
    await previous;
    const wait = (this.lastStart.get(source) ?? -Infinity) + minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStart.set(source, this.now());
    release();
  }

  private async fetchWithRetry<T>(url: string, options: RequestOptions): Promise<T> {
    const policy = policyFor(options.source);
    let attempt = 0;
    for (;;) {
      await this.gate(options.source, policy.minIntervalMs);
      this.healthOf(options.source).requests += 1;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
      let retryAfterMs: number | null = null;
      try {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const response = await this.fetchImpl(url, { signal: controller.signal, headers: { Accept: options.parse === 'arrayBuffer' ? '*/*' : 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' });
        if (response.status === 404) throw new NotFoundError(options.source, url);
        if (response.status === 204) return null as T;
        if (!response.ok) {
          const header = response.headers.get('Retry-After');
          if (header && /^\d+$/.test(header)) retryAfterMs = Math.min(10_000, Number(header) * 1000);
          throw new HttpError(`${options.source} responded ${response.status}`, response.status, options.source);
        }
        return (options.parse === 'arrayBuffer' ? await response.arrayBuffer() : await response.json()) as T;
      } catch (error) {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const retriable = !(error instanceof HttpError) || error.status === 429 || error.status >= 500;
        if (!retriable || attempt >= policy.retries) {
          if (error instanceof DOMException && error.name === 'AbortError') throw new HttpError(`${options.source} timed out after ${policy.timeoutMs / 1000} s`, 0, options.source);
          throw error;
        }
        const backoff = retryAfterMs ?? Math.min(8_000, 500 * 2 ** attempt) * (0.75 + this.random() * 0.5);
        attempt += 1;
        await this.sleep(backoff);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      }
    }
  }
}

export const TTL = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
} as const;
