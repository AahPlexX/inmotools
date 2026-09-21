import { describe, expect, test } from 'vitest';
import { normalizeRecipe, photoMaskWeight, DEFAULT_RECIPE } from '../../src/tools/photo/photo-engine';
import { applyLocalGesture } from '../../src/tools/photo/photo-interaction';
import type { PhotoMask } from '../../src/tools/photo/photo-types';

function brushMask(overrides: Partial<Extract<PhotoMask, { type: 'brush' }>> = {}): Extract<PhotoMask, { type: 'brush' }> {
  return {
    type: 'brush',
    points: [],
    radius: 0.1,
    feather: 0,
    opacity: 1,
    invert: false,
    flow: 1,
    spacing: 0.25,
    smoothing: 0.3,
    ...overrides,
  };
}

describe('brush flow and erase composition', () => {
  test('a single stroke pass is capped at the flow ceiling, not full coverage', () => {
    const mask = brushMask({
      flow: 0.5,
      points: [{ x: 0.5, y: 0.5, pressure: 1, strokeId: 1, erase: false }],
    });
    expect(photoMaskWeight(mask, 0.5, 0.5, 0, 0, 0)).toBeCloseTo(0.5);
  });

  test('repeated passes build coverage toward full opacity without a single pass reaching it', () => {
    const mask = brushMask({
      flow: 0.5,
      points: [
        { x: 0.5, y: 0.5, pressure: 1, strokeId: 1, erase: false },
        { x: 0.5, y: 0.5, pressure: 1, strokeId: 2, erase: false },
      ],
    });
    // pass 1: 0.5, pass 2: 0.5 + 0.5 * (1 - 0.5) = 0.75
    expect(photoMaskWeight(mask, 0.5, 0.5, 0, 0, 0)).toBeCloseTo(0.75);
  });

  test('a legacy single-stroke brush at flow 1 reproduces the original max-based weight', () => {
    const mask = brushMask({
      flow: 1,
      feather: 0.5,
      points: [
        { x: 0.45, y: 0.5, pressure: 0.6, strokeId: 0, erase: false },
        { x: 0.5, y: 0.5, pressure: 1, strokeId: 0, erase: false },
      ],
    });
    // Both points share one stroke, so the result is exactly max(edge * pressure) as before flow existed.
    expect(photoMaskWeight(mask, 0.5, 0.5, 0, 0, 0)).toBeCloseTo(1);
  });

  test('an erase stroke multiplicatively removes coverage a paint stroke added', () => {
    const mask = brushMask({
      flow: 1,
      points: [
        { x: 0.5, y: 0.5, pressure: 1, strokeId: 1, erase: false },
        { x: 0.5, y: 0.5, pressure: 0.5, strokeId: 2, erase: true },
      ],
    });
    expect(photoMaskWeight(mask, 0.5, 0.5, 0, 0, 0)).toBeCloseTo(0.5);
  });

  test('erase strokes never add coverage where nothing was painted', () => {
    const mask = brushMask({
      flow: 1,
      points: [{ x: 0.5, y: 0.5, pressure: 1, strokeId: 1, erase: true }],
    });
    expect(photoMaskWeight(mask, 0.5, 0.5, 0, 0, 0)).toBe(0);
  });

  test('legacy points without a recorded strokeId normalize into one shared pass', () => {
    const recipe = normalizeRecipe({
      ...DEFAULT_RECIPE,
      localAdjustments: [{
        id: 'legacy-brush',
        label: 'Legacy brush',
        enabled: true,
        mask: {
          type: 'brush',
          points: [
            { x: 0.5, y: 0.5, pressure: 1 },
            { x: 0.5, y: 0.5, pressure: 1 },
          ],
          radius: 0.1,
          feather: 0,
          opacity: 1,
          invert: false,
        } as unknown as PhotoMask,
        effect: { exposure: 0, saturation: 0, sharpness: 0, blur: 0 },
      }],
    });
    const mask = recipe.localAdjustments[0].mask;
    expect(mask.type).toBe('brush');
    if (mask.type !== 'brush') throw new Error('expected brush mask');
    expect(mask.points.every((point) => point.strokeId === 0)).toBe(true);
    // Two duplicate legacy points collapse to the same one-pass weight a pre-flow mask always had.
    expect(photoMaskWeight(mask, 0.5, 0.5, 0, 0, 0)).toBe(1);
  });
});

describe('brush gesture capture: spacing and smoothing', () => {
  function recipeWithBrush(overrides: Partial<Extract<PhotoMask, { type: 'brush' }>> = {}) {
    return normalizeRecipe({
      ...DEFAULT_RECIPE,
      localAdjustments: [{
        id: 'brush',
        label: 'Brush',
        enabled: true,
        mask: brushMask(overrides),
        effect: { exposure: 0.5, saturation: 0, sharpness: 0, blur: 0 },
      }],
    });
  }

  test('dense spacing keeps every dab', () => {
    const source = recipeWithBrush({ spacing: 0.01, radius: 0.1, smoothing: 0 });
    const path = Array.from({ length: 10 }, (_, index) => ({ x: 0.1 + index * 0.01, y: 0.1, pressure: 1 }));
    const next = applyLocalGesture(source, 'brush', path[0], path[path.length - 1], path, 1, false);
    const mask = next.localAdjustments[0].mask;
    if (mask.type !== 'brush') throw new Error('expected brush mask');
    expect(mask.points).toHaveLength(10);
  });

  test('coarse spacing thins interior dabs while keeping the stroke start and end', () => {
    const source = recipeWithBrush({ spacing: 1, radius: 0.1, smoothing: 0 });
    const path = Array.from({ length: 10 }, (_, index) => ({ x: 0.1 + index * 0.01, y: 0.1, pressure: 1 }));
    const next = applyLocalGesture(source, 'brush', path[0], path[path.length - 1], path, 1, false);
    const mask = next.localAdjustments[0].mask;
    if (mask.type !== 'brush') throw new Error('expected brush mask');
    expect(mask.points.length).toBeLessThan(10);
    expect(mask.points[0]).toMatchObject({ x: 0.1, y: 0.1 });
    expect(mask.points[mask.points.length - 1]).toMatchObject({ x: 0.19, y: 0.1 });
  });

  test('smoothing pulls interior points toward the prior smoothed point but keeps the ends exact', () => {
    const source = recipeWithBrush({ smoothing: 0.8, spacing: 0.01 });
    const path = [
      { x: 0.1, y: 0.1, pressure: 1 },
      { x: 0.5, y: 0.1, pressure: 1 },
      { x: 0.1, y: 0.5, pressure: 1 },
    ];
    const next = applyLocalGesture(source, 'brush', path[0], path[2], path, 1, false);
    const mask = next.localAdjustments[0].mask;
    if (mask.type !== 'brush') throw new Error('expected brush mask');
    expect(mask.points[0]).toMatchObject({ x: 0.1, y: 0.1 });
    expect(mask.points[2]).toMatchObject({ x: 0.1, y: 0.5 });
    // The middle point is pulled toward the smoothed start rather than sitting at the raw jump.
    expect(mask.points[1].x).toBeLessThan(0.5);
  });

  test('zero smoothing leaves the raw path untouched', () => {
    const source = recipeWithBrush({ smoothing: 0, spacing: 0.01 });
    const path = [
      { x: 0.1, y: 0.1, pressure: 1 },
      { x: 0.5, y: 0.1, pressure: 1 },
      { x: 0.1, y: 0.5, pressure: 1 },
    ];
    const next = applyLocalGesture(source, 'brush', path[0], path[2], path, 1, false);
    const mask = next.localAdjustments[0].mask;
    if (mask.type !== 'brush') throw new Error('expected brush mask');
    expect(mask.points[1]).toMatchObject({ x: 0.5, y: 0.1 });
  });

  test('erase flag threads through to every dab from that gesture', () => {
    const source = recipeWithBrush();
    const next = applyLocalGesture(source, 'brush', { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }, [
      { x: 0.2, y: 0.2, pressure: 1 },
      { x: 0.3, y: 0.3, pressure: 1 },
    ], 4, true);
    const mask = next.localAdjustments[0].mask;
    if (mask.type !== 'brush') throw new Error('expected brush mask');
    expect(mask.points.every((point) => point.erase && point.strokeId === 4)).toBe(true);
  });
});
