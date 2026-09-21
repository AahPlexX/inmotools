/**
 * Trail-gradient text.
 *
 * Colour that changes across a line gives the eye a second positional cue
 * alongside the text itself: the hue at a given point in the line tells the
 * reader where the eye is, which helps the return sweep land on the first word
 * of the next line rather than on a line already read. The gradient is computed
 * per line so every line begins at the same colour, and it is interpolated in
 * OKLCH so the intermediate colours stay perceptually even instead of going
 * muddy in the middle the way naive sRGB blends do.
 *
 * The technique is described generically: no third-party mark is used, and the
 * palette below is defined here.
 */

import { formatHex, interpolate, wcagContrast } from 'culori';

export type GradientDirection = 'horizontal' | 'vertical' | 'word';

export interface GradientPalette {
  readonly id: string;
  readonly label: string;
  /** Two or more hex stops, applied from the start of each line. */
  readonly stops: readonly string[];
  readonly detail: string;
}

/**
 * Palettes with a light start and a dark end, or the reverse, so the gradient
 * carries the same amount of contrast at both ends of a line.
 */
export const GRADIENT_PALETTES: readonly GradientPalette[] = [
  { id: 'horizon', label: 'Horizon', stops: ['#0b64c4', '#123c8a'], detail: 'Blue to deep navy. The most common reading gradient.' },
  { id: 'ember', label: 'Ember', stops: ['#c2410c', '#7c2d12'], detail: 'Orange to brown, for warm paper.' },
  { id: 'forest', label: 'Forest', stops: ['#15803d', '#14532d'], detail: 'Green to deep green, easy on an OLED panel.' },
  { id: 'violet', label: 'Violet', stops: ['#7c3aed', '#4c1d95'], detail: 'Violet to indigo.' },
  { id: 'graphite', label: 'Graphite', stops: ['#334155', '#0f172a'], detail: 'Slate to near black. Low chroma, high legibility.' },
  { id: 'teal', label: 'Teal', stops: ['#0f766e', '#134e4a'], detail: 'Teal to deep teal.' },
  { id: 'rose', label: 'Rose', stops: ['#be123c', '#881337'], detail: 'Rose to maroon.' },
  { id: 'sunrise', label: 'Sunrise', stops: ['#d97706', '#b91c1c'], detail: 'Amber into red.' },
  { id: 'arctic', label: 'Arctic', stops: ['#0ea5e9', '#0e7490'], detail: 'Sky blue into cyan.' },
  { id: 'mono', label: 'Monochrome', stops: ['#475569', '#1e293b'], detail: 'Two greys. No hue information at all.' },
  { id: 'duotone', label: 'Duotone', stops: ['#2563eb', '#7c3aed', '#b91c1c'], detail: 'Three stops, for readers who want a wider sweep.' },
  { id: 'high-contrast', label: 'High contrast', stops: ['#1d4ed8', '#000000'], detail: 'Maximum contrast between the ends of a line.' },
  // Light palettes, for the dark themes: a dark gradient on a black surface has
  // no contrast to spend, so the stops run from bright to mid instead.
  { id: 'moonlight', label: 'Moonlight', stops: ['#e2e8f0', '#94a3b8'], detail: 'Near white into grey, for black backgrounds.' },
  { id: 'sky-light', label: 'Sky light', stops: ['#bae6fd', '#38bdf8'], detail: 'Pale blue into sky blue.' },
  { id: 'sand-light', label: 'Sand light', stops: ['#fde68a', '#f59e0b'], detail: 'Pale amber into amber.' },
  { id: 'mint-light', label: 'Mint light', stops: ['#bbf7d0', '#34d399'], detail: 'Pale green into emerald.' },
  { id: 'lilac-light', label: 'Lilac light', stops: ['#e9d5ff', '#a78bfa'], detail: 'Pale violet into violet.' },
  { id: 'rose-light', label: 'Rose light', stops: ['#fecdd3', '#fb7185'], detail: 'Pale rose into rose.' },
];

export const paletteById = (id: string): GradientPalette =>
  GRADIENT_PALETTES.find((palette) => palette.id === id) ?? GRADIENT_PALETTES[0]!;

export interface GradientOptions {
  readonly direction: GradientDirection;
  /** 0 turns the gradient off; 1 is the full stop-to-stop range. */
  readonly intensity: number;
  /** Adds a light wash behind the text to soften the transition. */
  readonly wash: boolean;
}

export const DEFAULT_GRADIENT: GradientOptions = { direction: 'horizontal', intensity: 1, wash: false };

/** Interpolate a palette at a fraction between 0 and 1, in OKLCH. */
export const samplePalette = (palette: GradientPalette, fraction: number): string => {
  const stops = palette.stops.length > 0 ? palette.stops : ['#1e293b'];
  const clamped = Math.min(1, Math.max(0, fraction));
  if (stops.length === 1) return formatHex(stops[0]!) ?? stops[0]!;
  const scaled = clamped * (stops.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(stops.length - 1, lower + 1);
  const local = scaled - lower;
  const interpolator = interpolate([stops[lower]!, stops[upper]!], 'oklch');
  const mixed = interpolator(local);
  return formatHex(mixed) ?? stops[lower]!;
};

/**
 * Colours for each word of a line. The first word gets the palette's first
 * colour and the last word its last colour, whatever the line's length, so a
 * line always reads as a complete sweep.
 */
export const gradientStopsForLine = (
  wordCount: number,
  palette: GradientPalette,
  options: GradientOptions = DEFAULT_GRADIENT,
): string[] => {
  const count = Math.max(0, Math.round(wordCount));
  if (count === 0) return [];
  const intensity = Math.min(1, Math.max(0, options.intensity));
  return Array.from({ length: count }, (_, index) => {
    const fraction = count === 1 ? 0 : index / (count - 1);
    return samplePalette(palette, fraction * intensity);
  });
};

export interface GradientLine {
  readonly text: string;
  readonly color: string;
}

/** Split a line into per-word colour units, preserving the spacing between them. */
export const gradientLine = (
  line: string,
  palette: GradientPalette,
  options: GradientOptions = DEFAULT_GRADIENT,
): GradientLine[] => {
  const words = line.split(/(\s+)/).filter((part) => part.length > 0);
  const wordCount = words.filter((part) => !/^\s+$/.test(part)).length;
  const colors = gradientStopsForLine(wordCount, palette, options);
  let wordIndex = 0;
  return words.map((part) => {
    if (/^\s+$/.test(part)) return { text: part, color: colors[Math.min(wordIndex, colors.length - 1)] ?? '#1e293b' };
    const color = colors[wordIndex] ?? '#1e293b';
    wordIndex += 1;
    return { text: part, color };
  });
};

/** A CSS background gradient that matches the per-word colours of a line. */
export const gradientCss = (palette: GradientPalette, options: GradientOptions = DEFAULT_GRADIENT): string => {
  const angle = options.direction === 'vertical' ? '180deg' : '90deg';
  const stops = palette.stops.join(', ');
  const backdrop = options.wash ? `, linear-gradient(90deg, ${palette.stops[0]}1a, ${palette.stops[palette.stops.length - 1]!}1a)` : '';
  return `linear-gradient(${angle}, ${stops})${backdrop}`;
};

/** HTML for a gradient line: one span per word, coloured from the palette. */
export const gradientLineHtml = (
  line: string,
  palette: GradientPalette,
  options: GradientOptions = DEFAULT_GRADIENT,
): string => gradientLine(line, palette, options)
  .map((part) => (/^\s+$/.test(part.text)
    ? part.text
    : `<span style="color:${part.color}">${part.text.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character] ?? character))}</span>`))
  .join('');

export interface GradientContrastReport {
  readonly background: string;
  readonly worstStop: string;
  readonly ratio: number;
  readonly passes: boolean;
}

/**
 * Check every palette stop against the background. Gradient text is a
 * decorative aid, not a licence to drop below the contrast a reader needs.
 */
export const checkGradientContrast = (
  palette: GradientPalette,
  background: string,
  minimumRatio = 4.5,
): GradientContrastReport => {
  let worstStop = palette.stops[0] ?? '#000000';
  let worstRatio = Number.POSITIVE_INFINITY;
  for (const stop of palette.stops) {
    const ratio = wcagContrast(stop, background) ?? 1;
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worstStop = stop;
    }
  }
  if (!Number.isFinite(worstRatio)) worstRatio = 1;
  return {
    background,
    worstStop,
    ratio: Math.round(worstRatio * 100) / 100,
    passes: worstRatio >= minimumRatio,
  };
};

/** Palettes that hold the given contrast against a background, best first. */
export const palettesForBackground = (background: string, minimumRatio = 4.5): GradientPalette[] =>
  GRADIENT_PALETTES
    .map((palette) => ({ palette, report: checkGradientContrast(palette, background, minimumRatio) }))
    .filter((entry) => entry.report.passes)
    .sort((left, right) => right.report.ratio - left.report.ratio)
    .map((entry) => entry.palette);
