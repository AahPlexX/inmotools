import type { AetherCastSettings } from './aethercast-types';

const STORAGE_KEY = 'inmotools.aethercast.v1';

interface AetherCastPersistedState {
  version: 1;
  settings: AetherCastSettings;
}

export function defaultSettings(): AetherCastSettings {
  return { activeStandard: 'US_EPA', skinType: 2, vulnerabilityLens: 'NONE', unitSystem: 'US' };
}

export function readSettings(storage?: Pick<Storage, 'getItem'>): AetherCastSettings {
  try {
    const source = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    const raw = source?.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<AetherCastPersistedState>;
    if (parsed.version !== 1 || !parsed.settings) return defaultSettings();
    return { ...defaultSettings(), ...parsed.settings };
  } catch {
    return defaultSettings();
  }
}

export function writeSettings(settings: AetherCastSettings, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    target?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings } satisfies AetherCastPersistedState));
  } catch {
    // localStorage may be unavailable (private browsing quota); settings simply will not persist.
  }
}
