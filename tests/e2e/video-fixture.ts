import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALL_FORMATS,
  BufferSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Output,
  WebMOutputFormat,
} from 'mediabunny';

/** VP8 packets of the repository's tiny WebM sample (one keyframe followed by delta frames). */
const sourceVideo = path.join(process.cwd(), 'tests/fixtures/tactical-review-sample.webm');

/** A silent 20 ms Opus frame (CELT, fullband, mono). */
const SILENT_OPUS_FRAME = new Uint8Array([0xf8, 0xff, 0xfe]);

export const FIXTURE_GOP_SECONDS = 0.2;
export const FIXTURE_FRAME_SECONDS = 0.04;
const FRAMES_PER_GOP = 5;

export type VideoFixtureOptions = { gops: number; withAudio?: boolean; secondVideoName?: string };

/**
 * Builds a WebM with one or two VP8 tracks whose keyframes fall every 0.2 s, plus an optional silent Opus track.
 * Each GOP repeats the sample's keyframe and its first delta frames, so every frame decodes.
 */
export async function buildVideoFixture({ gops, withAudio = false, secondVideoName }: VideoFixtureOptions): Promise<Buffer> {
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(readFileSync(sourceVideo)) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('fixture source has no video track');
  const decoderConfig = await track.getDecoderConfig();
  if (!decoderConfig) throw new Error('fixture source has no decoder config');
  const sink = new EncodedPacketSink(track);
  const gop: EncodedPacket[] = [];
  for await (const packet of sink.packets()) {
    gop.push(packet);
    if (gop.length === FRAMES_PER_GOP) break;
  }

  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const primary = new EncodedVideoPacketSource('vp8');
  output.addVideoTrack(primary, { name: 'Main angle' });
  const secondary = secondVideoName ? new EncodedVideoPacketSource('vp8') : null;
  if (secondary) output.addVideoTrack(secondary, { name: secondVideoName });
  const audio = withAudio ? new EncodedAudioPacketSource('opus') : null;
  if (audio) output.addAudioTrack(audio, { name: 'Commentary' });
  await output.start();

  for (let index = 0; index < gops; index += 1) {
    for (let frame = 0; frame < FRAMES_PER_GOP; frame += 1) {
      const timestamp = Number((index * FIXTURE_GOP_SECONDS + frame * FIXTURE_FRAME_SECONDS).toFixed(6));
      const packet = gop[frame].clone({ timestamp, duration: FIXTURE_FRAME_SECONDS });
      const meta = index === 0 && frame === 0 ? { decoderConfig } : undefined;
      await primary.add(packet, meta);
      if (secondary) await secondary.add(packet, meta);
    }
  }
  if (audio) {
    const frames = Math.round((gops * FIXTURE_GOP_SECONDS) / 0.02);
    for (let index = 0; index < frames; index += 1) {
      const packet = new EncodedPacket(SILENT_OPUS_FRAME, 'key', Number((index * 0.02).toFixed(6)), 0.02);
      await audio.add(packet, index === 0 ? { decoderConfig: { codec: 'opus', sampleRate: 48000, numberOfChannels: 1 } } : undefined);
    }
  }
  await output.finalize();
  input.dispose();
  if (!target.buffer) throw new Error('fixture output is empty');
  return Buffer.from(target.buffer);
}

export type MediaSummary = {
  duration: number;
  videos: { name: string | null; keyframes: number[]; packets: string[] }[];
  audios: { name: string | null; packetCount: number; firstTimestamp: number | null; lastTimestamp: number | null }[];
};

/** Reads an exported or generated file back so tests can compare encoded packets byte for byte. */
export async function summarizeMedia(bytes: Uint8Array): Promise<MediaSummary> {
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
  const videos: MediaSummary['videos'] = [];
  for (const track of await input.getVideoTracks()) {
    const keyframes: number[] = [];
    const packets: string[] = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      if (packet.type === 'key') keyframes.push(packet.timestamp);
      packets.push(Buffer.from(packet.data).toString('hex'));
    }
    videos.push({ name: await track.getName(), keyframes, packets });
  }
  const audios: MediaSummary['audios'] = [];
  for (const track of await input.getAudioTracks()) {
    let packetCount = 0;
    let firstTimestamp: number | null = null;
    let lastTimestamp: number | null = null;
    for await (const packet of new EncodedPacketSink(track).packets()) {
      packetCount += 1;
      firstTimestamp ??= packet.timestamp;
      lastTimestamp = packet.timestamp;
    }
    audios.push({ name: await track.getName(), packetCount, firstTimestamp, lastTimestamp });
  }
  const duration = await input.computeDuration();
  input.dispose();
  return { duration, videos, audios };
}
