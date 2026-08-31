const DB_NAME = 'inmotools-regex-matrix';
const STORE_NAME = 'state';
const FALLBACK_PREFIX = 'inmotools_regex_matrix_';

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
});

export const loadRegexMatrixValue = async <T>(key: string): Promise<T | null> => {
  if (typeof indexedDB === 'undefined') {
    try { const raw = localStorage.getItem(`${FALLBACK_PREFIX}${key}`); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
  }
  try {
    const db = await openDb();
    const value = await new Promise<T | undefined>((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key); request.onsuccess = () => resolve(request.result as T | undefined); request.onerror = () => reject(request.error); });
    db.close(); return value ?? null;
  } catch { return null; }
};

export const saveRegexMatrixValue = async <T>(key: string, value: T): Promise<void> => {
  if (typeof indexedDB === 'undefined') { try { localStorage.setItem(`${FALLBACK_PREFIX}${key}`, JSON.stringify(value)); } catch { /* storage can be blocked */ } return; }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => { const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
    db.close();
  } catch { try { localStorage.setItem(`${FALLBACK_PREFIX}${key}`, JSON.stringify(value)); } catch { /* no persistence available */ } }
};
