import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createStarterCrochetDocument, workNextCrochetStitch } from '../../src/tools/fiber-craft/crochet-document-engine';
import { addCountedBackstitch, addCountedFrenchKnot, createStarterCountedThreadDocument, setCountedThreadStitch } from '../../src/tools/fiber-craft/engines/counted-thread-engine';
import { crochetPngDimensions } from '../../src/tools/fiber-craft/engines/crochet-chart-renderer';
import { crochetGlyphPrimitives } from '../../src/tools/fiber-craft/engines/crochet-glyph-engine';
import { CROCHET_SYMBOLS } from '../../src/tools/fiber-craft/engines/symbol-library';
import {
  buildCrochetPatternBookModel,
  buildCrochetPatternPdf,
  fiberCraftPatternPdfFilename,
  fiberCraftPngFilename,
} from '../../src/tools/fiber-craft/pattern-export-engine';
import {
  FIBER_CRAFT_PROJECT_KIND,
  fiberCraftProjectFilename,
  parseFiberCraftProject,
  serializeFiberCraftProject,
} from '../../src/tools/fiber-craft/project-bundle-engine';
import {
  FIBER_CRAFT_SOCIAL_PREVIEW_HEIGHT,
  FIBER_CRAFT_SOCIAL_PREVIEW_WIDTH,
  fiberCraftSocialPreviewFilename,
} from '../../src/tools/fiber-craft/social-preview-engine';

const numbersInPrimitive = (primitive: ReturnType<typeof crochetGlyphPrimitives>[number]): readonly number[] => {
  switch (primitive.kind) {
    case 'line': return [primitive.x1, primitive.y1, primitive.x2, primitive.y2];
    case 'ellipse': return [primitive.cx, primitive.cy, primitive.rx, primitive.ry];
    case 'circle': return [primitive.cx, primitive.cy, primitive.r];
    case 'arc': return [primitive.cx, primitive.cy, primitive.r, primitive.startAngle, primitive.endAngle];
    case 'polyline': return primitive.points.flatMap((point) => [point.x, point.y]);
  }
};

const projectEnvelope = (document: unknown): string => JSON.stringify({
  kind: FIBER_CRAFT_PROJECT_KIND,
  bundleVersion: 1,
  document,
});

describe('portable Fiber Craft project bundle', () => {
  it('round-trips the complete local crochet document without losing embedded project data', () => {
    const starter = createStarterCrochetDocument('2026-09-16T00:00:00.000Z');
    const worked = workNextCrochetStitch(starter, 0, 'sc-dc', 'primary', '2026-09-16T00:01:00.000Z');
    const document = {
      ...worked,
      metadata: { ...worked.metadata, title: 'Market Bag', author: 'Pattern Author', techniqueTags: ['rounds', 'mesh'] },
      gauge: { stitchCount: 16, rowCount: 20, span: 4, unit: 'in' as const },
      swatchImages: { yarn: 'data:image/png;base64,AA==' },
      completedSteps: ['round:0'],
    };
    const restored = parseFiberCraftProject(serializeFiberCraftProject(document));
    expect(restored).toEqual(document);
  });

  it('round-trips counted-thread stitches, knots, and backstitch lines without losing chart data', () => {
    let document = createStarterCountedThreadDocument('2026-09-16T18:00:00.000Z');
    document = setCountedThreadStitch(document, 0, 0, 'full-cross', 'primary', '2026-09-16T18:01:00.000Z');
    document = setCountedThreadStitch(document, 0, 1, 'quarter-ne', 'accent', '2026-09-16T18:02:00.000Z');
    document = addCountedFrenchKnot(document, { row: 1.5, col: 1.5 }, 'contrast', '2026-09-16T18:03:00.000Z');
    document = addCountedBackstitch(document, { row: 0.5, col: 0.5 }, { row: 2.5, col: 3.5 }, 'primary', '2026-09-16T18:04:00.000Z');
    const restored = parseFiberCraftProject(serializeFiberCraftProject(document));
    expect(restored).toEqual(document);
    expect(restored.metadata.discipline).toBe('cross-stitch');
    expect(restored.chart.kind).toBe('counted-thread');
  });

  it('rejects unrelated envelopes and invalid project data', () => {
    expect(() => parseFiberCraftProject('{"kind":"other","bundleVersion":1,"document":{}}')).toThrow(/not an InmoTools Fiber Craft project/);
    expect(() => parseFiberCraftProject(projectEnvelope({}))).toThrow(/invalid or unsupported/);
    expect(() => parseFiberCraftProject('{not json')).toThrow(/not valid JSON/);
  });

  it('rejects malformed imported metadata and optional project payloads at the file boundary', () => {
    const starter = createStarterCrochetDocument('2026-09-16T00:00:00.000Z');
    const malformed: readonly [string, unknown][] = [
      ['metadata title', { ...starter, metadata: { ...starter.metadata, title: 42 } }],
      ['technique tags', { ...starter, metadata: { ...starter.metadata, techniqueTags: ['rounds', 42] } }],
      ['gauge span', { ...starter, gauge: { stitchCount: 16, rowCount: 20, span: 0, unit: 'in' } }],
      ['gauge unit', { ...starter, gauge: { stitchCount: 16, rowCount: 20, span: 4, unit: 'yards' } }],
      ['swatch value', { ...starter, swatchImages: { yarn: 42 } }],
      ['swatch encoding', { ...starter, swatchImages: { yarn: 'https://example.invalid/yarn.png' } }],
      ['palette hex', { ...starter, palette: [{ ...starter.palette[0], hex: 'not-a-color' }] }],
      ['progress id', { ...starter, completedSteps: [''] }],
    ];
    for (const [label, document] of malformed) {
      expect(() => parseFiberCraftProject(projectEnvelope(document)), label).toThrow(/invalid or unsupported/);
    }
  });

  it('creates a portable, filesystem-safe craftproj filename', () => {
    expect(fiberCraftProjectFilename('  Héirloom Market Bag / 2026  ')).toBe('heirloom-market-bag-2026.craftproj');
    expect(fiberCraftProjectFilename('***')).toBe('fiber-craft-project.craftproj');
  });
});

describe('crochet vector glyph geometry', () => {
  it('provides finite vector primitives for every supported crochet symbol', () => {
    for (const symbol of CROCHET_SYMBOLS) {
      const primitives = crochetGlyphPrimitives(symbol.id);
      expect(primitives.length, symbol.id).toBeGreaterThan(0);
      for (const primitive of primitives) {
        expect(numbersInPrimitive(primitive).every(Number.isFinite), symbol.id).toBe(true);
      }
    }
  });

  it('preserves the core Craft Yarn Council visual conventions', () => {
    expect(crochetGlyphPrimitives('chain')[0]?.kind).toBe('ellipse');
    expect(crochetGlyphPrimitives('slip-stitch')[0]).toMatchObject({ kind: 'circle', filled: true });
    expect(crochetGlyphPrimitives('sc-dc')).toHaveLength(2);
    expect(crochetGlyphPrimitives('hdc-htr')).toHaveLength(2);
    expect(crochetGlyphPrimitives('dc-tr')).toHaveLength(3);
    expect(crochetGlyphPrimitives('tr-dtr')).toHaveLength(4);
    expect(crochetGlyphPrimitives('dtr-trtr')).toHaveLength(5);
  });
});

describe('crochet publishing exports', () => {
  it('builds a multi-page vector pattern book with project metadata, legend, and instructions', async () => {
    const starter = createStarterCrochetDocument('2026-09-16T00:00:00.000Z');
    const worked = workNextCrochetStitch(starter, 0, 'sc-dc', 'primary', '2026-09-16T00:01:00.000Z');
    const document = {
      ...worked,
      metadata: {
        ...worked.metadata,
        title: 'Market Bag',
        author: 'Pattern Author',
        difficulty: 'Intermediate',
        techniqueTags: ['rounds', 'shaping'],
        materialClass: '4 Medium',
        toolSize: '5.5 mm',
      },
      gauge: { stitchCount: 20, rowCount: 28, span: 4, unit: 'in' as const },
    };
    const model = buildCrochetPatternBookModel(document, 'us');
    expect(model.materials).toContain('Yarn / material: 4 Medium');
    expect(model.legend.some((line) => line.includes('single crochet (sc)'))).toBe(true);
    expect(model.instructions[0]).toContain('Round 1: 1 sc [Primary]');

    const bytes = await buildCrochetPatternPdf(document, 'us');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
    expect(pdf.getTitle()).toBe('Market Bag');
    expect(pdf.getAuthor()).toBe('Pattern Author');
  });

  it('bounds PNG export scales and produces stable export filenames', () => {
    expect(crochetPngDimensions(1)).toEqual({ width: 960, height: 720 });
    expect(crochetPngDimensions(4)).toEqual({ width: 3840, height: 2880 });
    expect(() => crochetPngDimensions(5)).toThrow(/1 to 4/);
    expect(fiberCraftPngFilename('Héirloom Market Bag', 4)).toBe('heirloom-market-bag-4x.png');
    expect(fiberCraftPatternPdfFilename('Héirloom Market Bag')).toBe('heirloom-market-bag-pattern-book.pdf');
    expect([FIBER_CRAFT_SOCIAL_PREVIEW_WIDTH, FIBER_CRAFT_SOCIAL_PREVIEW_HEIGHT]).toEqual([1200, 630]);
    expect(fiberCraftSocialPreviewFilename('Héirloom Market Bag')).toBe('heirloom-market-bag-social-preview.png');
  });
});
