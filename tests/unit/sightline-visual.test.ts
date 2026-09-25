import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMPHASIS,
  EMPHASIS_LEVELS,
  emphasisForLevel,
  emphasisHtml,
  emphasisRestOpacity,
  emphasisWeight,
  emphasiseTokens,
  splitEmphasis,
} from '../../src/tools/sightline/typography-engine';
import {
  GRADIENT_PALETTES,
  checkGradientContrast,
  gradientLine,
  gradientLineHtml,
  gradientStopsForLine,
  paletteById,
  palettesForBackground,
  samplePalette,
} from '../../src/tools/sightline/gradient-engine';
import {
  DEFAULT_APPEARANCE,
  FOCAL_MARKERS,
  FONT_CHOICES,
  READER_THEMES,
  accessibleThemes,
  applyDyslexiaSpacing,
  fontById,
  fontSizePx,
  themeById,
  themeContrast,
  themeVariables,
} from '../../src/tools/sightline/palette-engine';
import {
  buildPeripheralSlides,
  buildColumnLayout,
  columnEccentricityDegrees,
  columnFontSize,
  peripheralAdvice,
} from '../../src/tools/sightline/peripheral-engine';

describe('fixation-weight typography', () => {
  it('takes the configured fraction of a word as the heavy segment', () => {
    expect(splitEmphasis('reading', DEFAULT_EMPHASIS)).toEqual({ lead: '', strong: 'rea', rest: 'ding' });
    expect(splitEmphasis('a', DEFAULT_EMPHASIS)).toEqual({ lead: '', strong: 'a', rest: '' });
    expect(splitEmphasis('in', DEFAULT_EMPHASIS)).toEqual({ lead: '', strong: 'in', rest: '' });
  });

  it('never puts punctuation in the heavy segment', () => {
    expect(splitEmphasis('"reading"', DEFAULT_EMPHASIS)).toEqual({ lead: '"', strong: 'rea', rest: 'ding"' });
    expect(splitEmphasis('end.', { level: 5, fraction: 0.9, maxLetters: 8, minLetters: 1 }).strong).toBe('end');
  });

  it('emphasises more letters at higher levels', () => {
    const light = splitEmphasis('consideration', emphasisForLevel(1)).strong.length;
    const strong = splitEmphasis('consideration', emphasisForLevel(5)).strong.length;
    expect(strong).toBeGreaterThan(light);
  });

  it('keeps the whole word intact across the split', () => {
    for (const word of ['reading', 'consideration', 'a', '"quoted"', 'state-of-the-art']) {
      const parts = splitEmphasis(word, DEFAULT_EMPHASIS);
      expect(`${parts.lead}${parts.strong}${parts.rest}`).toBe(word);
      expect(parts.strong.length).toBeGreaterThan(0);
    }
  });

  it('keeps every letter of a hyphenated word accounted for', () => {
    const parts = splitEmphasis('well-being', emphasisForLevel(3));
    expect(parts.strong.length).toBeGreaterThan(0);
    expect(parts.rest.length).toBeGreaterThan(0);
  });

  it('renders segments with the heavy part wrapped in a bold tag', () => {
    const html = emphasisHtml([{ text: 'reading' }, { text: 'matters' }]);
    expect(html).toBe('<b>rea</b>ding <b>mat</b>ters');
  });

  it('escapes markup in the words it renders', () => {
    expect(emphasisHtml([{ text: '<script>' }])).not.toContain('<script>');
  });

  it('keeps punctuation and spaces unstressed', () => {
    const segments = emphasiseTokens([{ text: 'reading,' }, { text: 'then' }]);
    expect(segments.filter((segment) => segment.strong).map((segment) => segment.text)).toEqual(['rea', 'th']);
    expect(segments).toEqual([
      { text: 'rea', strong: true },
      { text: 'ding,', strong: false },
      { text: ' ', strong: false },
      { text: 'th', strong: true },
      { text: 'en', strong: false },
    ]);
    expect(segments.map((segment) => segment.text).join('')).toBe('reading, then');
  });

  it('publishes a weight and rest opacity for each level', () => {
    expect(emphasisWeight(1)).toBe(500);
    expect(emphasisWeight(5)).toBe(900);
    expect(emphasisRestOpacity(5)).toBeLessThan(emphasisRestOpacity(1));
    expect(EMPHASIS_LEVELS).toHaveLength(5);
  });
});

describe('trail-gradient text', () => {
  it('starts and ends a line on the palette stops', () => {
    const palette = paletteById('horizon');
    const stops = gradientStopsForLine(4, palette);
    expect(stops).toHaveLength(4);
    expect(stops[0]).toBe(samplePalette(palette, 0));
    expect(stops[3]).toBe(samplePalette(palette, 1));
  });

  it('interpolates in a perceptual space rather than blending raw channels', () => {
    const middle = samplePalette(paletteById('horizon'), 0.5);
    expect(middle).toMatch(/^#[0-9a-f]{6}$/);
    expect(middle.toLowerCase()).not.toBe('#0e51a8');
  });

  it('keeps every line a complete sweep whatever its length', () => {
    const palette = paletteById('duotone');
    expect(gradientStopsForLine(1, palette)).toHaveLength(1);
    expect(gradientStopsForLine(9, palette)[8]).toBe(samplePalette(palette, 1));
  });

  it('splits a line into coloured words and preserves the spacing', () => {
    const parts = gradientLine('one two  three', paletteById('forest'));
    expect(parts.map((part) => part.text).join('')).toBe('one two  three');
    expect(parts.filter((part) => !/^\s+$/.test(part.text))).toHaveLength(3);
    expect(new Set(parts.filter((part) => !/^\s+$/.test(part.text)).map((part) => part.color)).size).toBeGreaterThan(1);
  });

  it('produces inline-styled HTML for a line', () => {
    const html = gradientLineHtml('alpha beta', paletteById('graphite'));
    expect(html).toBe('<span style="color:#334155">alpha</span> <span style="color:#0f172a">beta</span>');
  });

  it('reports contrast for every stop against the background', () => {
    const report = checkGradientContrast(paletteById('teal'), '#ffffff');
    expect(report.passes).toBe(true);
    expect(report.ratio).toBeGreaterThan(4.5);
    const failing = checkGradientContrast(paletteById('horizon'), '#0b1220', 7);
    expect(failing.passes).toBe(false);
    expect(failing.worstStop).toBeTruthy();
  });

  it('orders palettes by contrast for a given background', () => {
    const ranked = palettesForBackground('#000000', 4.5);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.length).toBeLessThanOrEqual(GRADIENT_PALETTES.length);
  });

  it('falls back to the first palette for an unknown id', () => {
    expect(paletteById('does-not-exist').id).toBe(GRADIENT_PALETTES[0]!.id);
  });
});

describe('themes, fonts, and focus markers', () => {
  it('provides more than fifteen themes with distinct identifiers', () => {
    expect(READER_THEMES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(READER_THEMES.map((theme) => theme.id)).size).toBe(READER_THEMES.length);
  });

  it('includes an OLED true black theme and a high-contrast pair', () => {
    const oled = themeById('oled');
    expect(oled.background).toBe('#000000');
    expect(READER_THEMES.some((theme) => theme.id === 'high-contrast')).toBe(true);
    expect(READER_THEMES.some((theme) => theme.id === 'high-contrast-dark')).toBe(true);
  });

  it('meets AA contrast for every theme body text', () => {
    for (const theme of READER_THEMES) {
      const verdict = themeContrast(theme);
      expect(verdict.passes, `${theme.id} contrast ${verdict.ratio}`).toBe(true);
      expect(verdict.ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('lists themes that clear a requested contrast ratio', () => {
    const aaa = accessibleThemes(7);
    expect(aaa.length).toBeGreaterThan(5);
    expect(aaa.length).toBeLessThanOrEqual(READER_THEMES.length);
  });

  it('offers the accessibility typefaces and the named display fonts', () => {
    const stacks = FONT_CHOICES.map((font) => font.stack.toLowerCase());
    for (const family of ['opendyslexic', 'atkinson', 'lexend', 'inter', 'jetbrains', 'merriweather']) {
      expect(stacks.some((stack) => stack.includes(family)), family).toBe(true);
    }
    expect(FONT_CHOICES.filter((font) => font.accessibility).length).toBeGreaterThanOrEqual(4);
  });

  it('falls back to the first font for an unknown id', () => {
    expect(fontById('nope').id).toBe(FONT_CHOICES[0]!.id);
  });

  it('offers crosshair and reticle focal markers', () => {
    const ids = FOCAL_MARKERS.map((marker) => marker.id);
    expect(ids).toContain('crosshair');
    expect(ids).toContain('reticle');
    expect(ids).toContain('none');
    expect(DEFAULT_APPEARANCE.focalMarker).toBe('crosshair');
  });

  it('scales the font size within a sane band', () => {
    expect(fontSizePx({ ...DEFAULT_APPEARANCE, fontScale: 10 })).toBe(60);
    expect(fontSizePx({ ...DEFAULT_APPEARANCE, fontScale: 0.1 })).toBe(14);
    expect(fontSizePx(DEFAULT_APPEARANCE)).toBe(20);
  });

  it('widens letter and word spacing when dyslexia spacing is on', () => {
    const spaced = applyDyslexiaSpacing({ ...DEFAULT_APPEARANCE, dyslexiaSpacing: true });
    expect(spaced.letterSpacing).toBeGreaterThan(0);
    expect(spaced.wordSpacing).toBeGreaterThan(0);
    const plain = applyDyslexiaSpacing(DEFAULT_APPEARANCE);
    expect(plain.letterSpacing).toBe(0);
  });

  it('exposes theme variables for the reading surface', () => {
    const variables = themeVariables({ ...DEFAULT_APPEARANCE, theme: 'oled', font: 'jetbrains', fontScale: 1.5 });
    expect(variables['--sightline-background']).toBe('#000000');
    expect(variables['--sightline-font']).toContain('JetBrains Mono');
    expect(variables['--sightline-font-size']).toBe('30px');
    expect(Object.keys(variables).length).toBeGreaterThanOrEqual(8);
  });
});

describe('peripheral expansion', () => {
  it('lays columns out symmetrically about the centre', () => {
    const layout = buildColumnLayout(1200, { columns: 3, columnChars: 24, gapRatio: 0.6, spread: 0.9, wordsPerColumn: 12, edgeFade: true });
    expect(layout).toHaveLength(3);
    const centres = layout.map((column) => column.centreFraction);
    expect(centres[1]).toBeCloseTo(0.5, 2);
    expect(centres[2]! - centres[1]!).toBeCloseTo(centres[1]! - centres[0]!, 3);
  });

  it('keeps every column inside the viewport', () => {
    for (const columns of [2, 3, 4, 5]) {
      const layout = buildColumnLayout(900, { columns, columnChars: 20, gapRatio: 0.5, spread: 1, wordsPerColumn: 10, edgeFade: false });
      for (const column of layout) {
        expect(column.leftFraction).toBeGreaterThanOrEqual(0);
        expect(column.leftFraction + column.widthFraction).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('offsets the outer columns vertically so the row does not read as one line', () => {
    const layout = buildColumnLayout(1200, { columns: 3, columnChars: 24, gapRatio: 0.6, spread: 0.9, wordsPerColumn: 12, edgeFade: true });
    expect(layout[1]!.offsetPx).toBe(0);
    expect(layout[0]!.offsetPx).toBeGreaterThan(0);
    expect(layout[2]!.offsetPx).toBe(layout[0]!.offsetPx);
  });

  it('sizes the type to the column measure', () => {
    const large = columnFontSize(360, 24);
    const small = columnFontSize(180, 24);
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(11);
    expect(columnFontSize(10_000, 8)).toBeLessThanOrEqual(34);
  });

  it('distributes tokens into slides of columns times words', () => {
    const slides = buildPeripheralSlides(50, { columns: 3, columnChars: 24, gapRatio: 0.6, spread: 0.9, wordsPerColumn: 5, edgeFade: true });
    expect(slides[0]!.columns).toHaveLength(3);
    expect(slides[0]!.columns[0]!.tokens).toEqual([0, 1, 2, 3, 4]);
    expect(slides[0]!.columns[1]!.tokens[0]).toBe(5);
    expect(slides[0]!.columns[2]!.tokens.at(-1)).toBe(14);
    expect(slides[1]!.startToken).toBe(15);
    // The tail slide is short rather than padded.
    expect(slides.at(-1)!.columns[2]!.tokens.length).toBeLessThanOrEqual(5);
  });

  it('measures how far the outer columns sit from the middle', () => {
    const layout = buildColumnLayout(1400, { columns: 3, columnChars: 20, gapRatio: 0.8, spread: 1, wordsPerColumn: 8, edgeFade: false });
    const degrees = columnEccentricityDegrees(layout.map((column) => column.centreFraction), 1400, 55);
    expect(degrees).toHaveLength(3);
    expect(degrees[1]).toBe(0);
    expect(degrees[0]).toBeGreaterThan(0);
    expect(degrees[2]).toBeCloseTo(degrees[0]!, 1);
  });

  it('advises when the spread is past useful peripheral range', () => {
    const wide = buildColumnLayout(2400, { columns: 5, columnChars: 20, gapRatio: 1, spread: 1, wordsPerColumn: 8, edgeFade: false });
    expect(peripheralAdvice(wide, 2400, 40)).toContain('past the point');
    const tight = buildColumnLayout(900, { columns: 2, columnChars: 20, gapRatio: 0.3, spread: 0.6, wordsPerColumn: 8, edgeFade: false });
    expect(peripheralAdvice(tight, 900, 70)).toContain('peripheral range');
    expect(peripheralAdvice([], 900)).toContain('two columns');
  });
});
