import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createStarterCrochetDocument, workNextCrochetStitch } from '../../src/tools/fiber-craft/crochet-document-engine';
import {
  addCountedBackstitch,
  addCountedFrenchKnot,
  countedThreadFinishedSizeInches,
  createStarterCountedThreadDocument,
  DMC_SKEIN_YARDS,
  estimateCountedThreadFlossUsage,
  findCountedThreadConfettiCells,
  setCountedThreadFabricSettings,
  setCountedThreadStitch,
} from '../../src/tools/fiber-craft/engines/counted-thread-engine';
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

  it('persists fabric-count settings and finds isolated same-color confetti stitches', () => {
    let document = createStarterCountedThreadDocument('2026-09-27T20:10:00.000Z');
    document = setCountedThreadFabricSettings(document, {
      fabricType: 'linen',
      fabricCount: 28,
      stitchOver: 2,
      confettiWarningsEnabled: true,
      strandCount: 2,
    }, '2026-09-27T20:11:00.000Z');
    document = setCountedThreadStitch(document, 0, 0, 'full-cross', 'primary', '2026-09-27T20:12:00.000Z');
    document = setCountedThreadStitch(document, 0, 1, 'full-cross', 'primary', '2026-09-27T20:13:00.000Z');
    document = setCountedThreadStitch(document, 5, 5, 'full-cross', 'accent', '2026-09-27T20:14:00.000Z');

    expect(document.settings?.countedThread).toEqual({
      fabricType: 'linen',
      fabricCount: 28,
      stitchOver: 2,
      confettiWarningsEnabled: true,
      strandCount: 2,
    });
    expect(countedThreadFinishedSizeInches(document)).toEqual({
      width: 12 / 14,
      height: 12 / 14,
    });
    expect(findCountedThreadConfettiCells(document).map(({ row, col }) => [row, col])).toEqual([[5, 5]]);
    expect(parseFiberCraftProject(serializeFiberCraftProject(document))).toEqual(document);
  });

  it('estimates floss yardage and whole-skein counts per color from fabric count, stitches, and strand count (FC-40)', () => {
    let document = createStarterCountedThreadDocument('2026-09-28T13:00:00.000Z');
    document = setCountedThreadFabricSettings(document, {
      fabricType: 'aida',
      fabricCount: 14,
      stitchOver: 1,
      confettiWarningsEnabled: true,
      strandCount: 2,
    }, '2026-09-28T13:01:00.000Z');
    document = setCountedThreadStitch(document, 0, 0, 'full-cross', 'primary', '2026-09-28T13:02:00.000Z');
    document = setCountedThreadStitch(document, 0, 1, 'half-forward', 'primary', '2026-09-28T13:03:00.000Z');
    document = addCountedFrenchKnot(document, { row: 2.5, col: 2.5 }, 'accent', '2026-09-28T13:04:00.000Z');
    document = addCountedBackstitch(document, { row: 0.5, col: 0.5 }, { row: 3.5, col: 4.5 }, 'accent', '2026-09-28T13:05:00.000Z');

    const usage = estimateCountedThreadFlossUsage(document);
    expect(usage.map((entry) => entry.colorId)).toEqual(['primary', 'accent']);

    const primary = usage.find((entry) => entry.colorId === 'primary')!;
    expect(primary.stitchUnits).toBeCloseTo(1.5, 10);
    expect(primary.knotCount).toBe(0);
    expect(primary.estimatedYards).toBeGreaterThan(0);
    expect(primary.skeinsNeeded).toBe(1);

    const accent = usage.find((entry) => entry.colorId === 'accent')!;
    expect(accent.stitchUnits).toBe(0);
    expect(accent.knotCount).toBe(1);
    expect(accent.estimatedYards).toBeGreaterThan(0);
    expect(accent.skeinsNeeded).toBeGreaterThanOrEqual(1);

    // Doubling the strand count roughly doubles skein-material consumed for the same stitched path.
    const doubledStrands = setCountedThreadFabricSettings(document, {
      ...document.settings!.countedThread!,
      strandCount: 4,
    }, '2026-09-28T13:06:00.000Z');
    const doubledUsage = estimateCountedThreadFlossUsage(doubledStrands);
    const doubledPrimary = doubledUsage.find((entry) => entry.colorId === 'primary')!;
    expect(doubledPrimary.estimatedYards).toBeCloseTo(primary.estimatedYards * 2, 5);

    // A finer fabric count uses less physical thread per stitch than a coarser one.
    const finerFabric = setCountedThreadFabricSettings(document, {
      ...document.settings!.countedThread!,
      fabricCount: 28,
    }, '2026-09-28T13:07:00.000Z');
    const finerUsage = estimateCountedThreadFlossUsage(finerFabric);
    const finerPrimary = finerUsage.find((entry) => entry.colorId === 'primary')!;
    expect(finerPrimary.estimatedYards).toBeLessThan(primary.estimatedYards);

    expect(DMC_SKEIN_YARDS).toBeCloseTo(8.7, 5);
    expect(() => estimateCountedThreadFlossUsage(createStarterCrochetDocument('2026-09-28T13:08:00.000Z')))
      .toThrow(/counted-thread/);
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
