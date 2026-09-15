/**
 * Local reading-velocity warehouse.
 *
 * Sessions are kept in the browser's own IndexedDB database, one record per
 * session, plus a small rollup per document so the history view does not have to
 * read every session to draw a chart. Nothing is uploaded, and there is no
 * server to upload to: the warehouse is a local file store with the same
 * durability the browser gives IndexedDB.
 *
 * The aggregation functions are pure, so they can be tested without a database
 * and reused by the CSV export.
 */

import type { SessionSummary } from './session-engine';

export const DATABASE_NAME = 'inmotools.sightline.v1';
export const DATABASE_VERSION = 1;
export const SESSION_STORE = 'sessions';
export const DOCUMENT_STORE = 'documents';
export const VOCABULARY_STORE = 'vocabulary';

export interface StoredSession extends SessionSummary {
  /** Words per minute sampled every second, for the velocity chart. */
  readonly series: readonly number[];
  /** Distinct words shown during the session, capped for size. */
  readonly slowWords: readonly { readonly word: string; readonly averageMs: number }[];
}

export interface StoredDocument {
  readonly id: string;
  readonly title: string;
  readonly format: string;
  readonly sessions: number;
  readonly bestWpm: number;
  readonly lastWpm: number;
  readonly wordsRead: number;
  readonly updatedAt: number;
}

export interface VelocityPoint {
  readonly at: number;
  readonly wpm: number;
  readonly sessions: number;
}

/** Group sessions into calendar days and average their rates. */
export const velocityByDay = (sessions: readonly Pick<StoredSession, 'startedAt' | 'averageWpm'>[]): VelocityPoint[] => {
  const buckets = new Map<string, { total: number; count: number; at: number }>();
  for (const session of sessions) {
    const day = new Date(session.startedAt);
    day.setUTCHours(0, 0, 0, 0);
    const key = day.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { total: 0, count: 0, at: day.getTime() };
    bucket.total += session.averageWpm;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({ at: bucket.at, wpm: Math.round(bucket.total / Math.max(1, bucket.count)), sessions: bucket.count }))
    .sort((left, right) => left.at - right.at);
};

/** Average rate for a window of days, ending now. */
export const averageWpmOverDays = (
  sessions: readonly Pick<StoredSession, 'startedAt' | 'averageWpm'>[],
  days: number,
  now = Date.now(),
): number => {
  if (days <= 0) return 0;
  const since = now - days * 86_400_000;
  const window = sessions.filter((session) => session.startedAt >= since);
  if (window.length === 0) return 0;
  return Math.round(window.reduce((total, session) => total + session.averageWpm, 0) / window.length);
};

export interface WarehouseSummary {
  readonly sessions: number;
  readonly totalWords: number;
  readonly totalMs: number;
  readonly averageWpm: number;
  readonly bestWpm: number;
  readonly medianWpm: number;
  readonly documents: number;
  readonly vocabularySize: number;
  readonly streakDays: number;
}

export const summariseWarehouse = (
  sessions: readonly StoredSession[],
  documents: readonly StoredDocument[],
  vocabularySize = 0,
): WarehouseSummary => {
  if (sessions.length === 0) {
    return { sessions: 0, totalWords: 0, totalMs: 0, averageWpm: 0, bestWpm: 0, medianWpm: 0, documents: documents.length, vocabularySize, streakDays: 0 };
  }
  const rates = [...sessions.map((session) => session.averageWpm)].sort((left, right) => left - right);
  const middle = Math.floor(rates.length / 2);
  const median = rates.length % 2 === 0 ? Math.round((rates[middle - 1]! + rates[middle]!) / 2) : rates[middle]!;
  const totalWords = sessions.reduce((total, session) => total + session.tokensRead, 0);
  const totalMs = sessions.reduce((total, session) => total + session.elapsedMs, 0);
  const days = new Set(sessions.map((session) => new Date(session.startedAt).toISOString().slice(0, 10)));
  return {
    sessions: sessions.length,
    totalWords,
    totalMs,
    averageWpm: Math.round(sessions.reduce((total, session) => total + session.averageWpm, 0) / sessions.length),
    bestWpm: rates[rates.length - 1]!,
    medianWpm: median,
    documents: documents.length,
    vocabularySize,
    streakDays: days.size,
  };
};

/** Fold a finished session into its document's rollup record. */
export const mergeDocumentRollup = (
  existing: StoredDocument | undefined,
  session: StoredSession,
): StoredDocument => ({
  id: existing?.id ?? session.id,
  title: session.documentTitle,
  format: session.format,
  sessions: (existing?.sessions ?? 0) + 1,
  bestWpm: Math.max(existing?.bestWpm ?? 0, session.averageWpm),
  lastWpm: session.averageWpm,
  wordsRead: (existing?.wordsRead ?? 0) + session.tokensRead,
  updatedAt: session.finishedAt,
});

/** Rows for the analytics CSV export. */
export const sessionRows = (sessions: readonly StoredSession[]): readonly (readonly (string | number)[])[] => [
  ['startedAt', 'document', 'format', 'wordsRead', 'elapsedMs', 'averageWpm', 'peakWpm', 'pausedMs', 'meanLagWpm'],
  ...sessions.map((session) => [
    new Date(session.startedAt).toISOString(),
    session.documentTitle,
    session.format,
    session.tokensRead,
    session.elapsedMs,
    session.averageWpm,
    session.peakWpm,
    session.pausedMs,
    session.meanLagWpm,
  ]),
];

/**
 * IndexedDB access. The database is opened lazily and every failure is a
 * message rather than an exception: a browser in private mode can refuse to
 * open a database, and reading should not stop because history cannot be saved.
 */
export interface WarehouseResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly message?: string;
}

const isIndexedDbAvailable = (scope: { indexedDB?: IDBFactory }): boolean =>
  typeof scope.indexedDB === 'object' && scope.indexedDB !== null;

export const openWarehouse = (scope: { indexedDB?: IDBFactory }): Promise<WarehouseResult<IDBDatabase>> =>
  new Promise((resolve) => {
    if (!isIndexedDbAvailable(scope)) {
      resolve({ ok: false, message: 'This browser has no local database, so reading history cannot be kept.' });
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = scope.indexedDB!.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      resolve({ ok: false, message: 'The local database could not be opened, so history is off for this session.' });
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        const store = database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt');
        store.createIndex('documentTitle', 'documentTitle');
      }
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        database.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(VOCABULARY_STORE)) {
        const store = database.createObjectStore(VOCABULARY_STORE, { keyPath: 'word' });
        store.createIndex('weight', 'weight');
      }
    };
    request.onsuccess = () => resolve({ ok: true, value: request.result });
    request.onerror = () => resolve({
      ok: false,
      message: request.error?.name === 'SecurityError'
        ? 'The browser blocked the local database, so history is off for this session.'
        : 'The local database could not be opened, so history is off for this session.',
    });
  });

const transaction = <T>(
  database: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => IDBRequest<T>,
): Promise<WarehouseResult<T>> => new Promise((resolve) => {
  let tx: IDBTransaction;
  try {
    tx = database.transaction(storeNames, mode);
  } catch {
    resolve({ ok: false, message: 'The local database rejected the request.' });
    return;
  }
  const request = run(tx);
  request.onsuccess = () => resolve({ ok: true, value: request.result });
  request.onerror = () => resolve({ ok: false, message: request.error?.message ?? 'The local database rejected the request.' });
});

export const putSession = async (database: IDBDatabase, session: StoredSession): Promise<WarehouseResult<IDBValidKey>> =>
  transaction(database, SESSION_STORE, 'readwrite', (tx) => tx.objectStore(SESSION_STORE).put(session));

export const putDocument = async (database: IDBDatabase, document: StoredDocument): Promise<WarehouseResult<IDBValidKey>> =>
  transaction(database, DOCUMENT_STORE, 'readwrite', (tx) => tx.objectStore(DOCUMENT_STORE).put(document));

export const readSession = async (database: IDBDatabase, id: string): Promise<WarehouseResult<StoredSession | undefined>> =>
  transaction<StoredSession | undefined>(database, SESSION_STORE, 'readonly', (tx) => tx.objectStore(SESSION_STORE).get(id) as IDBRequest<StoredSession | undefined>);

export const readDocument = async (database: IDBDatabase, id: string): Promise<WarehouseResult<StoredDocument | undefined>> =>
  transaction<StoredDocument | undefined>(database, DOCUMENT_STORE, 'readonly', (tx) => tx.objectStore(DOCUMENT_STORE).get(id) as IDBRequest<StoredDocument | undefined>);

export const readAllSessions = async (database: IDBDatabase): Promise<WarehouseResult<StoredSession[]>> =>
  transaction<StoredSession[]>(database, SESSION_STORE, 'readonly', (tx) => tx.objectStore(SESSION_STORE).getAll() as IDBRequest<StoredSession[]>);

export const readAllDocuments = async (database: IDBDatabase): Promise<WarehouseResult<StoredDocument[]>> =>
  transaction<StoredDocument[]>(database, DOCUMENT_STORE, 'readonly', (tx) => tx.objectStore(DOCUMENT_STORE).getAll() as IDBRequest<StoredDocument[]>);

export const deleteSession = async (database: IDBDatabase, id: string): Promise<WarehouseResult<undefined>> =>
  transaction<undefined>(database, SESSION_STORE, 'readwrite', (tx) => tx.objectStore(SESSION_STORE).delete(id) as IDBRequest<undefined>);

export const clearWarehouse = async (database: IDBDatabase): Promise<WarehouseResult<undefined>> =>
  transaction<undefined>(database, [SESSION_STORE, DOCUMENT_STORE], 'readwrite', (tx) => {
    tx.objectStore(SESSION_STORE).clear();
    return tx.objectStore(DOCUMENT_STORE).clear() as IDBRequest<undefined>;
  });

/** JSON payload for the analytics export. */
export const analyticsPayload = (
  sessions: readonly StoredSession[],
  documents: readonly StoredDocument[],
): string => JSON.stringify({
  exportedAt: new Date().toISOString(),
  database: DATABASE_NAME,
  summary: summariseWarehouse(sessions, documents),
  velocity: velocityByDay(sessions),
  sessions,
  documents,
}, null, 2);
