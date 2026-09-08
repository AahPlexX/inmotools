export interface LineRule { pattern: string; label: string }
export type PacketFramingMode = 'chunk' | 'line';
export interface FramedPacket { bytes: Uint8Array; text: string }

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

export function validateLineRule(rule: LineRule): string | null {
  if (!rule.label.trim()) return 'Label is required.';
  if (!rule.pattern.trim()) return 'Pattern is required.';
  try {
    new RegExp(rule.pattern);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid regular expression.';
  }
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const output = new Uint8Array(left.length + right.length);
  output.set(left);
  output.set(right, left.length);
  return output;
}

/**
 * Stateful framing keeps UTF-8 decoder state and line bytes across serial reads.
 * A multi-byte code point or line can therefore span arbitrary stream chunks.
 */
export class PacketStreamFramer {
  private readonly decoder = new TextDecoder();
  private lineBuffer = new Uint8Array();

  constructor(readonly mode: PacketFramingMode) {}

  push(chunk: Uint8Array): FramedPacket[] {
    if (this.mode === 'chunk') {
      return [{ bytes: chunk.slice(), text: this.decoder.decode(chunk, { stream: true }) }];
    }

    this.lineBuffer = concatBytes(this.lineBuffer, chunk);
    const frames: FramedPacket[] = [];
    let frameStart = 0;
    for (let index = 0; index < this.lineBuffer.length; index += 1) {
      if (this.lineBuffer[index] !== 0x0a) continue;
      let frameEnd = index;
      if (frameEnd > frameStart && this.lineBuffer[frameEnd - 1] === 0x0d) frameEnd -= 1;
      const bytes = this.lineBuffer.slice(frameStart, frameEnd);
      frames.push({ bytes, text: new TextDecoder().decode(bytes) });
      frameStart = index + 1;
    }
    if (frameStart > 0) this.lineBuffer = this.lineBuffer.slice(frameStart);
    return frames;
  }

  flush(): FramedPacket[] {
    if (this.mode === 'chunk') {
      const text = this.decoder.decode();
      return text ? [{ bytes: new Uint8Array(), text }] : [];
    }
    if (!this.lineBuffer.length) return [];
    const bytes = this.lineBuffer;
    this.lineBuffer = new Uint8Array();
    return [{ bytes, text: new TextDecoder().decode(bytes) }];
  }
}
