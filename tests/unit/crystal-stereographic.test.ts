import { describe, expect, it } from 'vitest';
import { stereographicPole, stereographicProjection } from '../../src/tools/crystal/stereographic-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;

describe('crystal stereographic engine', () => {
  it('projects the (001) pole to the center and (100)/(010) to the primitive circle', () => {
    const center = stereographicPole(cubic, [0, 0, 1]);
    expect(center.x).toBeCloseTo(0, 10);
    expect(center.y).toBeCloseTo(0, 10);
    const east = stereographicPole(cubic, [1, 0, 0]);
    expect(Math.hypot(east.x, east.y)).toBeCloseTo(1, 10);
    const north = stereographicPole(cubic, [0, 1, 0]);
    expect(Math.hypot(north.x, north.y)).toBeCloseTo(1, 10);
    // orthogonal cubic axes must sit 90° apart on the circle
    expect(Math.abs(east.x * north.x + east.y * north.y)).toBeCloseTo(0, 10);
  });

  it('projects (111) inside the primitive circle at the correct angular radius', () => {
    const pole = stereographicPole(cubic, [1, 1, 1]);
    // (111) normal is 54.7356° from (001); stereographic radius = tan(θ/2)
    const theta = Math.acos(1 / Math.sqrt(3));
    expect(Math.hypot(pole.x, pole.y)).toBeCloseTo(Math.tan(theta / 2), 8);
  });

  it('projects a batch of reflections and rejects degenerate input', () => {
    const poles = stereographicProjection(cubic, [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]]);
    expect(poles).toHaveLength(4);
    expect(() => stereographicPole(cubic, [0, 0, 0])).toThrow(RangeError);
  });
});
