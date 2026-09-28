import { describe, expect, it } from 'vitest';
import { createStarterStructure } from '../../src/tools/crystal/document-engine';
import {
  analyzePeriodicVoids,
  isolateVoidComponent,
} from '../../src/tools/crystal/void-analysis-engine';

describe('crystal periodic void and cavity analysis', () => {
  it('reports bounded occupied/void/accessibility fractions and selectable periodic components', () => {
    const document = createStarterStructure('bcc');
    const result = analyzePeriodicVoids(document, {
      gridSpacing: 0.8,
      probeRadius: 0.5,
      atomRadiusScale: 0.65,
      maxPoints: 100_000,
    });

    expect(result.gridPointCount).toBeGreaterThan(0);
    expect(result.gridPointCount).toBeLessThanOrEqual(100_000);
    expect(result.occupiedFraction + result.voidFraction).toBeCloseTo(1, 12);
    expect(result.accessibleFraction).toBeGreaterThanOrEqual(0);
    expect(result.accessibleFraction).toBeLessThanOrEqual(result.voidFraction);
    expect(result.assumptions.probeRadius).toBe(0.5);
    expect(result.assumptions.gridSpacing).toBe(0.8);
    expect(result.components.length).toBeGreaterThan(0);

    const selected = isolateVoidComponent(result, result.components[0]!.id);
    expect(selected.component.id).toBe(result.components[0]!.id);
    expect(selected.points.length).toBe(selected.component.voxelCount);
    expect(selected.points.every((point) => point.length === 3)).toBe(true);
  });
});
