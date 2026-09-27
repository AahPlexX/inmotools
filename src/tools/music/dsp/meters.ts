/**
 * Level, crest, and stereo-image meters (ledgers 62, 64, 67).
 *
 * `LevelMeter` tracks sample peak and RMS per channel over the last 400 ms
 * (matching the momentary loudness window) plus programme totals, and derives
 * crest factor as peak minus RMS in dB. `CorrelationMeter` reports the
 * normalized L/R correlation over a sliding window: +1 fully mono-compatible,
 * 0 unrelated, -1 out of phase. `goniometerPoints` maps L/R pairs to the
 * rotated Mid/Side display used by a Lissajous vectorscope.
 */

const toDb = (linear: number) => linear > 0 ? 20 * Math.log10(linear) : -Infinity;

export interface LevelReading {
  peakDb: number[];
  rmsDb: number[];
  crestDb: number[];
  programPeakDb: number[];
  programRmsDb: number[];
  programCrestDb: number[];
}

/** Sliding sum of squares over a fixed frame window, updated per block in O(block). */
class SlidingSquares {
  private readonly ring: Float64Array;
  private position = 0;
  private filled = 0;
  sum = 0;
  constructor(frames: number) { this.ring = new Float64Array(Math.max(1, frames)); }
  push(value: number) {
    const square = value * value;
    this.sum += square - this.ring[this.position];
    this.ring[this.position] = square;
    this.position = (this.position + 1) % this.ring.length;
    if (this.filled < this.ring.length) this.filled += 1;
  }
  mean() {
    // Re-summing occasionally would remove float drift, but the window is short
    // and resets with the meter; clamping keeps tiny negative drift out of sqrt.
    return this.filled ? Math.max(0, this.sum) / this.filled : 0;
  }
  reset() { this.ring.fill(0); this.position = 0; this.filled = 0; this.sum = 0; }
}

export class LevelMeter {
  private readonly windows: SlidingSquares[];
  private readonly windowPeaks: Float64Array[];
  private peakPosition = 0;
  private readonly programSquares: number[];
  private readonly programPeaks: number[];
  private programFrames = 0;
  private readonly peakWindowFrames: number;

  constructor(readonly sampleRate: number, readonly channelCount: number, windowSeconds = 0.4) {
    const frames = Math.max(1, Math.round(sampleRate * windowSeconds));
    this.peakWindowFrames = frames;
    this.windows = Array.from({ length: channelCount }, () => new SlidingSquares(frames));
    this.windowPeaks = Array.from({ length: channelCount }, () => new Float64Array(frames));
    this.programSquares = Array.from({ length: channelCount }, () => 0);
    this.programPeaks = Array.from({ length: channelCount }, () => 0);
  }

  reset() {
    for (const window of this.windows) window.reset();
    for (const peaks of this.windowPeaks) peaks.fill(0);
    this.peakPosition = 0;
    this.programSquares.fill(0);
    this.programPeaks.fill(0);
    this.programFrames = 0;
  }

  process(channels: readonly ArrayLike<number>[], length = channels[0]?.length ?? 0) {
    for (let index = 0; index < length; index += 1) {
      for (let channel = 0; channel < this.channelCount; channel += 1) {
        const sample = channels[channel][index];
        const magnitude = Math.abs(sample);
        this.windows[channel].push(sample);
        this.windowPeaks[channel][this.peakPosition] = magnitude;
        this.programSquares[channel] += sample * sample;
        if (magnitude > this.programPeaks[channel]) this.programPeaks[channel] = magnitude;
      }
      this.peakPosition = (this.peakPosition + 1) % this.peakWindowFrames;
    }
    this.programFrames += length;
  }

  reading(): LevelReading {
    const peakDb = this.windowPeaks.map((peaks) => toDb(peaks.reduce((max, value) => value > max ? value : max, 0)));
    const rmsDb = this.windows.map((window) => toDb(Math.sqrt(window.mean())));
    const programPeakDb = this.programPeaks.map(toDb);
    const programRmsDb = this.programSquares.map((sum) => toDb(this.programFrames ? Math.sqrt(sum / this.programFrames) : 0));
    const crest = (peaks: number[], rms: number[]) => peaks.map((peak, index) => Number.isFinite(peak) && Number.isFinite(rms[index]) ? peak - rms[index] : 0);
    return { peakDb, rmsDb, crestDb: crest(peakDb, rmsDb), programPeakDb, programRmsDb, programCrestDb: crest(programPeakDb, programRmsDb) };
  }
}

export class CorrelationMeter {
  private readonly ring: Float64Array;
  private position = 0;
  private sumLR = 0;
  private sumLL = 0;
  private sumRR = 0;
  private readonly frames: number;

  constructor(sampleRate: number, windowSeconds = 0.3) {
    this.frames = Math.max(1, Math.round(sampleRate * windowSeconds));
    this.ring = new Float64Array(this.frames * 3);
  }

  reset() { this.ring.fill(0); this.position = 0; this.sumLR = 0; this.sumLL = 0; this.sumRR = 0; }

  process(left: ArrayLike<number>, right: ArrayLike<number>, length = left.length) {
    for (let index = 0; index < length; index += 1) {
      const l = left[index];
      const r = right[index];
      const slot = this.position * 3;
      this.sumLR += l * r - this.ring[slot];
      this.sumLL += l * l - this.ring[slot + 1];
      this.sumRR += r * r - this.ring[slot + 2];
      this.ring[slot] = l * r;
      this.ring[slot + 1] = l * l;
      this.ring[slot + 2] = r * r;
      this.position = (this.position + 1) % this.frames;
    }
  }

  /** Normalized correlation in [-1, 1]; 0 when either side is silent. */
  value(): number {
    const denominator = Math.sqrt(Math.max(0, this.sumLL) * Math.max(0, this.sumRR));
    return denominator > 1e-12 ? Math.max(-1, Math.min(1, this.sumLR / denominator)) : 0;
  }
}

/**
 * Converts L/R sample pairs to goniometer coordinates: x = side, y = mid, each
 * scaled by 1/√2 so a full-scale mono signal draws a vertical line of length 2.
 */
export function goniometerPoints(left: ArrayLike<number>, right: ArrayLike<number>, maxPoints = 1024): Float32Array {
  const length = Math.min(left.length, right.length);
  const step = Math.max(1, Math.floor(length / maxPoints));
  const count = Math.floor(length / step);
  const points = new Float32Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    const l = left[index * step];
    const r = right[index * step];
    points[index * 2] = (r - l) * Math.SQRT1_2;
    points[index * 2 + 1] = (l + r) * Math.SQRT1_2;
  }
  return points;
}
