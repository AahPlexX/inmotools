import { describe, expect, it } from 'vitest';
import {
  resolveTopologyRef,
  scoreTopologyCandidate,
  type CadTopologyRef,
  type TopologyCandidate,
} from '../../src/tools/cad/topology-ref';

const ref: CadTopologyRef = {
  id: 'ref-top-face',
  producerFeatureId: 'extrude-1',
  kind: 'face',
  role: 'top',
  surfaceType: 'plane',
  centroid: [10, 5, 20],
  normal: [0, 0, 1],
  area: 200,
  bounds: { min: [0, 0, 20], max: [20, 10, 20] },
  adjacencyRoles: ['side-x+', 'side-x-', 'side-y+', 'side-y-'],
  pickPoint: [10, 5, 20],
};

const exact: TopologyCandidate = {
  id: 'candidate-top',
  producerFeatureId: 'extrude-1',
  kind: 'face',
  surfaceType: 'plane',
  centroid: [10, 5, 20],
  normal: [0, 0, 1],
  area: 200,
  bounds: { min: [0, 0, 20], max: [20, 10, 20] },
  adjacencyRoles: ['side-x+', 'side-x-', 'side-y+', 'side-y-'],
};

describe('CAD semantic topology references', () => {
  it('resolves the uniquely best semantic candidate without relying on a raw sub-shape ordinal', () => {
    const distant: TopologyCandidate = {
      ...exact,
      id: 'candidate-bottom',
      centroid: [10, 5, 0],
      normal: [0, 0, -1],
      bounds: { min: [0, 0, 0], max: [20, 10, 0] },
    };

    const result = resolveTopologyRef(ref, [distant, exact]);
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') expect(result.candidate.id).toBe('candidate-top');
    expect(scoreTopologyCandidate(ref, exact)).toBeGreaterThan(scoreTopologyCandidate(ref, distant));
  });

  it('reports ambiguity instead of silently choosing between equally plausible candidates', () => {
    const duplicate = { ...exact, id: 'candidate-top-copy' };
    const result = resolveTopologyRef(ref, [exact, duplicate]);
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.candidates.map((candidate) => candidate.id)).toEqual(['candidate-top', 'candidate-top-copy']);
    }
  });

  it('reports missing when provenance and topology kind do not match', () => {
    const wrongProducer = { ...exact, id: 'other', producerFeatureId: 'extrude-2' };
    expect(resolveTopologyRef(ref, [wrongProducer])).toEqual({ status: 'missing' });
  });

  it('does not use an injected raw ordinal as a tie breaker', () => {
    const first = { ...exact, id: 'same-a', ordinal: 1 } as TopologyCandidate & { ordinal: number };
    const second = { ...exact, id: 'same-b', ordinal: 99 } as TopologyCandidate & { ordinal: number };
    const result = resolveTopologyRef(ref, [first, second]);
    expect(result.status).toBe('ambiguous');
  });
});
