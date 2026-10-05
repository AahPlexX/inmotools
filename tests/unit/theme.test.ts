import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME_CHOICE,
  readThemeChoice,
  resolveTheme,
  THEME_CHOICES,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  writeThemeChoice,
  type ResolvedTheme,
  type ThemeChoice,
} from '../../src/lib/theme';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const throwingStorage = {
  getItem(): string | null { throw new Error('blocked'); },
  setItem(): void { throw new Error('blocked'); },
};

/** Minimal document: <html> attributes plus the two meta tags the theme updates. */
function fakeDocument() {
  const attributes = new Map<string, string>();
  const meta = new Map<string, Map<string, string>>([
    ['color-scheme', new Map([['content', 'light']])],
    ['theme-color', new Map([['content', '#000000']])],
  ]);
  const element = (store: Map<string, string>) => ({
    setAttribute: (name: string, value: string) => { store.set(name, value); },
    getAttribute: (name: string) => store.get(name) ?? null,
  });
  const doc = {
    documentElement: element(attributes),
    querySelector(selector: string) {
      const name = /meta\[name="([^"]+)"\]/.exec(selector)?.[1];
      const store = name ? meta.get(name) : undefined;
      return store ? element(store) : null;
    },
  };
  return {
    doc,
    theme: () => attributes.get('data-theme'),
    meta: (name: string) => meta.get(name)?.get('content'),
  };
}

describe('theme choice storage', () => {
  it('defaults to light when nothing is stored', () => {
    expect(DEFAULT_THEME_CHOICE).toBe('light');
    expect(readThemeChoice(new MemoryStorage())).toBe('light');
    expect(readThemeChoice(null)).toBe('light');
  });

  it('round-trips every choice under the versioned key', () => {
    for (const choice of THEME_CHOICES) {
      const storage = new MemoryStorage();
      writeThemeChoice(storage, choice);
      expect(storage.values.get(THEME_STORAGE_KEY)).toBe(choice);
      expect(readThemeChoice(storage)).toBe(choice);
    }
    expect(THEME_STORAGE_KEY).toBe('inmotools.theme.v1');
  });

  it('ignores unknown stored values', () => {
    const storage = new MemoryStorage();
    for (const value of ['', 'Dark', 'high-contrast', '"dark"', 'null']) {
      storage.setItem(THEME_STORAGE_KEY, value);
      expect(readThemeChoice(storage)).toBe('light');
    }
  });

  it('survives storage that throws', () => {
    expect(readThemeChoice(throwingStorage)).toBe('light');
    expect(() => writeThemeChoice(throwingStorage, 'dark')).not.toThrow();
  });
});

describe('theme resolution', () => {
  it('uses an explicit choice regardless of the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system setting for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('sets data-theme, color-scheme and theme-color', () => {
    for (const resolved of ['light', 'dark'] as ResolvedTheme[]) {
      const fake = fakeDocument();
      applyTheme(fake.doc as unknown as Document, resolved);
      expect(fake.theme()).toBe(resolved);
      expect(fake.meta('color-scheme')).toBe(resolved);
      expect(fake.meta('theme-color')).toBe(THEME_COLORS[resolved]);
    }
  });

  it('uses each theme\'s --paper token as its theme-color', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const light = /:root \{[^}]*--paper: (#[0-9a-f]{6});/.exec(css)?.[1];
    const dark = /:root\[data-theme="dark"\] \{[^}]*--paper: (#[0-9a-f]{6});/.exec(css)?.[1];
    expect({ light, dark }).toEqual(THEME_COLORS);
  });
});

describe('pre-paint script in index.html', () => {
  const html = readFileSync('index.html', 'utf8');
  const script = /<script id="theme-prepaint">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

  function runPrepaint(stored: string | null, prefersDark: boolean, storageThrows = false) {
    const fake = fakeDocument();
    const window = {
      get localStorage() {
        if (storageThrows) throw new Error('blocked');
        const storage = new MemoryStorage();
        if (stored !== null) storage.setItem(THEME_STORAGE_KEY, stored);
        return storage;
      },
      matchMedia: (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' && prefersDark }),
    };
    new Function('window', 'document', script)(window, fake.doc);
    return fake;
  }

  it('is present in the document head before the app module', () => {
    expect(script).not.toBe('');
    expect(html.indexOf('id="theme-prepaint"')).toBeLessThan(html.indexOf('type="module"'));
    expect(html.indexOf('id="theme-prepaint"')).toBeLessThan(html.indexOf('</head>'));
  });

  it('matches src/lib/theme.ts for every stored value and system setting', () => {
    const storedValues: (string | null)[] = [null, 'junk', ...THEME_CHOICES];
    for (const stored of storedValues) {
      for (const prefersDark of [false, true]) {
        const storage = new MemoryStorage();
        if (stored !== null) storage.setItem(THEME_STORAGE_KEY, stored);
        const expected = resolveTheme(readThemeChoice(storage) as ThemeChoice, prefersDark);
        const fake = runPrepaint(stored, prefersDark);
        expect(fake.theme(), `${stored} / dark=${prefersDark}`).toBe(expected);
        expect(fake.meta('color-scheme')).toBe(expected);
        expect(fake.meta('theme-color')).toBe(THEME_COLORS[expected]);
      }
    }
  });

  it('falls back to light when storage is blocked', () => {
    expect(runPrepaint(null, true, true).theme()).toBe('light');
    expect(runPrepaint(null, false, true).theme()).toBe('light');
  });
});
