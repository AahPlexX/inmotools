import { describe, expect, it } from 'vitest';
import {
  acceptSketchConstraintProposal,
  proposeSketchConstraints,
  type SketchConstraintProposal,
} from '../../src/tools/cad/sketch-inference';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function nearHorizontalSketch(): CadSketch {
  return {
    id: 'inference-acceptance',
    label: 'Inference acceptance',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p1', type: 'point', x: 10, y: 0.0005, construction: false },
      { id: 'line', type: 'line', startPointId: 'p0', endPointId: 'p1', construction: false },
    ],
    constraints: [],
  };
}

function horizontalProposal(sketch: CadSketch): SketchConstraintProposal {
  const proposal = proposeSketchConstraints(sketch, { linearTolerance: 0.001 })
    .find((candidate) => candidate.constraint.type === 'horizontal');
  if (!proposal) throw new Error('Expected a horizontal proposal.');
  return proposal;
}

describe('CAD sketch inference acceptance', () => {
  it('explicitly accepts a current proposal and returns solved geometry without mutating the source sketch', () => {
    const sketch = nearHorizontalSketch();
    const before = JSON.stringify(sketch);
    const proposal = horizontalProposal(sketch);

    const accepted = acceptSketchConstraintProposal(sketch, proposal);
    const p0 = accepted.entities.find((entity) => entity.id === 'p0');
    const p1 = accepted.entities.find((entity) => entity.id === 'p1');

    expect(JSON.stringify(sketch)).toBe(before);
    expect(accepted.constraints).toContainEqual(proposal.constraint);
    expect(p0?.type).toBe('point');
    expect(p1?.type).toBe('point');
    if (p0?.type !== 'point' || p1?.type !== 'point') throw new Error('Missing accepted line points.');
    expect(p1.y - p0.y).toBeCloseTo(0, 8);
  });

  it('rejects a semantically duplicate relationship even when the existing constraint has a different id', () => {
    const sketch = nearHorizontalSketch();
    const proposal = horizontalProposal(sketch);
    const duplicate: CadSketch = {
      ...sketch,
      constraints: [{ id: 'manual-horizontal', type: 'horizontal', lineId: 'line', enabled: true }],
    };

    expect(() => acceptSketchConstraintProposal(duplicate, proposal)).toThrow(/already has an equivalent constraint/i);
  });

  it('rejects a stale proposal when the current sketch can no longer satisfy it', () => {
    const original = nearHorizontalSketch();
    const proposal = horizontalProposal(original);
    const stale: CadSketch = {
      ...original,
      entities: original.entities.map((entity) => {
        if (entity.id === 'p1' && entity.type === 'point') return { ...entity, y: 10 };
        return { ...entity };
      }),
      constraints: [
        { id: 'lock-p0', type: 'fixed-point', pointId: 'p0', x: 0, y: 0, enabled: true },
        { id: 'lock-p1', type: 'fixed-point', pointId: 'p1', x: 10, y: 10, enabled: true },
      ],
    };

    expect(() => acceptSketchConstraintProposal(stale, proposal)).toThrow(/no longer satisfiable/i);
    expect(stale.constraints).toHaveLength(2);
  });

  it('rejects fabricated proposal types that the inference engine never emits', () => {
    const sketch = nearHorizontalSketch();
    const fabricated: SketchConstraintProposal = {
      constraint: { id: 'proposal:fixed-point:p0', type: 'fixed-point', pointId: 'p0', x: 0, y: 0, enabled: true },
      confidence: 1,
      residual: 0,
      reason: 'Fabricated',
    };

    expect(() => acceptSketchConstraintProposal(sketch, fabricated)).toThrow(/not an accept-able inferred relationship/i);
  });
});
