export interface LineRule { pattern: string; label: string }
export type PacketFramingMode = 'chunk' | 'line';
export interface FramedPacket { bytes: Uint8Array; text: string }

export const DEFAULT_MAX_FRAME_BYTES = 64 * 1024;

export class PacketFrameLimitError extends Error {
  constructor(
    readonly maxFrameBytes: number,
    readonly completedFrames: FramedPacket[] = [],
  ) {
    super(`Newline frame exceeded the configured ${maxFrameBytes.toLocaleString()}-byte maximum.`);
    this.name = 'PacketFrameLimitError';
  }
}

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
  if (!left.length) return right.slice();
  if (!right.length) return left.slice();
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

  constructor(
    readonly mode: PacketFramingMode,
    readonly maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
  ) {
    if (!Number.isInteger(maxFrameBytes) || maxFrameBytes <= 0) {
      throw new Error('Maximum frame size must be a positive whole number of bytes.');
    }
  }

  private frameLimitError(completedFrames: FramedPacket[]) {
    this.lineBuffer = new Uint8Array();
    return new PacketFrameLimitError(this.maxFrameBytes, completedFrames.slice());
  }

  push(chunk: Uint8Array): FramedPacket[] {
    if (this.mode === 'chunk') {
      return [{ bytes: chunk.slice(), text: this.decoder.decode(chunk, { stream: true }) }];
    }

    const frames: FramedPacket[] = [];
    let segmentStart = 0;
    for (let index = 0; index < chunk.length; index += 1) {
      if (chunk[index] !== 0x0a) continue;
      const segment = chunk.slice(segmentStart, index);
      const combined = concatBytes(this.lineBuffer, segment);
      this.lineBuffer = new Uint8Array();
      if (combined.length > this.maxFrameBytes) throw this.frameLimitError(frames);
      let frameEnd = combined.length;
      if (frameEnd > 0 && combined[frameEnd - 1] === 0x0d) frameEnd -= 1;
      const bytes = combined.slice(0, frameEnd);
      frames.push({ bytes, text: new TextDecoder().decode(bytes) });
      segmentStart = index + 1;
    }

    const remainder = chunk.slice(segmentStart);
    if (remainder.length) {
      if (this.lineBuffer.length + remainder.length > this.maxFrameBytes) throw this.frameLimitError(frames);
      this.lineBuffer = concatBytes(this.lineBuffer, remainder);
    }
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
