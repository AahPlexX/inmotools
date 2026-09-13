import { describe, expect, it } from 'vitest';
import { analyzeSketchConstraints } from '../../src/tools/cad/sketch-analysis';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function underConstrainedSketch(): CadSketch {
  return {
    id: 'analysis-under',
    label: 'Under constrained',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p1', type: 'point', x: 10, y: 3, construction: false },
      { id: 'line', type: 'line', startPointId: 'p0', endPointId: 'p1', construction: false },
    ],
    constraints: [{ id: 'horizontal', type: 'horizontal', lineId: 'line', enabled: true }],
  };
}

describe('CAD sketch constraint analysis', () => {
  it('reports solver state and remaining degrees of freedom without mutating the sketch', () => {
    const sketch = underConstrainedSketch();
    const before = JSON.stringify(sketch);

    const analysis = analyzeSketchConstraints(sketch);

    expect(analysis.constraintState).toBe('under');
    expect(analysis.degreesOfFreedom).toBeGreaterThan(0);
    expect(analysis.conflicts).toEqual([]);
    expect(analysis.residual).toBeLessThan(1e-8);
    expect(JSON.stringify(sketch)).toBe(before);
  });

  it('returns deterministic conflict ids for an over-constrained sketch', () => {
    const sketch: CadSketch = {
      ...underConstrainedSketch(),
      id: 'analysis-over',
      constraints: [
        { id: 'fix-p0', type: 'fixed-point', pointId: 'p0', x: 0, y: 0, enabled: true },
        { id: 'fix-p1', type: 'fixed-point', pointId: 'p1', x: 10, y: 0, enabled: true },
        { id: 'impossible', type: 'distance', pointAId: 'p0', pointBId: 'p1', value: 12, enabled: true },
      ],
    };

    const first = analyzeSketchConstraints(sketch);
    const second = analyzeSketchConstraints(sketch);

    expect(first.constraintState).toBe('over');
    expect(first.conflicts).toContain('impossible');
    expect(second.conflicts).toEqual(first.conflicts);
  });
});
