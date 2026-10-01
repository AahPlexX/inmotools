import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { HttpClient, type SourceHealth } from '../net/http';
import { DEFAULT_SETTINGS, DexieResponseCache, loadSettings, saveSettings, type GeoIntelSettings } from '../net/store';

let sharedClient: HttpClient | null = null;
export function getClient(): HttpClient {
  if (!sharedClient) sharedClient = new HttpClient({ cache: typeof indexedDB === 'undefined' ? undefined : new DexieResponseCache() });
  return sharedClient;
}

export function useSourceHealth(client: HttpClient): SourceHealth[] {
  const [health, setHealth] = useState<SourceHealth[]>(() => client.allHealth());
  useEffect(() => client.subscribe(() => setHealth(client.allHealth())), [client]);
  return health;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
    const list = window.matchMedia(query);
    list.addEventListener('change', notify);
    return () => list.removeEventListener('change', notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => (typeof window !== 'undefined' && !!window.matchMedia?.(query).matches), () => false);
}

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useSettings(): [GeoIntelSettings, (patch: Partial<GeoIntelSettings>) => void] {
  const [settings, setSettings] = useState<GeoIntelSettings>(DEFAULT_SETTINGS);
  const loaded = useRef(false);
  useEffect(() => {
    let alive = true;
    loadSettings().then((value) => { if (alive) { loaded.current = true; setSettings(value); } }).catch(() => { loaded.current = true; });
    return () => { alive = false; };
  }, []);
  const update = useCallback((patch: Partial<GeoIntelSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next).catch(() => undefined);
      return next;
    });
  }, []);
  return [settings, update];
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

/** Long-press (touch/pen) → callback with viewport coordinates. Movement > 8 px cancels. */
export function useLongPress(onLongPress: (x: number, y: number, target: EventTarget | null) => void, delay = 550) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; origin.current = null; };
  return {
    onPointerDown: (event: ReactPointerEvent) => {
      fired.current = false;
      if (event.pointerType === 'mouse') return;
      origin.current = { x: event.clientX, y: event.clientY };
      const target = event.target;
      timer.current = window.setTimeout(() => { fired.current = true; onLongPress(event.clientX, event.clientY, target); clear(); }, delay);
    },
    onPointerMove: (event: ReactPointerEvent) => {
      if (origin.current && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    /** A long-press opens the menu; swallow the click that follows on release. */
    onClickCapture: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
      if (fired.current) { fired.current = false; event.preventDefault(); event.stopPropagation(); }
    },
  };
}

export function saveWithPicker(blob: Blob, filename: string, download: (blob: Blob, name: string) => void): Promise<void> {
  // File System Access API is a progressive enhancement; the anchor download is always available.
  const picker = (window as unknown as { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
  if (!picker) { download(blob, filename); return Promise.resolve(); }
  return picker({ suggestedName: filename })
    .then(async (handle) => { const writable = await handle.createWritable(); await writable.write(blob); await writable.close(); })
    .catch((error: unknown) => { if ((error as Error).name !== 'AbortError') download(blob, filename); });
}

export const supportsSavePicker = () => typeof window !== 'undefined' && 'showSaveFilePicker' in window;
