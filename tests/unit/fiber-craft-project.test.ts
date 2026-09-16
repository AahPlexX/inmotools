import { describe, expect, it } from 'vitest';
import { createStarterCrochetDocument, workNextCrochetStitch } from '../../src/tools/fiber-craft/crochet-document-engine';
import { crochetGlyphPrimitives } from '../../src/tools/fiber-craft/engines/crochet-glyph-engine';
import { CROCHET_SYMBOLS } from '../../src/tools/fiber-craft/engines/symbol-library';
import {
  FIBER_CRAFT_PROJECT_KIND,
  fiberCraftProjectFilename,
  parseFiberCraftProject,
  serializeFiberCraftProject,
} from '../../src/tools/fiber-craft/project-bundle-engine';

const numbersInPrimitive = (primitive: ReturnType<typeof crochetGlyphPrimitives>[number]): readonly number[] => {
  switch (primitive.kind) {
    case 'line': return [primitive.x1, primitive.y1, primitive.x2, primitive.y2];
    case 'ellipse': return [primitive.cx, primitive.cy, primitive.rx, primitive.ry];
    case 'circle': return [primitive.cx, primitive.cy, primitive.r];
    case 'arc': return [primitive.cx, primitive.cy, primitive.r, primitive.startAngle, primitive.endAngle];
    case 'polyline': return primitive.points.flatMap((point) => [point.x, point.y]);
  }
};

describe('portable Fiber Craft project bundle', () => {
  it('round-trips the complete local crochet document without losing embedded project data', () => {
    const starter = createStarterCrochetDocument('2026-09-16T00:00:00.000Z');
    const worked = workNextCrochetStitch(starter, 0, 'sc-dc', 'primary', '2026-09-16T00:01:00.000Z');
    const document = {
      ...worked,
      metadata: { ...worked.metadata, title: 'Market Bag', author: 'Pattern Author', techniqueTags: ['rounds', 'mesh'] },
      swatchImages: { yarn: 'data:image/png;base64,AA==' },
      completedSteps: ['round:0'],
    };
    const restored = parseFiberCraftProject(serializeFiberCraftProject(document));
    expect(restored).toEqual(document);
  });

  it('rejects unrelated envelopes and invalid project data', () => {
    expect(() => parseFiberCraftProject('{"kind":"other","bundleVersion":1,"document":{}}')).toThrow(/not an InmoTools Fiber Craft project/);
    expect(() => parseFiberCraftProject(JSON.stringify({ kind: FIBER_CRAFT_PROJECT_KIND, bundleVersion: 1, document: {} }))).toThrow(/invalid or unsupported/);
    expect(() => parseFiberCraftProject('{not json')).toThrow(/not valid JSON/);
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
