import { describe, expect, it } from 'vitest';
import {
  buildBfdhMorphology,
  buildWulffMorphology,
  transformMorphology,
} from '../../src/tools/crystal/morphology-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;
const boundingFacets = [
  { hkl: [1, 0, 0] as const, included: true },
  { hkl: [0, 1, 0] as const, included: true },
  { hkl: [0, 0, 1] as const, included: true },
];

describe('crystal morphology engine', () => {
  it('builds BFDH and Wulff polyhedra with inspectable facets and deterministic twin transforms', () => {
    const bfdh = buildBfdhMorphology(cubic, boundingFacets);
    expect(bfdh.vertices).toHaveLength(8);
    expect(bfdh.faces).toHaveLength(6);
    expect(bfdh.faces.every((face) => face.area > 0 && face.dSpacing > 0)).toBe(true);
    expect(bfdh.faces.reduce((sum, face) => sum + face.relativeArea, 0)).toBeCloseTo(1, 10);
    expect(bfdh.method).toBe('bfdh');

    const wulff = buildWulffMorphology(cubic, [
      { hkl: [1, 0, 0], energy: 1, included: true },
      { hkl: [0, 1, 0], energy: 2, included: true },
      { hkl: [0, 0, 1], energy: 3, included: true },
      { hkl: [1, 1, 1], energy: 5, included: false },
    ]);
    expect(wulff.method).toBe('wulff');
    expect(wulff.faces.every((face) => face.suppliedEnergy !== undefined)).toBe(true);
    expect(wulff.faces.some((face) => face.hkl.join(',') === '1,1,1')).toBe(false);

    const swapped = transformMorphology(bfdh, [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ]);
    expect(swapped.vertices).toHaveLength(bfdh.vertices.length);
    expect(swapped.vertices[0]![0]).toBeCloseTo(bfdh.vertices[0]![1], 10);
    expect(swapped.vertices[0]![1]).toBeCloseTo(bfdh.vertices[0]![0], 10);
  });
});
