/**
 * Realtime mastering processor (AudioWorklet).
 *
 * Input 0 is the pre-master mix; input 1 is an optional reference track.
 * The mix runs through the shared `MasterChain`, so audition matches the
 * offline render. Monitoring (ledgers 60, 61, 68–71) happens after the chain:
 * listen to the processed master, the latency-aligned original, the delta
 * (processed − original), or the reference; switch with a 20 ms equal-power
 * crossfade; optionally match loudness to the processed master; and route
 * through a stereo / mono / mid / side / left / right monitor matrix.
 * Meters always read the processed master, not the monitor output, and are
 * posted about ten times per second.
 */
import { MasterChain, type MasterSettings } from './dsp/master-chain';
import { LoudnessMeter } from './dsp/loudness';
import { CorrelationMeter, LevelMeter } from './dsp/meters';
import type { ListenSource, MonitorMode, WorkletInbound, WorkletMeterMessage } from './mastering-worklet-protocol';

// Module-local declarations of the AudioWorkletGlobalScope API (MDN), which the
// project's DOM/WebWorker TypeScript libs do not include.
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

const CROSSFADE_SECONDS = 0.02;
const METER_INTERVAL_SECONDS = 0.1;
const GONIOMETER_POINTS = 512;

class DelayBuffer {
  private buffer: Float32Array;
  private position = 0;
  constructor(private length: number) { this.buffer = new Float32Array(Math.max(1, length + 1)); }
  resize(length: number) {
    if (length === this.length) return;
    this.length = length;
    this.buffer = new Float32Array(Math.max(1, length + 1));
    this.position = 0;
  }
  next(value: number): number {
    if (this.length === 0) return value;
    this.buffer[this.position] = value;
    this.position = (this.position + 1) % this.buffer.length;
    return this.buffer[this.position];
  }
}

class MasterProcessor extends AudioWorkletProcessor {
  private readonly chain = new MasterChain(sampleRate);
  private readonly dry = [new DelayBuffer(0), new DelayBuffer(0)];
  private listen: ListenSource = 'processed';
  private monitor: MonitorMode = 'stereo';
  private mono = false;
  private matchLoudness = false;
  private excursionThresholdDb = -1;
  /** Current and target weights for processed / original / delta / reference (crossfaded). */
  private weights = { processed: 1, original: 0, delta: 0, reference: 0 };
  private readonly fadeStep = 1 / Math.max(1, CROSSFADE_SECONDS * sampleRate);
  private readonly processedMeter = new LoudnessMeter(sampleRate, 2);
  private readonly originalMeter = new LoudnessMeter(sampleRate, 2);
  private readonly referenceMeter = new LoudnessMeter(sampleRate, 2);
  private readonly inputMeter = new LoudnessMeter(sampleRate, 2);
  private readonly levels = new LevelMeter(sampleRate, 2);
  private readonly correlation = new CorrelationMeter(sampleRate);
  private readonly goniometer = new Float32Array(GONIOMETER_POINTS * 2);
  private goniometerPosition = 0;
  private sinceMeter = 0;
  private excursions: Array<{ time: number; truePeakDb: number }> = [];
  private lastExcursionTime = -Infinity;
  private lastTruePeak = -Infinity;
  private buffers = { l: new Float32Array(128), r: new Float32Array(128), dl: new Float32Array(128), dr: new Float32Array(128) };

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletInbound>) => this.receive(event.data);
  }

  private receive(message: WorkletInbound) {
    if (message.type === 'settings') {
      this.chain.update(message.settings as MasterSettings);
      const latency = this.chain.latency;
      for (const delay of this.dry) delay.resize(latency);
    } else if (message.type === 'monitor') {
      this.listen = message.listen;
      this.monitor = message.monitor;
      this.mono = message.mono;
      this.matchLoudness = message.matchLoudness;
      this.excursionThresholdDb = message.excursionThresholdDb;
    } else if (message.type === 'resetMeters') {
      for (const meter of [this.processedMeter, this.originalMeter, this.referenceMeter, this.inputMeter]) meter.reset();
      this.levels.reset();
      this.correlation.reset();
      this.excursions = [];
      this.lastTruePeak = -Infinity;
      this.lastExcursionTime = -Infinity;
    }
  }

  /** Gain (linear) that brings a comparison source to the processed master's short-term loudness. */
  private matchGain(meter: LoudnessMeter): number {
    if (!this.matchLoudness) return 1;
    const processed = this.processedMeter.shortTermLufs();
    const other = meter.shortTermLufs();
    if (!Number.isFinite(processed) || !Number.isFinite(other)) return 1;
    return 10 ** (Math.max(-24, Math.min(24, processed - other)) / 20);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const frames = output[0]?.length ?? 128;
    if (this.buffers.l.length < frames) this.buffers = { l: new Float32Array(frames), r: new Float32Array(frames), dl: new Float32Array(frames), dr: new Float32Array(frames) };
    const { l, r, dl, dr } = this.buffers;
    const mix = inputs[0] ?? [];
    const reference = inputs[1] ?? [];
    const inLeft = mix[0];
    const inRight = mix[1] ?? mix[0];
    for (let n = 0; n < frames; n += 1) {
      const left = inLeft ? inLeft[n] : 0;
      const right = inRight ? inRight[n] : 0;
      l[n] = left; r[n] = right;
      dl[n] = this.dry[0].next(left);
      dr[n] = this.dry[1].next(right);
    }
    this.inputMeter.process([l, r], frames);
    this.chain.process(l, r, frames);

    // Meters read the processed master.
    this.processedMeter.process([l, r], frames);
    this.originalMeter.process([dl, dr], frames);
    const refLeft = reference[0];
    const refRight = reference[1] ?? reference[0];
    if (refLeft) this.referenceMeter.process([refLeft, refRight], frames);
    this.levels.process([l, r], frames);
    this.correlation.process(l, r, frames);
    for (let n = 0; n < frames; n += 4) {
      this.goniometer[this.goniometerPosition * 2] = (r[n] - l[n]) * Math.SQRT1_2;
      this.goniometer[this.goniometerPosition * 2 + 1] = (l[n] + r[n]) * Math.SQRT1_2;
      this.goniometerPosition = (this.goniometerPosition + 1) % GONIOMETER_POINTS;
    }

    // Monitoring: crossfade the four sources toward the selected one.
    const originalGain = this.matchGain(this.originalMeter);
    const referenceGain = this.matchGain(this.referenceMeter);
    const outLeft = output[0];
    const outRight = output[1] ?? output[0];
    for (let n = 0; n < frames; n += 1) {
      for (const key of ['processed', 'original', 'delta', 'reference'] as const) {
        const target = this.listen === key ? 1 : 0;
        const current = this.weights[key];
        this.weights[key] = current < target ? Math.min(target, current + this.fadeStep) : Math.max(target, current - this.fadeStep);
      }
      // Equal-power weights: sin of the linear ramp keeps loudness steady through a switch.
      const w = (value: number) => Math.sin(value * Math.PI / 2);
      const wp = w(this.weights.processed), wo = w(this.weights.original), wd = w(this.weights.delta), wr = w(this.weights.reference);
      let left = l[n] * wp + dl[n] * originalGain * wo + (l[n] - dl[n]) * wd;
      let right = r[n] * wp + dr[n] * originalGain * wo + (r[n] - dr[n]) * wd;
      if (refLeft) { left += refLeft[n] * referenceGain * wr; right += (refRight ?? refLeft)[n] * referenceGain * wr; }
      const mid = (left + right) / 2;
      const side = (left - right) / 2;
      switch (this.monitor) {
        case 'mid': left = mid; right = mid; break;
        case 'side': left = side; right = -side; break;
        case 'left': right = left; break;
        case 'right': left = right; break;
        default: break;
      }
      // Mono compatibility (ledger 61): what a mono speaker would play, after the matrix.
      if (this.mono) { const sum = (left + right) / 2; left = sum; right = sum; }
      outLeft[n] = left;
      if (outRight !== outLeft) outRight[n] = right;
    }

    // True-peak excursions (ledger 66): the running max only rises, so a rise
    // above the threshold marks a new excursion; events within 250 ms merge.
    const truePeak = this.processedMeter.maxTruePeakDb();
    if (truePeak > this.lastTruePeak && truePeak > this.excursionThresholdDb && currentTime - this.lastExcursionTime > 0.25) {
      this.excursions.push({ time: currentTime, truePeakDb: truePeak });
      this.lastExcursionTime = currentTime;
      if (this.excursions.length > 200) this.excursions.shift();
    }
    this.lastTruePeak = Math.max(this.lastTruePeak, truePeak);
    this.sinceMeter += frames / sampleRate;
    if (this.sinceMeter >= METER_INTERVAL_SECONDS) {
      this.sinceMeter = 0;
      this.post();
    }
    return true;
  }

  private post() {
    const reading = this.processedMeter.reading();
    const message: WorkletMeterMessage = {
      type: 'meters',
      time: currentTime,
      loudness: reading,
      inputShortTerm: this.inputMeter.reading().shortTerm,
      referenceShortTerm: this.referenceMeter.reading().shortTerm,
      levels: this.levels.reading(),
      correlation: this.correlation.value(),
      goniometer: this.goniometer.slice(),
      telemetry: this.chain.telemetry,
      latencyFrames: this.chain.latency,
      excursions: this.excursions.slice(),
    };
    this.port.postMessage(message);
  }
}

registerProcessor('mastering-master', MasterProcessor);
