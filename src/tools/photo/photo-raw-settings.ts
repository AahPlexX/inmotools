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
  };
}
