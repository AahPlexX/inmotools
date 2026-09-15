/**
 * Themes, fonts, focus markers, and accessibility settings.
 *
 * Everything a reader can change about how the tool looks lives in one table so
 * the reader, the exports, and the tests agree on what each option means. Every
 * theme carries a foreground and a background colour, and the contrast between
 * them is checked rather than assumed.
 *
 * Fonts are chosen from families that ship with this site or with the reader's
 * own system: no request leaves the browser to fetch a typeface, which is also
 * what keeps the reading surface identical when the machine is offline.
 */

import { wcagContrast } from 'culori';

export interface ReaderTheme {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly background: string;
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  /** True for themes meant for very low light. */
  readonly dark: boolean;
  /** True for themes that keep a paper-like tint. */
  readonly paper?: boolean;
}

export const READER_THEMES: readonly ReaderTheme[] = [
  { id: 'parchment', label: 'Parchment', detail: 'The default light reading surface.', background: '#fbf7ef', surface: '#ffffff', text: '#1f2937', muted: '#6b7280', accent: '#1d4ed8', dark: false, paper: true },
  { id: 'paper', label: 'Paper', detail: 'Plain white with near-black text.', background: '#ffffff', surface: '#ffffff', text: '#111827', muted: '#4b5563', accent: '#1d4ed8', dark: false, paper: true },
  { id: 'sepia', label: 'Sepia', detail: 'Warm paper tone, gentler than white in bright rooms.', background: '#f4ecd8', surface: '#fbf3e4', text: '#3f3427', muted: '#6a5a45', accent: '#8a5a1c', dark: false, paper: true },
  { id: 'solarized-light', label: 'Solarized Light', detail: 'Low-contrast light palette designed for long sessions.', background: '#fdf6e3', surface: '#fef9ee', text: '#073642', muted: '#586e75', accent: '#1f6fb0', dark: false, paper: true },
  { id: 'solarized-dark', label: 'Solarized Dark', detail: 'The matching dark palette.', background: '#002b36', surface: '#073642', text: '#93a1a1', muted: '#8ba1a6', accent: '#b58900', dark: true },
  { id: 'nord', label: 'Nord', detail: 'Cool blue-grey dark palette.', background: '#2e3440', surface: '#3b4252', text: '#e5e9f0', muted: '#a8b2c1', accent: '#88c0d0', dark: true },
  { id: 'gruvbox', label: 'Gruvbox', detail: 'Warm dark palette with amber highlights.', background: '#282828', surface: '#3c3836', text: '#ebdbb2', muted: '#bdae93', accent: '#d79921', dark: true },
  { id: 'oled', label: 'OLED True Black', detail: 'Pure black background; the panel draws no light for it.', background: '#000000', surface: '#0a0a0a', text: '#e8e8e8', muted: '#9ca3af', accent: '#60a5fa', dark: true },
  { id: 'night', label: 'Night Blue', detail: 'Dark blue surface, easier at dusk than pure black.', background: '#0b1220', surface: '#111a2c', text: '#dbe4f0', muted: '#93a3ba', accent: '#7aa2f7', dark: true },
  { id: 'slate', label: 'Slate', detail: 'Neutral dark grey.', background: '#1f2429', surface: '#2a3138', text: '#e6e9ec', muted: '#a3adb8', accent: '#5eead4', dark: true },
  { id: 'high-contrast', label: 'High Contrast', detail: 'Pure black on pure white, heavy borders.', background: '#ffffff', surface: '#ffffff', text: '#000000', muted: '#1f1f1f', accent: '#0000cc', dark: false },
  { id: 'high-contrast-dark', label: 'High Contrast Dark', detail: 'Pure white on pure black.', background: '#000000', surface: '#000000', text: '#ffffff', muted: '#e5e5e5', accent: '#ffe14d', dark: true },
  { id: 'mint', label: 'Mint', detail: 'A light green tint, calm for long reads.', background: '#eef7f0', surface: '#f7fdf9', text: '#17362a', muted: '#4d6b5d', accent: '#0f766e', dark: false },
  { id: 'lavender', label: 'Lavender', detail: 'A soft violet tint.', background: '#f4f1fb', surface: '#fbfaff', text: '#2b2543', muted: '#5f5877', accent: '#6d28d9', dark: false },
  { id: 'sand-dark', label: 'Sand', detail: 'Dark warm sand, for readers who dislike both white and black.', background: '#241f19', surface: '#312a22', text: '#efe4d3', muted: '#b8a992', accent: '#e0a458', dark: true },
  { id: 'rose-dusk', label: 'Rose Dusk', detail: 'A dark theme with a rose tint.', background: '#1f1518', surface: '#2b1d21', text: '#f3e3e8', muted: '#c3a2ac', accent: '#fb7185', dark: true },
  { id: 'forest-night', label: 'Forest Night', detail: 'Deep green dark theme.', background: '#0f1a14', surface: '#16241c', text: '#dcecdf', muted: '#9cb3a2', accent: '#4ade80', dark: true },
  { id: 'cobalt', label: 'Cobalt', detail: 'High-chroma blue dark theme.', background: '#0a1128', surface: '#131c3a', text: '#dce6ff', muted: '#94a6d4', accent: '#38bdf8', dark: true },
];

export const themeById = (id: string): ReaderTheme =>
  READER_THEMES.find((theme) => theme.id === id) ?? READER_THEMES[0]!;

export interface FontChoice {
  readonly id: string;
  readonly label: string;
  readonly stack: string;
  readonly detail: string;
  /** Recommended for readers with dyslexia or low vision. */
  readonly accessibility?: boolean;
  readonly monospace?: boolean;
  readonly serif?: boolean;
}

/**
 * Only two of these families are not guaranteed to be present on a desktop
 * system: OpenDyslexic and Atkinson Hyperlegible. Both are shipped with the
 * site as local font files, so the list needs no network request at read time.
 */
export const FONT_CHOICES: readonly FontChoice[] = [
  { id: 'system', label: 'System UI', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', detail: 'The reader\'s own interface font.' },
  { id: 'opendyslexic', label: 'OpenDyslexic', stack: 'OpenDyslexic, "Comic Sans MS", Verdana, sans-serif', detail: 'Weighted letterforms that reduce letter rotation for readers with dyslexia.', accessibility: true },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', stack: '"Atkinson Hyperlegible", Verdana, sans-serif', detail: 'Designed at the Braille Institute to keep similar letters distinguishable.', accessibility: true },
  { id: 'lexend', label: 'Lexend Deca', stack: '"Lexend Deca", "Segoe UI", sans-serif', detail: 'Designed to reduce visual stress during reading.', accessibility: true },
  { id: 'inter', label: 'Inter', stack: 'Inter, "Segoe UI", Arial, sans-serif', detail: 'A neutral interface sans with tall x-height.' },
  { id: 'jetbrains', label: 'JetBrains Mono', stack: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace', detail: 'Fixed width; useful for technical text and for readers who lose their place.', monospace: true },
  { id: 'merriweather', label: 'Merriweather', stack: 'Merriweather, Georgia, "Times New Roman", serif', detail: 'A serif with generous spacing for long-form reading.', serif: true },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, "Times New Roman", serif', detail: 'A familiar serif that is present on almost every system.', serif: true, accessibility: true },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif', detail: 'Wide letterforms with open counters.', accessibility: true },
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Verdana, sans-serif', detail: 'A compact sans with clear spacing.' },
  { id: 'comic', label: 'Comic Sans', stack: '"Comic Sans MS", "Comic Neue", cursive', detail: 'Irregular letterforms that some readers with dyslexia find easier.' },
  { id: 'times', label: 'Times New Roman', stack: '"Times New Roman", Times, serif', detail: 'The classic serif, for readers who prefer it.', serif: true },
];

export const fontById = (id: string): FontChoice =>
  FONT_CHOICES.find((font) => font.id === id) ?? FONT_CHOICES[0]!;

export type FocalMarker = 'none' | 'crosshair' | 'reticle' | 'brackets' | 'dot' | 'box';

export interface FocusMarkerOption {
  readonly id: FocalMarker;
  readonly label: string;
  readonly detail: string;
}

export const FOCAL_MARKERS: readonly FocusMarkerOption[] = [
  { id: 'none', label: 'None', detail: 'Words only.' },
  { id: 'crosshair', label: 'Crosshair', detail: 'Thin lines through the anchor position.' },
  { id: 'reticle', label: 'Reticle', detail: 'Gap lines with tick marks, like a sight.' },
  { id: 'brackets', label: 'Brackets', detail: 'Angled brackets either side of the word.' },
  { id: 'dot', label: 'Anchor dot', detail: 'A single small dot above the anchor letter.' },
  { id: 'box', label: 'Focus box', detail: 'A soft rectangle around the reading area.' },
];

export type AnchorAccent = 'accent' | 'ember' | 'gold' | 'crimson' | 'sky' | 'violet' | 'lime';

export const ANCHOR_ACCENTS: readonly { id: AnchorAccent; label: string; color: string }[] = [
  { id: 'accent', label: 'Theme accent', color: 'var(--sightline-accent)' },
  { id: 'ember', label: 'Ember', color: '#ef4444' },
  { id: 'gold', label: 'Gold', color: '#eab308' },
  { id: 'crimson', label: 'Crimson', color: '#be123c' },
  { id: 'sky', label: 'Sky', color: '#0ea5e9' },
  { id: 'violet', label: 'Violet', color: '#8b5cf6' },
  { id: 'lime', label: 'Lime', color: '#65a30d' },
];

export interface ReaderAppearance {
  readonly theme: string;
  readonly font: string;
  readonly fontScale: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly wordSpacing: number;
  readonly focalMarker: FocalMarker;
  readonly anchorAccent: AnchorAccent;
  readonly reduceMotion: boolean;
  readonly dyslexiaSpacing: boolean;
  readonly highlightCurrentWord: boolean;
}

export const DEFAULT_APPEARANCE: ReaderAppearance = {
  theme: 'parchment',
  font: 'atkinson',
  fontScale: 1,
  lineHeight: 1.7,
  letterSpacing: 0,
  wordSpacing: 0,
  focalMarker: 'crosshair',
  anchorAccent: 'accent',
  reduceMotion: false,
  dyslexiaSpacing: false,
  highlightCurrentWord: true,
};

export const DEFAULT_FOCAL_MARKER: FocalMarker = DEFAULT_APPEARANCE.focalMarker;

/** Font size offered to the reading surface, in pixels. */
export const fontSizePx = (appearance: ReaderAppearance, base = 20): number =>
  Math.round(base * Math.min(3, Math.max(0.7, appearance.fontScale)));

/**
 * Letter and word spacing suggested for dyslexic readers. The values follow the
 * common guidance in accessibility practice: a little extra tracking and a
 * noticeably wider space between words.
 */
export const applyDyslexiaSpacing = (appearance: ReaderAppearance): ReaderAppearance =>
  appearance.dyslexiaSpacing
    ? { ...appearance, letterSpacing: Math.max(appearance.letterSpacing, 0.035), wordSpacing: Math.max(appearance.wordSpacing, 0.16) }
    : appearance;

export interface ContrastVerdict {
  readonly ratio: number;
  readonly level: 'AAA' | 'AA' | 'AA-large' | 'fail';
  readonly passes: boolean;
}

/** WCAG 2 contrast verdict for the theme's text against its background. */
export const themeContrast = (theme: ReaderTheme): ContrastVerdict => {
  const ratio = wcagContrast(theme.text, theme.background) ?? 1;
  const rounded = Math.round(ratio * 100) / 100;
  if (rounded >= 7) return { ratio: rounded, level: 'AAA', passes: true };
  if (rounded >= 4.5) return { ratio: rounded, level: 'AA', passes: true };
  if (rounded >= 3) return { ratio: rounded, level: 'AA-large', passes: true };
  return { ratio: rounded, level: 'fail', passes: false };
};

/** Every theme that meets the requested contrast, for the accessibility panel. */
export const accessibleThemes = (minimumRatio = 4.5): ReaderTheme[] =>
  READER_THEMES.filter((theme) => (wcagContrast(theme.text, theme.background) ?? 1) >= minimumRatio);

export const backgroundOf = (appearance: ReaderAppearance): string => themeById(appearance.theme).background;

/** CSS custom properties for a themed reading surface. */
export const themeVariables = (appearance: ReaderAppearance): Record<string, string> => {
  const theme = themeById(appearance.theme);
  const font = fontById(appearance.font);
  const spaced = applyDyslexiaSpacing(appearance);
  return {
    '--sightline-background': theme.background,
    '--sightline-surface': theme.surface,
    '--sightline-text': theme.text,
    '--sightline-muted': theme.muted,
    '--sightline-accent': theme.accent,
    '--sightline-font': font.stack,
    '--sightline-font-size': `${fontSizePx(appearance)}px`,
    '--sightline-line-height': String(Math.min(3, Math.max(1.2, appearance.lineHeight))),
    '--sightline-letter-spacing': `${spaced.letterSpacing}em`,
    '--sightline-word-spacing': `${spaced.wordSpacing}em`,
  };
};
