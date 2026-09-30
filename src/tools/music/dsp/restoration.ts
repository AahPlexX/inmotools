/**
 * Time-domain restoration processors (ledgers 35–42).
 *
 * Gap repair uses autoregressive (AR) modelling: coefficients are estimated
 * with Burg's method from clean audio on both sides of a damaged span, the gap
 * is predicted forward from the left and backward from the right, and the two
 * predictions are cross-faded with a raised cosine. This reconstructs tonal
 * material far better than straight-line or spline fills for gaps of up to a
 * few milliseconds, and degrades gracefully beyond that.
 *
 * Detection of clicks and crackle works on the second difference of the signal
 * compared with a robust local scale (median absolute value), so loud passages
 * do not trigger false detections and quiet ones still reveal clicks.
 */
import type { PcmAudio } from '../mastering-engine';
import { Biquad, designBiquad } from './biquad';
import { EnvelopeFollower, LinkwitzRiley4, ThreeBandSplitter, compressorGainDb, dbToGain, expanderGainDb, gainToDb } from './dynamics';

// --- SECTION: AR modelling ---

/**
 * Burg AR coefficients `a` with a[0] = 1, so that
 * x[n] ≈ -(a[1]·x[n-1] + … + a[p]·x[n-p]).
 */
export function burgCoefficients(samples: ArrayLike<number>, order: number): Float64Array {
  const n = samples.length;
  const a = new Float64Array(order + 1);
  a[0] = 1;
  if (n <= order + 1) return a;
  const f = Float64Array.from(samples);
  const b = Float64Array.from(samples);
  for (let k = 0; k < order; k += 1) {
    let numerator = 0;
    let denominator = 0;
    for (let index = k + 1; index < n; index += 1) {
      numerator += f[index] * b[index - 1];
      denominator += f[index] * f[index] + b[index - 1] * b[index - 1];
    }
    const mu = denominator > 1e-20 ? -2 * numerator / denominator : 0;
    for (let i = 0; i <= (k + 1) / 2; i += 1) {
      const j = k + 1 - i;
      const left = a[i] + mu * a[j];
      const right = a[j] + mu * a[i];
      a[i] = left;
      a[j] = right;
    }
    for (let index = n - 1; index >= k + 1; index -= 1) {
      const forward = f[index] + mu * b[index - 1];
      const backward = b[index - 1] + mu * f[index];
      f[index] = forward;
      b[index] = backward;
    }
  }
  return a;
}

function predict(history: number[], a: Float64Array, count: number): number[] {
  const order = a.length - 1;
  const buffer = history.slice(-order);
  const output: number[] = [];
  for (let step = 0; step < count; step += 1) {
    let value = 0;
    for (let i = 1; i <= order; i += 1) value -= a[i] * (buffer[buffer.length - i] ?? 0);
    // Bound runaway predictions from unstable fits on unusual material.
    value = Math.max(-4, Math.min(4, value));
    output.push(value);
    buffer.push(value);
  }
  return output;
}

/**
 * Replaces `channel[start, start + length)` with an AR interpolation built from
 * up to `context` clean samples on each side. Mutates `channel`.
 */
export function interpolateArGap(channel: Float32Array, start: number, length: number, order = 32, context = 512) {
  if (length <= 0) return;
  const leftStart = Math.max(0, start - context);
  const rightEnd = Math.min(channel.length, start + length + context);
  const left = Array.from(channel.subarray(leftStart, start));
  const right = Array.from(channel.subarray(start + length, rightEnd));
  // Each direction gets its own model: joining both contexts would put an
  // artificial discontinuity at the seam and bias the fit.
  const fitOrder = (side: number[]) => Math.max(2, Math.min(order, Math.floor(side.length / 3)));
  const reversedRight = [...right].reverse();
  const forward = left.length > 6 ? predict(left, burgCoefficients(left, fitOrder(left)), length) : null;
  const backward = reversedRight.length > 6 ? predict(reversedRight, burgCoefficients(reversedRight, fitOrder(reversedRight)), length).reverse() : null;
  if (!forward && !backward) {
    const edge = left.at(-1) ?? right[0] ?? 0;
    for (let index = 0; index < length; index += 1) channel[start + index] = edge;
    return;
  }
  for (let index = 0; index < length; index += 1) {
    const weight = (1 - Math.cos(Math.PI * (index + 1) / (length + 1))) / 2;
    const value = forward && backward ? forward[index] * (1 - weight) + backward[index] * weight : (forward ?? backward)![index];
    channel[start + index] = value;
  }
}

// --- SECTION: click and crackle detection ---

export interface SampleRun { start: number; end: number }

/**
 * Finds impulsive runs whose second difference exceeds `threshold` times the
 * local median absolute second difference (1024-sample neighbourhoods).
 * Runs within 4 samples merge; each is padded by 2 samples; runs longer than
 * `maxRun` are dropped because they are musical transients, not clicks.
 */
export function detectImpulses(channel: Float32Array, threshold: number, maxRun: number): SampleRun[] {
  const length = channel.length;
  if (length < 8) return [];
  const diff = new Float32Array(length);
  for (let n = 2; n < length; n += 1) diff[n] = Math.abs(channel[n] - 2 * channel[n - 1] + channel[n - 2]);
  const block = 1024;
  const scales: number[] = [];
  for (let start = 0; start < length; start += block) {
    const values = Array.from(diff.subarray(start, Math.min(length, start + block))).sort((x, y) => x - y);
    scales.push(Math.max(1e-6, values[Math.floor(values.length / 2)] ?? 0));
  }
  const runs: SampleRun[] = [];
  let current: SampleRun | null = null;
  for (let n = 2; n < length; n += 1) {
    const blockIndex = Math.floor(n / block);
    const scale = Math.max(scales[blockIndex], (scales[blockIndex - 1] ?? scales[blockIndex]) * 0.5, (scales[blockIndex + 1] ?? scales[blockIndex]) * 0.5);
    if (diff[n] > threshold * scale) {
      if (current && n - current.end <= 4) current.end = n + 1;
      else { if (current) runs.push(current); current = { start: n, end: n + 1 }; }
    }
  }
  if (current) runs.push(current);
  return runs
    .map((run) => ({ start: Math.max(0, run.start - 2), end: Math.min(length, run.end + 2) }))
    .filter((run) => run.end - run.start <= maxRun);
}

/** Maps a 0–100 sensitivity to a detection threshold (higher sensitivity, lower threshold). */
export const sensitivityThreshold = (sensitivity: number, loose = 40, strict = 6) => {
  const s = Math.min(100, Math.max(0, sensitivity)) / 100;
  return loose * (strict / loose) ** s;
};

const copy = (audio: PcmAudio) => ({ sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => channel.slice()) });

/** Detects and interpolates clicks (ledger 36). Returns the repaired audio and the number of repairs. */
export function declick(audio: PcmAudio, sensitivity: number, maxClickMs: number): { audio: PcmAudio; repaired: number } {
  const output = copy(audio);
  const maxRun = Math.max(3, Math.round(maxClickMs / 1000 * audio.sampleRate));
  let repaired = 0;
  for (const channel of output.channels) {
    for (const run of detectImpulses(channel, sensitivityThreshold(sensitivity), maxRun)) {
      interpolateArGap(channel, run.start, run.end - run.start);
      repaired += 1;
    }
  }
  return { audio: output, repaired };
}

/**
 * Attenuates dense micro-crackle (ledger 38): very short impulses (≤ 4
 * samples) found at a lower threshold are pulled toward a 5-point median by
 * `amount` (0–1). Median smoothing suits dense crackle where AR repair of
 * every tick would be slow and could smear.
 */
export function decrackle(audio: PcmAudio, amount: number): PcmAudio {
  const output = copy(audio);
  const mix = Math.min(1, Math.max(0, amount));
  for (const [index, channel] of output.channels.entries()) {
    const source = audio.channels[index];
    for (const run of detectImpulses(source, sensitivityThreshold(70 + mix * 30, 20, 4), 8)) {
      for (let n = run.start; n < run.end; n += 1) {
        const window = [source[n - 2], source[n - 1], source[n], source[n + 1], source[n + 2]].filter((value) => value !== undefined).sort((a, b) => a - b);
        const median = window[Math.floor(window.length / 2)];
        channel[n] = source[n] + (median - source[n]) * mix;
      }
    }
  }
  return output;
}

/** Rebuilds a user-selected damaged span (ledger 42). Limited to 200 ms so the model stays meaningful. */
export function repairBurst(audio: PcmAudio, startSeconds: number, endSeconds: number): PcmAudio {
  const output = copy(audio);
  const length = output.channels[0]?.length ?? 0;
  const start = Math.max(0, Math.min(length, Math.round(Math.min(startSeconds, endSeconds) * audio.sampleRate)));
  const end = Math.max(start, Math.min(length, Math.round(Math.max(startSeconds, endSeconds) * audio.sampleRate)));
  if (end - start > Math.round(0.2 * audio.sampleRate)) throw new RangeError('Burst repair works on up to 200 ms at a time.');
  const context = Math.max(512, (end - start) * 4);
  for (const channel of output.channels) interpolateArGap(channel, start, end - start, 64, context);
  return output;
}

/**
 * De-clip (ledger 41): finds runs of two or more samples at or above
 * `levelPercent` of the channel's peak and reconstructs them with AR
 * interpolation. Reconstructed values keep the clipped sample's sign and are
 * at least the clip level, since the true waveform went past it.
 */
export function declip(audio: PcmAudio, levelPercent: number, maxRunMs = 5): { audio: PcmAudio; repaired: number } {
  const output = copy(audio);
  const maxRun = Math.max(2, Math.round(maxRunMs / 1000 * audio.sampleRate));
  let repaired = 0;
  for (const channel of output.channels) {
    let peak = 0;
    for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    const level = peak * Math.min(1, Math.max(0.5, levelPercent / 100));
    if (level <= 0) continue;
    let n = 0;
    while (n < channel.length) {
      if (Math.abs(channel[n]) < level) { n += 1; continue; }
      let end = n;
      while (end < channel.length && Math.abs(channel[end]) >= level && Math.sign(channel[end]) === Math.sign(channel[n])) end += 1;
      if (end - n >= 2 && end - n <= maxRun) {
        const sign = Math.sign(channel[n]);
        interpolateArGap(channel, n, end - n, 32, 256);
        for (let index = n; index < end; index += 1) {
          const value = channel[index];
          channel[index] = sign * (Math.sign(value) === sign ? Math.max(level, Math.abs(value)) : level);
        }
        repaired += 1;
      }
      n = Math.max(end, n + 1);
    }
  }
  return { audio: output, repaired };
}

// --- SECTION: filters and dynamics restoration ---

/** De-hum (ledger 35): narrow notches at the mains fundamental and its harmonics below Nyquist. */
export function dehum(audio: PcmAudio, fundamental: 50 | 60, harmonics: number): PcmAudio {
  const count = Math.max(1, Math.min(20, Math.trunc(harmonics)));
  const frequencies = Array.from({ length: count }, (_, index) => fundamental * (index + 1)).filter((frequency) => frequency < audio.sampleRate / 2 * 0.95);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => {
      const output = Float64Array.from(channel);
      // Q grows with the harmonic so each notch stays about 2 Hz wide.
      for (const frequency of frequencies) new Biquad(designBiquad('notch', frequency, audio.sampleRate, Math.max(10, frequency / 2))).process(output, output);
      return Float32Array.from(output);
    }),
  };
}

/**
 * Plosive/mouth-pop control (ledger 37): below `cutoffHz` the band is ducked
 * when its fast envelope rises more than `sensitivityDb` above its slow
 * average, by up to `reductionDb`. Steady bass is left alone; only sudden low
 * bursts are attenuated.
 */
export function deplosive(audio: PcmAudio, cutoffHz: number, sensitivityDb: number, reductionDb: number): PcmAudio {
  const rate = audio.sampleRate;
  return {
    sampleRate: rate,
    channels: audio.channels.map((channel) => {
      const crossover = new LinkwitzRiley4(cutoffHz, rate);
      const fast = new EnvelopeFollower(rate, 0.001, 0.06);
      const slow = new EnvelopeFollower(rate, 0.4, 0.4);
      const smoother = new EnvelopeFollower(rate, 0.002, 0.08);
      const output = new Float32Array(channel.length);
      for (let n = 0; n < channel.length; n += 1) {
        const [low, high] = crossover.split(channel[n]);
        const power = low * low;
        const excess = gainToDb(Math.sqrt(fast.next(power))) - gainToDb(Math.sqrt(slow.next(power)) + 1e-9);
        const target = Number.isFinite(excess) && excess > sensitivityDb ? Math.min(Math.abs(reductionDb), (excess - sensitivityDb) * 2) : 0;
        const reduction = smoother.next(target);
        output[n] = low * dbToGain(-reduction) + high;
      }
      return output;
    }),
  };
}

/**
 * Split-band de-esser (ledger 39): a band-pass side chain around
 * `frequencyHz` drives up to `rangeDb` of reduction on everything above
 * 0.75 × `frequencyHz`, leaving the lower spectrum untouched.
 */
export function deess(audio: PcmAudio, frequencyHz: number, thresholdDb: number, rangeDb: number): PcmAudio {
  const rate = audio.sampleRate;
  const detector = designBiquad('bandpass', frequencyHz, rate, 1.4);
  const followers = audio.channels.map(() => new EnvelopeFollower(rate, 0.0005, 0.05));
  const sidechains = audio.channels.map(() => new Biquad(detector));
  const crossovers = audio.channels.map(() => new LinkwitzRiley4(frequencyHz * 0.75, rate));
  const length = audio.channels[0]?.length ?? 0;
  const outputs = audio.channels.map(() => new Float32Array(length));
  for (let n = 0; n < length; n += 1) {
    // Linked detection: the louder channel sets the reduction so the image does not shift.
    let level = 0;
    audio.channels.forEach((channel, index) => { level = Math.max(level, followers[index].next(Math.abs(sidechains[index].processSample(channel[n])))); });
    const gain = dbToGain(Math.max(-Math.abs(rangeDb), compressorGainDb(gainToDb(level), thresholdDb, 4, 6)));
    audio.channels.forEach((channel, index) => {
      const [low, high] = crossovers[index].split(channel[n]);
      outputs[index][n] = low + high * gain;
    });
  }
  return { sampleRate: rate, channels: outputs };
}

export interface HissBand { thresholdDb: number; releaseMs: number }

/**
 * Three-band hiss gate / downward expander (ledger 40). Each band below its
 * threshold is expanded 1:3 down to `rangeDb`, with its own release time.
 */
export function hissGate(audio: PcmAudio, lowCrossover: number, highCrossover: number, bands: readonly HissBand[], rangeDb: number): PcmAudio {
  const rate = audio.sampleRate;
  const length = audio.channels[0]?.length ?? 0;
  return {
    sampleRate: rate,
    channels: audio.channels.map((channel) => {
      const splitter = new ThreeBandSplitter(lowCrossover, highCrossover, rate);
      const followers = [0, 1, 2].map((band) => new EnvelopeFollower(rate, 0.005, Math.max(5, bands[band]?.releaseMs ?? 150) / 1000));
      const output = new Float32Array(length);
      for (let n = 0; n < length; n += 1) {
        const parts = splitter.split(channel[n]);
        let sum = 0;
        for (let band = 0; band < 3; band += 1) {
          const level = 10 * Math.log10(followers[band].next(parts[band] * parts[band]) + 1e-20);
          sum += parts[band] * dbToGain(expanderGainDb(level, bands[band]?.thresholdDb ?? -60, 3, rangeDb, 4));
        }
        output[n] = sum;
      }
      return output;
    }),
  };
}
