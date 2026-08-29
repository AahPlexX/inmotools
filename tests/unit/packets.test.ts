import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes, matchLineRule } from '../../src/tools/hardware/packet-engine';

describe('hardware packet helpers', () => {
  it('round-trips byte packets through spaced hex', () => {
    const bytes = hexToBytes('0A ff 10');
    expect(Array.from(bytes)).toEqual([10, 255, 16]);
    expect(bytesToHex(bytes)).toBe('0A FF 10');
  });

  it('rejects malformed hex instead of truncating it', () => {
    expect(() => hexToBytes('ABC')).toThrow();
    expect(() => hexToBytes('GG')).toThrow();
  });

  it('applies regex highlight rules safely', () => {
    expect(matchLineRule('ERROR sensor timeout', { pattern: '^ERROR', label: 'error' })?.label).toBe('error');
    expect(matchLineRule('OK', { pattern: '[', label: 'bad' })).toBeNull();
  });
});
