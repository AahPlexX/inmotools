/**
 * Message contract between the Mastering UI thread and its DSP worker.
 * Both sides import these types so a changed field fails the type check on both ends.
 */
import type { RenderResult } from './mastering-dsp-engine';
import type { MasteringDocument } from './mastering-project';

export type DspRequest =
  | { type: 'loadSource'; requestId: number; sourceId: string; sampleRate: number; channels: Float32Array[]; projectRate: number }
  | { type: 'releaseSource'; requestId: number; sourceId: string }
  | { type: 'releaseAll'; requestId: number }
  | { type: 'render'; requestId: number; document: MasteringDocument }
  | { type: 'snap'; requestId: number; document: MasteringDocument; clipId: string; seconds: number[]; radius?: number }
  | { type: 'slice'; requestId: number; document: MasteringDocument; clipId: string; startFrame: number; frameCount: number };

export type DspResponse =
  | { type: 'sourceLoaded'; requestId: number; frameCount: number; channelCount: number }
  | { type: 'released'; requestId: number }
  | { type: 'rendered'; requestId: number; result: RenderResult }
  | { type: 'superseded'; requestId: number }
  | { type: 'snapped'; requestId: number; seconds: number[] }
  | { type: 'sliced'; requestId: number; startFrame: number; channels: Float32Array[] }
  | { type: 'error'; requestId: number; message: string };
