import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  hexToBytes,
  matchLineRule,
  PacketStreamFramer,
  validateLineRule,
} from '../../src/tools/hardware/packet-engine';

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

  it('applies and validates regex highlight rules safely', () => {
    expect(matchLineRule('ERROR sensor timeout', { pattern: '^ERROR', label: 'error' })?.label).toBe('error');
    expect(matchLineRule('OK', { pattern: '[', label: 'bad' })).toBeNull();
    expect(validateLineRule({ pattern: '[', label: 'bad' })).toMatch(/unterminated|invalid|regular/i);
    expect(validateLineRule({ pattern: 'OK', label: 'ok' })).toBeNull();
  });

  it('preserves UTF-8 code points split across browser read chunks', () => {
    const bytes = new TextEncoder().encode('€');
    const framer = new PacketStreamFramer('chunk');
    const first = framer.push(bytes.slice(0, 1));
    const second = framer.push(bytes.slice(1, 2));
    const third = framer.push(bytes.slice(2));
    expect(first[0].text).toBe('');
    expect(second[0].text).toBe('');
    expect(third[0].text).toBe('€');
    expect(framer.flush()).toEqual([]);
  });

  it('reassembles newline frames and multibyte characters across arbitrary chunks', () => {
    const bytes = new TextEncoder().encode('price=10€\r\nnext=OK\n');
    const euroIndex = Array.from(bytes).findIndex((value) => value === 0xe2);
    const framer = new PacketStreamFramer('line');
    expect(framer.push(bytes.slice(0, euroIndex + 1))).toEqual([]);
    expect(framer.push(bytes.slice(euroIndex + 1, euroIndex + 2))).toEqual([]);
    const frames = framer.push(bytes.slice(euroIndex + 2));
    expect(frames.map((frame) => frame.text)).toEqual(['price=10€', 'next=OK']);
  });
});
