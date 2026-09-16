import { describe, expect, it } from 'vitest';
import { proposeSketchConstraints } from '../../src/tools/cad/sketch-inference';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function inferenceSketch(): CadSketch {
  return {
    id: 'inference',
    label: 'Inference',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'a0', type: 'point', x: 0, y: 0, construction: false },
      { id: 'a1', type: 'point', x: 10, y: 0.0002, construction: false },
      { id: 'v0', type: 'point', x: 15, y: 0, construction: false },
      { id: 'v1', type: 'point', x: 15.0001, y: 8, construction: false },
      { id: 'near-a0', type: 'point', x: 0.0003, y: -0.0002, construction: false },
      { id: 'center', type: 'point', x: 0, y: 5, construction: false },
      { id: 't0', type: 'point', x: -8, y: 1.0002, construction: false },
      { id: 't1', type: 'point', x: 8, y: 1.0001, construction: false },
      { id: 'horizontal', type: 'line', startPointId: 'a0', endPointId: 'a1', construction: false },
      { id: 'vertical', type: 'line', startPointId: 'v0', endPointId: 'v1', construction: false },
      { id: 'tangent-line', type: 'line', startPointId: 't0', endPointId: 't1', construction: false },
      { id: 'circle', type: 'circle', centerPointId: 'center', radius: 4, construction: false },
    ],
    constraints: [],
  };
}

describe('CAD sketch inference proposals', () => {
  it('proposes horizontal and vertical constraints without mutating geometry', () => {
    const sketch = inferenceSketch();
    const before = JSON.stringify(sketch);

    const proposals = proposeSketchConstraints(sketch, {
      linearTolerance: 0.001,
      coincidenceTolerance: 0.001,
      tangentTolerance: 0.001,
    });

    expect(proposals.map((proposal) => proposal.constraint.type)).toContain('horizontal');
    expect(proposals.map((proposal) => proposal.constraint.type)).toContain('vertical');
    expect(
      proposals.some(
        (proposal) => proposal.constraint.type === 'horizontal' && proposal.constraint.lineId === 'horizontal',
      ),
    ).toBe(true);
    expect(
      proposals.some(
        (proposal) => proposal.constraint.type === 'vertical' && proposal.constraint.lineId === 'vertical',
      ),
    ).toBe(true);
    expect(JSON.stringify(sketch)).toBe(before);
  });

  it('proposes coincidence for distinct near points but not a point with itself', () => {
    const proposals = proposeSketchConstraints(inferenceSketch(), { coincidenceTolerance: 0.001 });
    const coincidences = proposals.filter((proposal) => proposal.constraint.type === 'coincident');

    expect(
      coincidences.some((proposal) => {
        if (proposal.constraint.type !== 'coincident') return false;
        return new Set([proposal.constraint.pointAId, proposal.constraint.pointBId]).size === 2
          && [proposal.constraint.pointAId, proposal.constraint.pointBId].includes('a0')
          && [proposal.constraint.pointAId, proposal.constraint.pointBId].includes('near-a0');
      }),
    ).toBe(true);
    expect(
      coincidences.every(
        (proposal) => proposal.constraint.type !== 'coincident' || proposal.constraint.pointAId !== proposal.constraint.pointBId,
      ),
    ).toBe(true);
  });

  it('proposes line-circle tangency when distance-to-line matches radius within tolerance', () => {
    const proposals = proposeSketchConstraints(inferenceSketch(), { tangentTolerance: 0.001 });

    expect(
      proposals.some(
        (proposal) =>
          proposal.constraint.type === 'tangent'
          && proposal.constraint.lineId === 'tangent-line'
          && proposal.constraint.circleId === 'circle',
      ),
    ).toBe(true);
  });

  it('does not re-propose equivalent constraints that already exist', () => {
    const sketch = inferenceSketch();
    sketch.constraints = [
      { id: 'existing-horizontal', type: 'horizontal', lineId: 'horizontal', enabled: true },
      { id: 'existing-coincident', type: 'coincident', pointAId: 'a0', pointBId: 'near-a0', enabled: false },
      { id: 'existing-tangent', type: 'tangent', lineId: 'tangent-line', circleId: 'circle', enabled: true },
    ];

    const proposals = proposeSketchConstraints(sketch, {
      linearTolerance: 0.001,
      coincidenceTolerance: 0.001,
      tangentTolerance: 0.001,
    });

    expect(
      proposals.some(
        (proposal) => proposal.constraint.type === 'horizontal' && proposal.constraint.lineId === 'horizontal',
      ),
    ).toBe(false);
    expect(
      proposals.some((proposal) => {
        if (proposal.constraint.type !== 'coincident') return false;
        return [proposal.constraint.pointAId, proposal.constraint.pointBId].includes('a0')
          && [proposal.constraint.pointAId, proposal.constraint.pointBId].includes('near-a0');
      }),
    ).toBe(false);
    expect(
      proposals.some(
        (proposal) =>
          proposal.constraint.type === 'tangent'
          && proposal.constraint.lineId === 'tangent-line'
          && proposal.constraint.circleId === 'circle',
      ),
    ).toBe(false);
  });

  it('orders proposals deterministically and exposes bounded confidence plus a user-facing reason', () => {
    const first = proposeSketchConstraints(inferenceSketch(), {
      linearTolerance: 0.001,
      coincidenceTolerance: 0.001,
      tangentTolerance: 0.001,
    });
    const second = proposeSketchConstraints(inferenceSketch(), {
      linearTolerance: 0.001,
      coincidenceTolerance: 0.001,
      tangentTolerance: 0.001,
    });

    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((proposal) => proposal.confidence >= 0 && proposal.confidence <= 1)).toBe(true);
    expect(first.every((proposal) => proposal.reason.trim().length > 0)).toBe(true);
    expect(first.every((proposal) => proposal.constraint.id.startsWith('proposal:'))).toBe(true);
  });
});