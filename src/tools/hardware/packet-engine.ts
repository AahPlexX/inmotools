export interface LineRule { pattern: string; label: string }

export function hexToBytes(input: string): Uint8Array {
  const compact = input.replace(/\s+/g, '');
  if (compact.length === 0) return new Uint8Array();
  if (compact.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(compact)) throw new Error('Enter complete hexadecimal byte pairs.');
  return new Uint8Array(compact.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
}

export function bytesToHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function matchLineRule(line: string, rule: LineRule): LineRule | null {
  try { return new RegExp(rule.pattern).test(line) ? rule : null; } catch { return null; }
}
