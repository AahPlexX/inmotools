import { describe, expect, it } from 'vitest';
import { parseObservedPattern, overlayResiduals } from '../../src/tools/crystal/observed-pattern-engine';

const XY = `# comment line
20.0 120
26.5 980
# mid comment
44.5 410
`;

describe('crystal observed pattern engine', () => {
  it('parses two-column xy data, skipping comments and blank lines', () => {
    const pattern = parseObservedPattern('obs.xy', XY, { xAxis: 'twoTheta' });
    expect(pattern.peaks).toHaveLength(3);
    expect(pattern.peaks[1]).toEqual({ position: 26.5, intensity: 980 });
    expect(pattern.xAxis).toBe('twoTheta');
  });

  it('accepts comma/semicolon separators', () => {
    const pattern = parseObservedPattern('obs.csv', '10,5\n12;8\n', { xAxis: 'd' });
    expect(pattern.peaks).toHaveLength(2);
    expect(pattern.xAxis).toBe('d');
  });

  it('rejects empty, single-column, non-finite, and unsorted input', () => {
    expect(() => parseObservedPattern('a.xy', '', { xAxis: 'twoTheta' })).toThrow(RangeError);
    expect(() => parseObservedPattern('a.xy', '20\n', { xAxis: 'twoTheta' })).toThrow(RangeError);
    expect(() => parseObservedPattern('a.xy', '20 10\n10 5\n', { xAxis: 'twoTheta' })).toThrow(RangeError);
    expect(() => parseObservedPattern('a.xy', '20 abc\n', { xAxis: 'twoTheta' })).toThrow(RangeError);
    expect(() => parseObservedPattern('a.xy', '20 -5\n', { xAxis: 'twoTheta' })).toThrow(RangeError);
  });

  it('computes nearest-peak residuals between observed and simulated positions', () => {
    const observed = parseObservedPattern('obs.xy', XY, { xAxis: 'twoTheta' });
    const residuals = overlayResiduals(observed, [20.1, 26.4, 44.6]);
    expect(residuals).toHaveLength(3);
    expect(residuals[1]!.delta).toBeCloseTo(-0.1, 10);
    expect(residuals[0]!.matchedPosition).toBeCloseTo(20.1, 10);
  });
});
