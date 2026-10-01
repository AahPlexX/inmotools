import { describe, expect, test } from 'vitest';
import {
  addCrochetRound,
  clearCrochetRound,
  createStarterCrochetDocument,
  fillCrochetRound,
  removeLastCrochetRound,
  setCrochetRoundStitch,
  toggleCrochetProgressStep,
  workNextCrochetStitch,
} from '../../src/tools/fiber-craft/crochet-document-engine';
import { crochetGlyphPrimitives } from '../../src/tools/fiber-craft/engines/crochet-glyph-engine';
import { compileCrochetWrittenPattern, validateCrochetPattern } from '../../src/tools/fiber-craft/engines/crochet-pattern-engine';
import { hitTestPolarNode } from '../../src/tools/fiber-craft/engines/crochet-chart-renderer';
import { CROCHET_SYMBOLS, crochetSymbolLabel, getCrochetSymbol } from '../../src/tools/fiber-craft/engines/symbol-library';
import { parseFiberCraftProject, serializeFiberCraftProject } from '../../src/tools/fiber-craft/project-bundle-engine';
import type { FiberCraftDocument, PolarChart } from '../../src/tools/fiber-craft/fiber-craft-types';

const NOW = '2026-09-29T00:00:00.000Z';

const polar = (document: FiberCraftDocument): PolarChart => {
  if (document.chart.kind !== 'polar') throw new Error('Expected a round chart');
  return document.chart;
};

const workedRoundOfSix = (): FiberCraftDocument => fillCrochetRound(createStarterCrochetDocument(NOW), 0, 'sc-dc', 'primary', {}, NOW);

/** The standard amigurumi second round: every base stitch gets two single crochets. */
const amigurumiIncreaseRound = (): FiberCraftDocument => {
  let document = addCrochetRound(workedRoundOfSix(), 12, NOW);
  for (let angle = 0; angle < 12; angle += 1) {
    document = setCrochetRoundStitch(document, 1, angle, 'sc-dc', 'primary', { sharedBase: angle % 2 === 1 }, NOW);
  }
  return document;
};

describe('crochet increases, decreases, and loop modifiers', () => {
  test('a 6 to 12 increase round validates cleanly when the second leg shares the first leg base stitch', () => {
    const findings = validateCrochetPattern(amigurumiIncreaseRound(), [6, 12]);
    expect(findings).toEqual([]);
  });

  test('the same round without shared bases is still reported as consuming too many base stitches', () => {
    let document = addCrochetRound(workedRoundOfSix(), 12, NOW);
    document = fillCrochetRound(document, 1, 'sc-dc', 'primary', {}, NOW);
    expect(validateCrochetPattern(document).map((finding) => finding.code)).toContain('base-consumption-mismatch');
  });

  test('a shared base on the first position of a round is rejected because nothing precedes it', () => {
    const document = addCrochetRound(workedRoundOfSix(), 12, NOW);
    expect(() => setCrochetRoundStitch(document, 1, 0, 'sc-dc', 'primary', { sharedBase: true }, NOW)).toThrow(/first stitch/i);
  });

  test('written pattern folds increase legs into the standard "in next st" grouping and counts stitches honestly', () => {
    const [round1, round2] = compileCrochetWrittenPattern(amigurumiIncreaseRound(), 'us');
    expect(round1.text).toBe('Round 1: 6 sc [Primary].');
    expect(round2.text).toBe('Round 2: (2 sc in next st) 6 times [Primary].');
    expect(round2).toMatchObject({ complete: true, worked: 12, capacity: 12, consumedStitches: 6, producedStitches: 12 });
    expect(compileCrochetWrittenPattern(amigurumiIncreaseRound(), 'uk')[1].text).toBe('Round 2: (2 dc in next st) 6 times [Primary].');
  });

  test('written pattern names front and back loop work with the Craft Yarn Council abbreviations', () => {
    let document = createStarterCrochetDocument(NOW);
    document = setCrochetRoundStitch(document, 0, 0, 'sc-dc', 'primary', { loop: 'back' }, NOW);
    document = setCrochetRoundStitch(document, 0, 1, 'sc-dc', 'primary', { loop: 'back' }, NOW);
    document = setCrochetRoundStitch(document, 0, 2, 'sc-dc', 'primary', { loop: 'front' }, NOW);
    expect(compileCrochetWrittenPattern(document, 'us')[0].text).toBe('Round 1: 2 sc BLO [Primary], 1 sc FLO [Primary], 3 unworked.');
  });

  test('mixed increase groups are written as a parenthesised group and remain valid', () => {
    let document = addCrochetRound(workedRoundOfSix(), 12, NOW);
    for (let angle = 0; angle < 12; angle += 1) {
      const shared = angle % 2 === 1;
      document = setCrochetRoundStitch(document, 1, angle, shared ? 'dc-tr' : 'sc-dc', 'primary', { sharedBase: shared }, NOW);
    }
    expect(compileCrochetWrittenPattern(document, 'us')[1].text).toBe('Round 2: (sc, dc in next st) 6 times [Primary].');
    expect(validateCrochetPattern(document)).toEqual([]);
  });

  test('the new 3-together and double-crochet decrease symbols consume the right base stitches with US and UK names', () => {
    expect(getCrochetSymbol('sc3tog-dc3tog')).toMatchObject({ stitchesConsumed: 3, stitchesProduced: 1, usAbbreviation: 'sc3tog', ukAbbreviation: 'dc3tog' });
    expect(getCrochetSymbol('dc2tog-tr2tog')).toMatchObject({ stitchesConsumed: 2, stitchesProduced: 1, usAbbreviation: 'dc2tog', ukAbbreviation: 'tr2tog' });
    expect(getCrochetSymbol('dc3tog-tr3tog')).toMatchObject({ stitchesConsumed: 3, stitchesProduced: 1, usAbbreviation: 'dc3tog', ukAbbreviation: 'tr3tog' });
    expect(crochetSymbolLabel('dc2tog-tr2tog', 'uk')).toBe('treble 2 together (tr2tog)');
    for (const symbol of CROCHET_SYMBOLS) {
      const primitives = crochetGlyphPrimitives(symbol.id);
      expect(primitives.length).toBeGreaterThan(0);
    }
  });

  test('a decrease round from 12 to 6 validates when every position is a 2-together stitch', () => {
    let document = addCrochetRound(amigurumiIncreaseRound(), 6, NOW);
    document = fillCrochetRound(document, 2, 'sc2tog-dc2tog', 'primary', {}, NOW);
    expect(validateCrochetPattern(document, [6, 12, 6])).toEqual([]);
  });

  test('modifiers add glyph marks without changing the base stitch symbol', () => {
    const base = crochetGlyphPrimitives('sc-dc');
    expect(crochetGlyphPrimitives('sc-dc', { loop: 'back' }).length).toBeGreaterThan(base.length);
    expect(crochetGlyphPrimitives('sc-dc', { loop: 'front' }).length).toBeGreaterThan(base.length);
    expect(crochetGlyphPrimitives('sc-dc', { loop: 'back' })).not.toEqual(crochetGlyphPrimitives('sc-dc', { loop: 'front' }));
  });
});

describe('editing any stitch position in a round chart', () => {
  test('sets, replaces, and clears one position without touching its neighbours or mutating the source', () => {
    const source = createStarterCrochetDocument(NOW);
    const placed = setCrochetRoundStitch(source, 0, 3, 'hdc-htr', 'accent', {}, NOW);
    expect(polar(source).nodes.every((node) => node.symbolId === null)).toBe(true);
    expect(polar(placed).nodes.filter((node) => node.symbolId !== null)).toEqual([
      { round: 0, angleIndex: 3, stitchesInRound: 6, symbolId: 'hdc-htr', colorId: 'accent' },
    ]);
    const replaced = setCrochetRoundStitch(placed, 0, 3, 'dc-tr', 'primary', { loop: 'front' }, NOW);
    expect(polar(replaced).nodes.find((node) => node.angleIndex === 3)).toMatchObject({ symbolId: 'dc-tr', colorId: 'primary', loop: 'front' });
    const cleared = setCrochetRoundStitch(replaced, 0, 3, null, null, {}, NOW);
    const clearedNode = polar(cleared).nodes.find((node) => node.angleIndex === 3);
    expect(clearedNode).toEqual({ round: 0, angleIndex: 3, stitchesInRound: 6, symbolId: null, colorId: null });
    expect('loop' in (clearedNode ?? {})).toBe(false);
  });

  test('rejects unknown symbols, unknown colors, and positions outside the chart', () => {
    const document = createStarterCrochetDocument(NOW);
    expect(() => setCrochetRoundStitch(document, 0, 0, 'not-a-stitch', 'primary', {}, NOW)).toThrow(/unknown crochet symbol/i);
    expect(() => setCrochetRoundStitch(document, 0, 0, 'sc-dc', 'missing', {}, NOW)).toThrow(/palette/i);
    expect(() => setCrochetRoundStitch(document, 4, 0, 'sc-dc', 'primary', {}, NOW)).toThrow(/round/i);
    expect(() => setCrochetRoundStitch(document, 0, 6, 'sc-dc', 'primary', {}, NOW)).toThrow(/position/i);
  });

  test('working the next stitch carries modifiers and skips nothing', () => {
    let document = createStarterCrochetDocument(NOW);
    document = workNextCrochetStitch(document, 0, 'sc-dc', 'primary', NOW, { loop: 'back' });
    expect(polar(document).nodes[0]).toMatchObject({ symbolId: 'sc-dc', loop: 'back' });
  });

  test('filling a round with increases pairs positions so the round validates against the previous round', () => {
    const document = fillCrochetRound(addCrochetRound(workedRoundOfSix(), 12, NOW), 1, 'sc-dc', 'primary', { sharedBase: true }, NOW);
    expect(polar(document).nodes.filter((node) => node.round === 1).map((node) => node.sharedBase === true)).toEqual(
      Array.from({ length: 12 }, (_, angle) => angle % 2 === 1),
    );
    expect(validateCrochetPattern(document, [6, 12])).toEqual([]);
  });

  test('fills and clears a whole round and reports which state each action leaves it in', () => {
    const filled = fillCrochetRound(createStarterCrochetDocument(NOW), 0, 'sc-dc', 'accent', {}, NOW);
    expect(polar(filled).nodes.every((node) => node.symbolId === 'sc-dc' && node.colorId === 'accent')).toBe(true);
    const cleared = clearCrochetRound(filled, 0, NOW);
    expect(polar(cleared).nodes.every((node) => node.symbolId === null && node.colorId === null && !('loop' in node) && !('sharedBase' in node))).toBe(true);
  });

  test('removing the last round drops its progress marker and trims round targets, and never removes the only round', () => {
    let document = addCrochetRound(createStarterCrochetDocument(NOW), 12, NOW);
    document = toggleCrochetProgressStep(document, 'round:1', NOW);
    document = { ...document, settings: { ...document.settings, crochet: { targetRoundCounts: [6, 12], yarnWeight: null } } };
    const removed = removeLastCrochetRound(document, NOW);
    expect(polar(removed).rounds).toBe(1);
    expect(polar(removed).nodes.every((node) => node.round === 0)).toBe(true);
    expect(removed.completedSteps).not.toContain('round:1');
    expect(removed.settings?.crochet?.targetRoundCounts).toEqual([6]);
    expect(() => removeLastCrochetRound(removed, NOW)).toThrow(/only round/i);
  });
});

describe('modifier persistence in portable project files', () => {
  test('round-trips shared bases and loop modes through .craftproj', () => {
    const document = amigurumiIncreaseRound();
    const withLoop = setCrochetRoundStitch(document, 1, 2, 'sc-dc', 'primary', { loop: 'back' }, NOW);
    const restored = parseFiberCraftProject(serializeFiberCraftProject(withLoop));
    expect(polar(restored).nodes.find((node) => node.round === 1 && node.angleIndex === 1)?.sharedBase).toBe(true);
    expect(polar(restored).nodes.find((node) => node.round === 1 && node.angleIndex === 2)?.loop).toBe('back');
  });

  test('rejects malformed modifier values at the file boundary', () => {
    const text = serializeFiberCraftProject(amigurumiIncreaseRound());
    expect(() => parseFiberCraftProject(text.replace('"sharedBase": true', '"sharedBase": "yes"'))).toThrow();
    const looped = serializeFiberCraftProject(setCrochetRoundStitch(amigurumiIncreaseRound(), 1, 2, 'sc-dc', 'primary', { loop: 'back' }, NOW));
    expect(() => parseFiberCraftProject(looped.replace('"loop": "back"', '"loop": "sideways"'))).toThrow();
  });
});

describe('selecting a stitch position on the round canvas', () => {
  test('returns the stitch under the pointer and null when the pointer is nowhere near one', () => {
    const chart = polar(addCrochetRound(createStarterCrochetDocument(NOW), 12, NOW));
    const width = 960;
    const height = 720;
    const centerX = width / 2;
    const centerY = height / 2;
    const target = chart.nodes.find((node) => node.round === 1 && node.angleIndex === 3);
    if (!target) throw new Error('Expected a round 2 node');
    const spacing = Math.min(width - 48, height - 48) / (2 * (chart.rounds + 1));
    const radius = (target.round + 1) * spacing;
    const angle = (2 * Math.PI * target.angleIndex) / target.stitchesInRound;
    expect(hitTestPolarNode(chart, width, height, centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)))
      .toEqual({ round: 1, angleIndex: 3 });
    expect(hitTestPolarNode(chart, width, height, 4, 4)).toBeNull();
  });
});
