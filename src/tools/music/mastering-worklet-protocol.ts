/**
 * Messages between the Mastering UI thread and its AudioWorklet processor.
 * Shared by both sides so a changed field fails the type check on both.
 */
import type { ChainTelemetry, MasterSettings } from './dsp/master-chain';
import type { LoudnessReading } from './dsp/loudness';
import type { LevelReading } from './dsp/meters';

/** What the monitor plays: the processed master, the aligned original, their difference, or the reference track. */
export type ListenSource = 'processed' | 'original' | 'delta' | 'reference';
/** Monitor matrix applied after source selection (ledger 60). */
export type MonitorMode = 'stereo' | 'mid' | 'side' | 'left' | 'right';

export type WorkletInbound =
  | { type: 'settings'; settings: MasterSettings }
  | { type: 'monitor'; listen: ListenSource; monitor: MonitorMode; mono: boolean; matchLoudness: boolean; excursionThresholdDb: number }
  | { type: 'resetMeters' };

export interface WorkletMeterMessage {
  type: 'meters';
  /** AudioContext time at the end of the block that produced these readings. */
  time: number;
  loudness: LoudnessReading;
  inputShortTerm: number;
  referenceShortTerm: number;
  levels: LevelReading;
  correlation: number;
  goniometer: Float32Array;
  telemetry: ChainTelemetry;
  latencyFrames: number;
  excursions: Array<{ time: number; truePeakDb: number }>;
}
