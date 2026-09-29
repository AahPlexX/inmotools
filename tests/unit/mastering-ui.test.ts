import { describe, expect, it } from 'vitest';
import { formatTime } from '../../src/tools/music/mastering-ui';

describe('formatTime', () => {
  it('shows minutes, seconds, and milliseconds', () => {
    expect(formatTime(0)).toBe('0:00.000');
    expect(formatTime(75.5)).toBe('1:15.500');
  });

  it('carries a rounded 60th second into the next minute', () => {
    expect(formatTime(59.9996)).toBe('1:00.000');
    expect(formatTime(119.9999)).toBe('2:00.000');
  });

  it('treats negative and non-finite input as zero', () => {
    expect(formatTime(-3)).toBe('0:00.000');
    expect(formatTime(Number.NaN)).toBe('0:00.000');
  });
});
