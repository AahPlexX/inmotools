import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, type MetadataTags } from 'mediabunny';

export interface AudioFileInfo {
  fileName: string;
  fileSize: number;
  codec: string;
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
  metadata: Pick<MetadataTags, 'title' | 'artist' | 'album' | 'albumArtist' | 'trackNumber' | 'genre' | 'date' | 'comment'> & { artworkCount: number };
}

export interface DecodedAudioFile {
  info: AudioFileInfo;
  buffer: AudioBuffer;
}

const openInput = (file: File) => new Input({
  formats: ALL_FORMATS,
  source: new BlobSource(file),
});

function summarizeMetadata(tags: MetadataTags): AudioFileInfo['metadata'] {
  return {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    albumArtist: tags.albumArtist,
    trackNumber: tags.trackNumber,
    genre: tags.genre,
    date: tags.date,
    comment: tags.comment,
    artworkCount: tags.images?.length ?? 0,
  };
}

async function inspectInput(file: File, input: Input<BlobSource>): Promise<{ info: AudioFileInfo; track: Awaited<ReturnType<Input<BlobSource>['getPrimaryAudioTrack']>> }> {
  if (!(await input.canRead())) throw new Error('This file format is not readable by the local media toolkit.');
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('The selected file does not contain an audio track.');
  if (!(await track.canDecode())) throw new Error('The audio codec in this file cannot be decoded in this browser.');
  const [codec, durationSeconds, sampleRate, channelCount, tags] = await Promise.all([
    track.getCodec(),
    track.computeDuration(),
    track.getSampleRate(),
    track.getNumberOfChannels(),
    input.getMetadataTags(),
  ]);
  return {
    track,
    info: {
      fileName: file.name,
      fileSize: file.size,
      codec: codec ?? 'unknown',
      durationSeconds,
      sampleRate,
      channelCount,
      metadata: summarizeMetadata(tags),
    },
  };
}
export async function inspectAudioFile(file: File): Promise<AudioFileInfo> {
  const input = openInput(file);
  try {
    return (await inspectInput(file, input)).info;
  } finally {
    input.dispose();
  }
}

export async function decodeAudioFile(file: File): Promise<DecodedAudioFile> {
  const input = openInput(file);
  try {
    const { info, track } = await inspectInput(file, input);
    if (!track) throw new Error('The selected file does not contain an audio track.');
    const sink = new AudioBufferSink(track);
    const chunks = [] as Awaited<ReturnType<typeof sink.getBuffer>>[];
    for await (const chunk of sink.buffers()) chunks.push(chunk);
    if (!chunks.length) throw new Error('The audio track decoded without any audio samples.');

    const firstTimestamp = Math.min(...chunks.map((chunk) => chunk!.timestamp));
    const sampleRate = info.sampleRate;
    const channelCount = info.channelCount;
    const frameCount = Math.max(1, ...chunks.map((chunk) => Math.round((chunk!.timestamp - firstTimestamp) * sampleRate) + chunk!.buffer.length));
    const output = new AudioBuffer({ numberOfChannels: channelCount, length: frameCount, sampleRate });

    for (const chunk of chunks) {
      if (!chunk) continue;
      const offset = Math.max(0, Math.round((chunk.timestamp - firstTimestamp) * sampleRate));
      const channels = Math.min(channelCount, chunk.buffer.numberOfChannels);
      for (let channel = 0; channel < channels; channel += 1) {
        output.copyToChannel(chunk.buffer.getChannelData(channel), channel, offset);
      }
    }
    return { info: { ...info, durationSeconds: output.duration }, buffer: output };
  } finally {
    input.dispose();
  }
}

export function bufferToPcm(buffer: AudioBuffer) {
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel).slice()),
  };
}

export function pcmToBuffer(audio: { sampleRate: number; channels: Float32Array[] }): AudioBuffer {
  if (!audio.channels.length) throw new Error('Audio must contain at least one channel.');
  const length = audio.channels[0].length;
  if (audio.channels.some((channel) => channel.length !== length)) throw new Error('Audio channels must have equal sample counts.');
  const buffer = new AudioBuffer({ numberOfChannels: audio.channels.length, length, sampleRate: audio.sampleRate });
  audio.channels.forEach((channel, index) => { const owned = new Float32Array(channel.length); owned.set(channel); buffer.copyToChannel(owned, index); });
  return buffer;
}

