import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as videoEngine from '../../src/tools/video/video-engine';

describe('video slicer September audit regressions', () => {
  it('keeps every audio packet that starts before the exclusive trim end', () => {
    const packetStartsBeforeRangeEnd = (videoEngine as Record<string, unknown>).packetStartsBeforeRangeEnd as ((timestamp: number, rangeEnd: number) => boolean) | undefined;
    expect(packetStartsBeforeRangeEnd).toBeTypeOf('function');
    if (!packetStartsBeforeRangeEnd) return;
    expect(packetStartsBeforeRangeEnd(9.999, 10)).toBe(true);
    expect(packetStartsBeforeRangeEnd(10, 10)).toBe(false);
    expect(packetStartsBeforeRangeEnd(10.001, 10)).toBe(false);
  });

  it('reads source rotation as retained video-track metadata', async () => {
    const readVideoTrackMetadata = (videoEngine as Record<string, unknown>).readVideoTrackMetadata as ((track: unknown) => Promise<Record<string, unknown>>) | undefined;
    expect(readVideoTrackMetadata).toBeTypeOf('function');
    if (!readVideoTrackMetadata) return;

    const metadata = await readVideoTrackMetadata({
      id: 7,
      number: 2,
      getCodec: async () => 'avc',
      getCodecParameterString: async () => 'avc1.64001f',
      getDisplayWidth: async () => 1080,
      getDisplayHeight: async () => 1920,
      getRotation: async () => 90,
      getLanguageCode: async () => 'eng',
      getName: async () => 'Portrait camera',
      getDisposition: async () => ({ default: true, primary: true, forced: false, original: true, commentary: false, hearingImpaired: false, visuallyImpaired: false }),
    });

    expect(metadata).toMatchObject({ id: 7, number: 2, rotation: 90, width: 1080, height: 1920, languageCode: 'eng', name: 'Portrait camera' });
  });

  it('does not use the packet at range.end as an exclusive audio sentinel and writes rotation metadata', () => {
    const source = readFileSync(new URL('../../src/tools/video/video-engine.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/audioEnd\s*=\s*await\s+audioSink\.getPacket\(range\.end/);
    expect(source).toMatch(/audioSink\.packets\(audioStart\)/);
    expect(source).toMatch(/addVideoTrack\(videoSource,\s*\{[\s\S]*?rotation\s*:/);
  });
});
