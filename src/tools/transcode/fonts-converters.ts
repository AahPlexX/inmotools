// Registry wiring for font formats (F24-F27).

import type { FormatId } from './formats';
import { sfntToWoff1, sfntToWoff2, svgFontToSfnt, toSfnt } from './fonts-engine';
import { baseName, bytesArtifact, registerConverter } from './transcode-engine';

const FONT_MIME: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

const FONT_SOURCES: Array<{ id: FormatId; extension: string }> = [
  { id: 'ttf', extension: 'ttf' },
  { id: 'otf', extension: 'otf' },
  { id: 'woff', extension: 'woff' },
  { id: 'woff2', extension: 'woff2' },
];

export function registerFontConverters(): void {
  // F24/F25: container conversion between sfnt/WOFF/WOFF2.
  for (const source of FONT_SOURCES) {
    for (const target of FONT_SOURCES) {
      if (source.id === target.id) continue;
      registerConverter(source.id, target.id, `Convert ${source.extension.toUpperCase()} to ${target.extension.toUpperCase()}`, async (input, options) => {
        const sfnt = await toSfnt(input.bytes, source.id);
        let bytes: Uint8Array;
        if (target.id === 'woff2' && typeof options.subsetText === 'string' && options.subsetText.trim().length > 0) {
          // F26 inline: restrict the WOFF2 output to the requested glyphs.
          const { subsetToWoff2 } = await import('../font/font-engine');
          const subset = await subsetToWoff2(sfnt.slice().buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength) as ArrayBuffer, { presets: [], customText: options.subsetText });
          bytes = subset.bytes;
        } else if (target.id === 'woff') {
          bytes = sfntToWoff1(sfnt);
        } else if (target.id === 'woff2') {
          bytes = await sfntToWoff2(sfnt);
        } else {
          bytes = sfnt;
        }
        return [bytesArtifact(swap(baseName(input.fileName), target.extension), bytes, FONT_MIME[target.id])];
      });
    }
  }

  // F27: SVG font -> TTF/WOFF/WOFF2.
  registerConverter('svg-font', 'ttf', 'Compile the SVG font into a TrueType font', async (input) => {
    const sfnt = svgFontToSfnt(input.text());
    return [bytesArtifact(swap(baseName(input.fileName), 'ttf'), sfnt, 'font/ttf')];
  });
  registerConverter('svg-font', 'woff', 'Compile the SVG font into WOFF 1.0', async (input) => {
    const sfnt = svgFontToSfnt(input.text());
    return [bytesArtifact(swap(baseName(input.fileName), 'woff'), sfntToWoff1(sfnt), 'font/woff')];
  });
  registerConverter('svg-font', 'woff2', 'Compile the SVG font into WOFF2', async (input) => {
    const sfnt = svgFontToSfnt(input.text());
    return [bytesArtifact(swap(baseName(input.fileName), 'woff2'), await sfntToWoff2(sfnt), 'font/woff2')];
  });
}

const swap = (name: string, extension: string): string => `${name}.${extension}`;
