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
  type InputTrack,
  type InputVideoTrack,
  type OutputFormat,
  type Rotation,
  type TrackDisposition,
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

export type VideoTrackMetadataSnapshot = {
  id: number;
  number: number;
  codec: string;
  codecString: string | null;
  width: number;
  height: number;
  rotation: Rotation;
  languageCode: string;
  name: string | null;
  disposition: TrackDisposition;
};

export type VideoTrackInspection = VideoTrackMetadataSnapshot & { keyframes: number[] };

export type AudioTrackInspection = {
  id: number;
  number: number;
  codec: string;
  codecString: string | null;
  sampleRate: number | null;
  numberOfChannels: number | null;
  languageCode: string;
  name: string | null;
  disposition: TrackDisposition;
};

export type OtherTrackInspection = {
  id: number;
  number: number;
  type: string;
  languageCode: string;
  name: string | null;
};

export type MediaInspection = {
  fileName: string;
  size: number;
  mimeType: string;
  duration: number;
  videos: VideoTrackInspection[];
  audios: AudioTrackInspection[];
  otherTracks: OtherTrackInspection[];
  primaryVideoId: number | null;
  primaryAudioId: number | null;
};

export type MediaInspectionOptions = { signal?: AbortSignal };
export type PacketExportOptions = {
  videoTrackId: number;
  audioTrackId: number | null;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function cancellationError(message: string) {
  return new DOMException(message, 'AbortError');
}

function throwIfAborted(signal?: AbortSignal, message = 'Operation canceled.') {
  if (signal?.aborted) throw cancellationError(message);
}

function bindInputAbort(input: Input, signal: AbortSignal | undefined) {
  if (!signal) return () => undefined;
  if (signal.aborted) {
    input.dispose();
    throw cancellationError('Operation canceled.');
  }
  const abort = () => input.dispose();
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

export function packetStartsBeforeRangeEnd(timestamp: number, rangeEnd: number): boolean {
  return Number.isFinite(timestamp) && Number.isFinite(rangeEnd) && timestamp < rangeEnd;
}

export function snapTrimRange(requestedStart: number, requestedEnd: number, keyframes: number[], duration: number): SnappedRange {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Media duration must be greater than zero.');
  const normalizedStart = clamp(finite(requestedStart, 0), 0, duration);
  const normalizedEnd = clamp(finite(requestedEnd, duration), 0, duration);
  if (normalizedStart >= normalizedEnd) throw new Error('Trim start must be before trim end.');
  const usable = [...new Set(keyframes.filter((value) => Number.isFinite(value) && value >= 0 && value <= duration))].sort((a, b) => a - b);
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
  if (end <= start) end = usable.find((keyframe) => keyframe > start) ?? duration;
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

export function adjacentKeyframe(keyframes: number[], time: number, direction: 'previous' | 'next'): number | null {
  const usable = [...new Set(keyframes.filter(Number.isFinite))].sort((a, b) => a - b);
  if (direction === 'previous') {
    for (let index = usable.length - 1; index >= 0; index -= 1) if (usable[index] < time - 1e-9) return usable[index];
    return null;
  }
  return usable.find((value) => value > time + 1e-9) ?? null;
}

async function enumerateKeyframes(track: InputVideoTrack, signal?: AbortSignal): Promise<number[]> {
  const sink = new EncodedPacketSink(track);
  const keyframes: number[] = [];
  let packet = await sink.getFirstKeyPacket({ verifyKeyPackets: true });
  while (packet) {
    throwIfAborted(signal, 'Inspection canceled.');
    if (Number.isFinite(packet.timestamp)) keyframes.push(packet.timestamp);
    packet = await sink.getNextKeyPacket(packet, { verifyKeyPackets: true });
  }
  return [...new Set(keyframes)].sort((a, b) => a - b);
}

export async function readVideoTrackMetadata(track: InputVideoTrack): Promise<VideoTrackMetadataSnapshot> {
  const [codec, codecString, width, height, rotation, languageCode, name, disposition] = await Promise.all([
    track.getCodec(),
    track.getCodecParameterString(),
    track.getDisplayWidth(),
    track.getDisplayHeight(),
    track.getRotation(),
    track.getLanguageCode(),
    track.getName(),
    track.getDisposition(),
  ]);
  return {
    id: track.id,
    number: track.number,
    codec: codec ?? 'unknown',
    codecString,
    width,
    height,
    rotation,
    languageCode,
    name,
    disposition,
  };
}

async function inspectVideo(track: InputVideoTrack, signal?: AbortSignal): Promise<VideoTrackInspection> {
  const [metadata, keyframes] = await Promise.all([readVideoTrackMetadata(track), enumerateKeyframes(track, signal)]);
  throwIfAborted(signal, 'Inspection canceled.');
  return { ...metadata, keyframes };
}

async function readAudioTrackMetadata(track: InputAudioTrack): Promise<AudioTrackInspection> {
  const [codec, codecString, config, languageCode, name, disposition] = await Promise.all([
    track.getCodec(),
    track.getCodecParameterString(),
    track.getDecoderConfig(),
    track.getLanguageCode(),
    track.getName(),
    track.getDisposition(),
  ]);
  return {
    id: track.id,
    number: track.number,
    codec: codec ?? 'unknown',
    codecString,
    sampleRate: config?.sampleRate ?? null,
    numberOfChannels: config?.numberOfChannels ?? null,
    languageCode,
    name,
    disposition,
  };
}

async function inspectOtherTrack(track: InputTrack): Promise<OtherTrackInspection> {
  const [languageCode, name] = await Promise.all([track.getLanguageCode(), track.getName()]);
  return { id: track.id, number: track.number, type: String(track.type), languageCode, name };
}

export async function inspectLocalMedia(file: File, options: MediaInspectionOptions = {}): Promise<MediaInspection> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let unbindAbort = () => undefined;
  try {
    throwIfAborted(options.signal, 'Inspection canceled.');
    unbindAbort = bindInputAbort(input, options.signal);
    if (!(await input.canRead())) throw new Error('This media container is not supported by the local parser.');
    throwIfAborted(options.signal, 'Inspection canceled.');
    const [duration, mimeType, allTracks, videoTracks, audioTracks, primaryVideo, primaryAudio] = await Promise.all([
      input.computeDuration(),
      input.getMimeType(),
      input.getTracks(),
      input.getVideoTracks(),
      input.getAudioTracks(),
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    throwIfAborted(options.signal, 'Inspection canceled.');
    const supportedIds = new Set([...videoTracks, ...audioTracks].map((track) => track.id));
    const otherTracks = allTracks.filter((track) => !supportedIds.has(track.id));
    const [videos, audios, others] = await Promise.all([
      Promise.all(videoTracks.map((track) => inspectVideo(track, options.signal))),
      Promise.all(audioTracks.map(readAudioTrackMetadata)),
      Promise.all(otherTracks.map(inspectOtherTrack)),
    ]);
    throwIfAborted(options.signal, 'Inspection canceled.');
    return {
      fileName: file.name,
      size: file.size,
      mimeType,
      duration,
      videos,
      audios,
      otherTracks: others,
      primaryVideoId: primaryVideo?.id ?? null,
      primaryAudioId: primaryAudio?.id ?? null,
    };
  } catch (error) {
    if (options.signal?.aborted) throw cancellationError('Inspection canceled.');
    throw error;
  } finally {
    unbindAbort();
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
    && (!audioCodec || format.getSupportedAudioCodecs().includes(audioCodec)),
  );
  if (!selected) throw new Error('No supported output container can preserve the selected encoded audio/video codecs without re-encoding.');
  return selected;
}

async function firstAudioPacketAtOrAfter(track: InputAudioTrack, timestamp: number) {
  const sink = new EncodedPacketSink(track);
  let packet = await sink.getPacket(timestamp);
  while (packet && packet.timestamp < timestamp) packet = await sink.getNextPacket(packet);
  return { sink, packet };
}

export async function exportPacketRange(file: File, range: SnappedRange, options: PacketExportOptions): Promise<Blob> {
  if (range.start < 0 || range.end <= range.start) throw new Error('The snapped packet range is invalid.');
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let output: Output | null = null;
  let unbindAbort = () => undefined;
  try {
    throwIfAborted(options.signal, 'Export canceled.');
    unbindAbort = bindInputAbort(input, options.signal);
    if (!(await input.canRead())) throw new Error('This media container is not supported by the local parser.');
    const [duration, videoTracks, audioTracks] = await Promise.all([
      input.computeDuration(),
      input.getVideoTracks(),
      input.getAudioTracks(),
    ]);
    throwIfAborted(options.signal, 'Export canceled.');
    const videoTrack = videoTracks.find((track) => track.id === options.videoTrackId);
    const audioTrack = options.audioTrackId === null ? null : audioTracks.find((track) => track.id === options.audioTrackId) ?? null;
    if (!videoTrack) throw new Error('The selected video track is no longer available.');
    if (options.audioTrackId !== null && !audioTrack) throw new Error('The selected audio track is no longer available.');
    if (range.end > duration + 1e-6) throw new Error('The snapped range exceeds the media duration.');

    const [videoCodec, videoConfig, rotation, videoLanguageCode, videoName, videoDisposition, audioCodec, audioConfig, audioLanguageCode, audioName, audioDisposition] = await Promise.all([
      videoTrack.getCodec(),
      videoTrack.getDecoderConfig(),
      videoTrack.getRotation(),
      videoTrack.getLanguageCode(),
      videoTrack.getName(),
      videoTrack.getDisposition(),
      audioTrack?.getCodec() ?? null,
      audioTrack?.getDecoderConfig() ?? null,
      audioTrack?.getLanguageCode() ?? 'und',
      audioTrack?.getName() ?? null,
      audioTrack?.getDisposition() ?? null,
    ]);
    throwIfAborted(options.signal, 'Export canceled.');
    if (!videoCodec || !videoConfig) throw new Error('The selected video codec configuration could not be determined.');
    if (audioTrack && (!audioCodec || !audioConfig)) throw new Error('The selected audio codec configuration could not be determined.');

    const format = chooseOutputFormat(file, videoCodec, audioCodec);
    const target = new BufferTarget();
    output = new Output({ format, target });
    const videoSource = new EncodedVideoPacketSource(videoCodec);
    output.addVideoTrack(videoSource, {
      decoderConfig: videoConfig,
      rotation,
      languageCode: videoLanguageCode,
      name: videoName ?? undefined,
      disposition: videoDisposition,
    });
    const audioSource = audioCodec ? new EncodedAudioPacketSource(audioCodec) : null;
    if (audioSource && audioConfig) {
      output.addAudioTrack(audioSource, {
        decoderConfig: audioConfig,
        languageCode: audioLanguageCode,
        name: audioName ?? undefined,
        disposition: audioDisposition ?? undefined,
      });
    }
    await output.start();

    const videoSink = new EncodedPacketSink(videoTrack);
    const startPacket = await videoSink.getKeyPacket(range.start, { verifyKeyPackets: true });
    if (!startPacket || Math.abs(startPacket.timestamp - range.start) > 1e-5) throw new Error('The selected start is not a verified keyframe.');
    let endPacket;
    if (range.end < duration - 1e-6) {
      endPacket = await videoSink.getKeyPacket(range.end, { verifyKeyPackets: true });
      if (!endPacket || Math.abs(endPacket.timestamp - range.end) > 1e-5) throw new Error('The selected end is not a verified keyframe.');
    }
    let firstVideo = true;
    for await (const packet of videoSink.packets(startPacket, endPacket)) {
      throwIfAborted(options.signal, 'Export canceled.');
      const shifted = packet.clone({ timestamp: packet.timestamp - range.start });
      await videoSource.add(shifted, firstVideo ? { decoderConfig: videoConfig } : undefined);
      firstVideo = false;
      options.onProgress?.(Math.max(0, Math.min(.9, (packet.timestamp - range.start) / Math.max(1e-9, range.end - range.start) * .9)));
    }
    if (firstVideo) throw new Error('No video packets were found inside the snapped range.');

    if (audioTrack && audioSource && audioConfig) {
      const { sink: audioSink, packet: audioStart } = await firstAudioPacketAtOrAfter(audioTrack, range.start);
      let firstAudio = true;
      if (audioStart) {
        for await (const packet of audioSink.packets(audioStart)) {
          throwIfAborted(options.signal, 'Export canceled.');
          if (!packetStartsBeforeRangeEnd(packet.timestamp, range.end)) break;
          await audioSource.add(
            packet.clone({ timestamp: Math.max(0, packet.timestamp - range.start) }),
            firstAudio ? { decoderConfig: audioConfig } : undefined,
          );
          firstAudio = false;
        }
      }
    }

    throwIfAborted(options.signal, 'Export canceled.');
    await output.finalize();
    throwIfAborted(options.signal, 'Export canceled.');
    options.onProgress?.(1);
    if (!target.buffer) throw new Error('The output container finalized without a buffer.');
    return new Blob([target.buffer], { type: format.mimeType });
  } catch (error) {
    if (output && output.state === 'started') await output.cancel().catch(() => undefined);
    if (options.signal?.aborted) throw cancellationError('Export canceled.');
    throw error;
  } finally {
    unbindAbort();
    input.dispose();
  }
}
