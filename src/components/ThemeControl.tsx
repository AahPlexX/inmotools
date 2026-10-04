import { useEffect, useState } from 'react';
import {
  applyTheme,
  DARK_SCHEME_QUERY,
  isThemeChoice,
  readThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemeChoice,
  type ThemeChoice,
} from '../lib/theme';

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_SCHEME_QUERY).matches;
}

export function useSiteTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice(safeStorage()));
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DARK_SCHEME_QUERY);
    const onChange = () => setPrefersDark(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // Another tab changed the choice.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      setChoice(isThemeChoice(event.newValue) ? event.newValue : readThemeChoice(safeStorage()));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const resolved = resolveTheme(choice, prefersDark);
  useEffect(() => { applyTheme(document, resolved); }, [resolved]);

  const select = (next: ThemeChoice) => {
    setChoice(next);
    writeThemeChoice(safeStorage(), next);
  };

  return { choice, resolved, select };
}

export function ThemeControl() {
  const { choice, resolved, select } = useSiteTheme();
  return (
    <fieldset className="theme-control" data-testid="theme-control" data-resolved-theme={resolved}>
      <legend className="visually-hidden">Site theme</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className="theme-control-option">
          <input
            type="radio"
            name="site-theme"
            value={option.value}
            checked={choice === option.value}
            onChange={() => select(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
