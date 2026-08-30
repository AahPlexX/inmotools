import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type AudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
  type OutputFormat,
  type VideoCodec,
} from 'mediabunny';

export type SnappedRange = {
  requestedStart: number;
  requestedEnd: number;
  start: number;
  end: number;
  startAdjusted: boolean;
  endAdjusted: boolean;
};

export type MediaInspection = {
  fileName: string;
  size: number;
  mimeType: string;
  duration: number;
  video: null | {
    codec: string;
    codecString: string | null;
    width: number;
    height: number;
    keyframes: number[];
  };
  audio: null | {
    codec: string;
    codecString: string | null;
    sampleRate: number | null;
    numberOfChannels: number | null;
  };
};

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function snapTrimRange(
  requestedStart: number,
  requestedEnd: number,
  keyframes: number[],
  duration: number,
): SnappedRange {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Media duration must be greater than zero.');

  const normalizedStart = clamp(finite(requestedStart, 0), 0, duration);
  const normalizedEnd = clamp(finite(requestedEnd, duration), 0, duration);
  if (normalizedStart >= normalizedEnd) throw new Error('Trim start must be before trim end.');

  const usable = [...new Set(keyframes.filter((value) => Number.isFinite(value) && value >= 0 && value <= duration))]
    .sort((a, b) => a - b);
  if (!usable.length) throw new Error('No usable video keyframe was found.');

  let start = usable[0];
  for (const keyframe of usable) {
    if (keyframe > normalizedStart) break;
    start = keyframe;
  }

  let end = duration;
  for (const keyframe of usable) {
    if (keyframe >= normalizedEnd) {
      end = keyframe;
      break;
    }
  }
  if (end <= start) {
    const next = usable.find((keyframe) => keyframe > start);
    end = next ?? duration;
  }
  if (end <= start) throw new Error('The selected range does not contain a complete keyframe interval.');

  return {
    requestedStart: normalizedStart,
    requestedEnd: normalizedEnd,
    start,
    end,
    startAdjusted: Math.abs(start - normalizedStart) > 1e-9,
    endAdjusted: Math.abs(end - normalizedEnd) > 1e-9,
  };
}

async function enumerateKeyframes(track: InputVideoTrack): Promise<number[]> {
  const sink = new EncodedPacketSink(track);
  const keyframes: number[] = [];
  let packet = await sink.getFirstKeyPacket({ verifyKeyPackets: true });
  while (packet) {
    if (Number.isFinite(packet.timestamp)) keyframes.push(packet.timestamp);
    packet = await sink.getNextKeyPacket(packet, { verifyKeyPackets: true });
  }
  return [...new Set(keyframes)].sort((a, b) => a - b);
}

export async function inspectLocalMedia(file: File): Promise<MediaInspection> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    if (!(await input.canRead())) throw new Error('This media container is not supported by the local parser.');
    const [duration, mimeType, videoTrack, audioTrack] = await Promise.all([
      input.computeDuration(),
      input.getMimeType(),
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);

    const video = videoTrack ? await Promise.all([
      videoTrack.getCodec(),
      videoTrack.getCodecParameterString(),
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      enumerateKeyframes(videoTrack),
    ]).then(([codec, codecString, width, height, keyframes]) => ({
      codec: codec ?? 'unknown', codecString, width, height, keyframes,
    })) : null;

    const audio = audioTrack ? await Promise.all([
      audioTrack.getCodec(),
      audioTrack.getCodecParameterString(),
      audioTrack.getDecoderConfig(),
    ]).then(([codec, codecString, config]) => ({
      codec: codec ?? 'unknown',
      codecString,
      sampleRate: config?.sampleRate ?? null,
      numberOfChannels: config?.numberOfChannels ?? null,
    })) : null;

    return { fileName: file.name, size: file.size, mimeType, duration, video, audio };
  } finally {
    input.dispose();
  }
}

function chooseOutputFormat(file: File, videoCodec: VideoCodec | null, audioCodec: AudioCodec | null): OutputFormat {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const candidates: OutputFormat[] = extension === 'webm'
    ? [new WebMOutputFormat(), new Mp4OutputFormat(), new MovOutputFormat()]
    : extension === 'mov'
      ? [new MovOutputFormat(), new Mp4OutputFormat(), new WebMOutputFormat()]
      : [new Mp4OutputFormat(), new MovOutputFormat(), new WebMOutputFormat()];

  const selected = candidates.find((format) =>
    (!videoCodec || format.getSupportedVideoCodecs().includes(videoCodec))
    && (!audioCodec || format.getSupportedAudioCodecs().includes(audioCodec))
  );
  if (!selected) throw new Error('No supported output container can preserve these encoded audio/video codecs without re-encoding.');
  return selected;
}

async function firstAudioPacketAtOrAfter(track: InputAudioTrack, timestamp: number) {
  const sink = new EncodedPacketSink(track);
  let packet = await sink.getPacket(timestamp);
  if (!packet) return { sink, packet: null };
  while (packet && packet.timestamp < timestamp - 1e-9) packet = await sink.getNextPacket(packet);
  return { sink, packet };
}

export async function exportPacketRange(file: File, range: SnappedRange): Promise<Blob> {
  if (range.start < 0 || range.end <= range.start) throw new Error('The snapped packet range is invalid.');
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    if (!(await input.canRead())) throw new Error('This media container is not supported by the local parser.');
    const [duration, videoTrack, audioTrack] = await Promise.all([
      input.computeDuration(), input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(),
    ]);
    if (!videoTrack) throw new Error('Lossless keyframe slicing requires a video track.');
    if (range.end > duration + 1e-6) throw new Error('The snapped range exceeds the media duration.');

    const [videoCodec, videoConfig, audioCodec, audioConfig] = await Promise.all([
      videoTrack.getCodec(), videoTrack.getDecoderConfig(), audioTrack?.getCodec() ?? null, audioTrack?.getDecoderConfig() ?? null,
    ]);
    if (!videoCodec || !videoConfig) throw new Error('The video codec/decoder configuration could not be determined.');
    if (audioTrack && (!audioCodec || !audioConfig)) throw new Error('The audio codec/decoder configuration could not be determined.');

    const format = chooseOutputFormat(file, videoCodec, audioCodec);
    const target = new BufferTarget();
    const output = new Output({ format, target });
    const videoSource = new EncodedVideoPacketSource(videoCodec);
    output.addVideoTrack(videoSource, { decoderConfig: videoConfig });
    const audioSource = audioCodec ? new EncodedAudioPacketSource(audioCodec) : null;
    if (audioSource && audioConfig) output.addAudioTrack(audioSource, { decoderConfig: audioConfig });
    await output.start();

    const videoSink = new EncodedPacketSink(videoTrack);
    const startPacket = await videoSink.getKeyPacket(range.start, { verifyKeyPackets: true });
    if (!startPacket || Math.abs(startPacket.timestamp - range.start) > 1e-5) throw new Error('The selected start is not a verified keyframe.');
    const endPacket = range.end < duration - 1e-6
      ? await videoSink.getKeyPacket(range.end, { verifyKeyPackets: true })
      : undefined;

    let firstVideo = true;
    for await (const packet of videoSink.packets(startPacket, endPacket ?? undefined)) {
      const shifted = packet.clone({ timestamp: packet.timestamp - range.start });
      await videoSource.add(shifted, firstVideo ? { decoderConfig: videoConfig } : undefined);
      firstVideo = false;
    }
    if (firstVideo) throw new Error('No video packets were found inside the snapped range.');

    if (audioTrack && audioSource && audioConfig) {
      const { sink: audioSink, packet: audioStart } = await firstAudioPacketAtOrAfter(audioTrack, range.start);
      const audioEnd = await audioSink.getPacket(range.end, { metadataOnly: true });
      let firstAudio = true;
      if (audioStart) {
        for await (const packet of audioSink.packets(audioStart, audioEnd ?? undefined)) {
          if (packet.timestamp >= range.end - 1e-9) break;
          const shifted = packet.clone({ timestamp: Math.max(0, packet.timestamp - range.start) });
          await audioSource.add(shifted, firstAudio ? { decoderConfig: audioConfig } : undefined);
          firstAudio = false;
        }
      }
    }

    await output.finalize();
    if (!target.buffer) throw new Error('The output container finalized without a buffer.');
    return new Blob([target.buffer], { type: format.mimeType });
  } finally {
    input.dispose();
  }
}
