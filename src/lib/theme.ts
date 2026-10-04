// Site-wide theme: the visitor's choice (light, dark or follow the system) is
// stored in this browser; the resolved value is set as data-theme on <html>.
// index.html carries a pre-paint copy of readThemeChoice/resolveTheme/applyTheme
// so the first paint already uses the stored theme; tests/unit/theme.test.ts
// runs that copy against this module.

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'inmotools.theme.v1';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/** Browser UI colour per resolved theme; equal to that theme's --paper token. */
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#f6f7f8', dark: '#0e141b' };

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

export function readThemeChoice(storage: Pick<Storage, 'getItem'> | null | undefined): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(value) ? value : DEFAULT_THEME_CHOICE;
  } catch {
    return DEFAULT_THEME_CHOICE;
  }
}

export function writeThemeChoice(storage: Pick<Storage, 'setItem'> | null | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage can be unavailable (private mode, quota); the choice then lasts for this page only.
  }
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

export function applyTheme(doc: Document, resolved: ResolvedTheme): void {
  doc.documentElement.setAttribute('data-theme', resolved);
  doc.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolved);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}
