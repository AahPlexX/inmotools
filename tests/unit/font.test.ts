import { describe, expect, it } from 'vitest';
import { collectRequiredCodePoints, inspectFont, subsetToWoff2 } from '../../src/tools/font/font-engine';

const TINY_TTF_BASE64 = 'AAEAAAAKAIAAAwAgT1MvMkUhRCwAAAEoAAAAYGNtYXAADACVAAABlAAAADRnbHlmssEZlgAAAdAAAABMaGVhZC7goYoAAACsAAAANmhoZWEFKgIqAAAA5AAAACRobXR4BuoALQAAAYgAAAAMbG9jYQAZADMAAAHIAAAACG1heHAABQAGAAABCAAAACBuYW1lKwzfCgAAAhwAAAEscG9zdAApACUAAANIAAAAKAABAAAAAQAA6SrXUV8PPPUAAQPoAAAAAOa6LvcAAAAA5rou9wAyAAACJgK8AAAAAwACAAAAAAAAAAEAAAMg/zgAAAKKAAAAZAIIAAEAAAAAAAAAAAAAAAAAAAADAAEAAAADAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwJOAZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAAEEAQgMg/zgAAAMgAMgAAAAAAAAAAAAAAAAAAAAgAAAB9AAAAooAFAJsABkAAAACAAAAAwAAABQAAwABAAAAFAAEACAAAAAEAAQAAQAAAEL//wAAAEH////AAAEAAAAAAAAADQAZACYAAQAyAAABwgK8AAMAADMhESEyAZD+cAK8AAABADIAAAImArwAAgAAMxMTMvr6Arz9RAABADIAAAH0ArwAAwAAMxEhETIBwgK8/UQAAAAACgB+AAEAAAAAAAEADAAAAAEAAAAAAAIABwAMAAEAAAAAAAMAEwATAAEAAAAAAAQAFAAmAAEAAAAAAAYAEwATAAMAAQQJAAEAGAA6AAMAAQQJAAIADgBSAAMAAQQJAAMAJgBgAAMAAQQJAAQAKACGAAMAAQQJAAYAJgBgSW5tbyBGaXh0dXJlUmVndWxhcklubW9GaXh0dXJlLVJlZ3VsYXJJbm1vIEZpeHR1cmUgUmVndWxhcgBJAG4AbQBvACAARgBpAHgAdAB1AHIAZQBSAGUAZwB1AGwAYQByAEkAbgBtAG8ARgBpAHgAdAB1AHIAZQAtAFIAZQBnAHUAbABhAHIASQBuAG0AbwAgAEYAaQB4AHQAdQByAGUAIABSAGUAZwB1AGwAYQByAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAACQAJQ==';

function decodeFixture(): ArrayBuffer {
  const binary = atob(TINY_TTF_BASE64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

describe('font subsetter engine', () => {
  it('deduplicates and sorts Unicode code points from presets plus custom text', () => {
    const points = collectRequiredCodePoints({ presets: [], customText: 'BAA😀B' });
    expect(points).toEqual([65, 66, 0x1f600]);

    const latin = collectRequiredCodePoints({ presets: ['basic-latin'], customText: 'A' });
    expect(latin[0]).toBe(32);
    expect(latin.at(-1)).toBe(126);
    expect(new Set(latin).size).toBe(latin.length);
  });

  it('extracts source metrics and cmap-backed glyphs from a generated TTF fixture', async () => {
    const inspection = await inspectFont(decodeFixture(), 'fixture.ttf');
    expect(inspection.familyName).toBe('Inmo Fixture');
    expect(inspection.styleName).toBe('Regular');
    expect(inspection.unitsPerEm).toBe(1000);
    expect(inspection.ascender).toBe(800);
    expect(inspection.descender).toBe(-200);
    expect(inspection.glyphs.some((glyph) => glyph.codePoint === 65 && glyph.name === 'A')).toBe(true);
  });

  it('retains notdef plus requested glyphs and emits a valid WOFF2 container', async () => {
    const result = await subsetToWoff2(decodeFixture(), { presets: [], customText: 'A' });
    expect(result.codePoints).toEqual([65]);
    expect(result.glyphCount).toBe(2);
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe('wOF2');
    expect(result.bytes.byteLength).toBeGreaterThan(40);
  });
});
