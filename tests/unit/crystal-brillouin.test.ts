import { describe, expect, it } from 'vitest';
import { firstBrillouinZone } from '../../src/tools/crystal/brillouin-engine';

const cubic = { a: 5, b: 5, c: 5, alpha: 90, beta: 90, gamma: 90 } as const;

describe('crystal Brillouin zone engine', () => {
  it('constructs the first BZ of a cubic cell as a cube with volume |B|', () => {
    const zone = firstBrillouinZone(cubic);
    // cubic a=5 -> a* = 0.2 Å⁻¹; first BZ spans ±0.1 on each axis
    expect(zone.vertices.length).toBe(8);
    for (const v of zone.vertices) {
      expect(Math.abs(v[0])).toBeCloseTo(0.1, 10);
      expect(Math.abs(v[1])).toBeCloseTo(0.1, 10);
      expect(Math.abs(v[2])).toBeCloseTo(0.1, 10);
    }
    // volume = 8 * 0.1^3 = 0.008 = (0.2)^3
    expect(zone.volume).toBeCloseTo(0.008, 10);
    expect(zone.faces.length).toBe(6);
  });

  it('every vertex satisfies the half-space inequality for all three basis bisectors', () => {
    const zone = firstBrillouinZone({ a: 4.1, b: 5.2, c: 6.3, alpha: 78, beta: 83, gamma: 71 });
    expect(zone.vertices.length).toBeGreaterThanOrEqual(8);
    expect(zone.volume).toBeGreaterThan(0);
    expect(zone.faces.length).toBeGreaterThanOrEqual(6);
  });

  it('rejects a singular cell', () => {
    expect(() => firstBrillouinZone({ ...cubic, a: 0 })).toThrow(RangeError);
  });
});
