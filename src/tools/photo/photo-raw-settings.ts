import type { PhotoRawSettings } from './photo-types';

export function normalizeRawSettings(value: unknown): PhotoRawSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const multiplier = (input: unknown) => typeof input === 'number' && Number.isFinite(input)
    ? Math.min(4, Math.max(0.25, input)) : 1;
  return {
    whiteBalance: source.whiteBalance === 'daylight' || source.whiteBalance === 'custom' ? source.whiteBalance : 'camera',
    redMultiplier: multiplier(source.redMultiplier),
    blueMultiplier: multiplier(source.blueMultiplier),
    highlight: source.highlight === 'unclip' || source.highlight === 'blend' ? source.highlight : 'clip',
    demosaic: source.demosaic === 'bilinear' || source.demosaic === 'vng' || source.demosaic === 'ppg' ? source.demosaic : 'ahd',
    // LibRaw documents exp_shift as usable from 0.25 (−2 EV) to 8.0 (+3 EV); older saved values
    // outside that range are clamped rather than rejected.
    exposureEv: typeof source.exposureEv === 'number' && Number.isFinite(source.exposureEv)
      ? Math.min(3, Math.max(-2, source.exposureEv)) : 0,
    highlightPreservation: typeof source.highlightPreservation === 'number' && Number.isFinite(source.highlightPreservation)
      ? Math.min(1, Math.max(0, source.highlightPreservation)) : 0,
  };
}
