// Registry wiring for audio formats (F20-F23) with ID3 tagging at export (F35).

import {
  decodeAudio, hasTagOptions, spectrogramToPng, transcodeAudio, waveformToSvg, writeId3Tags,
  type AudioTagOptions,
} from './audio-engine';
import type { FormatId } from './formats';
import { bytesArtifact, registerConverter, swapExtension, textArtifact } from './transcode-engine';

const AUDIO_TARGETS: Array<{ id: 'wav' | 'mp3' | 'ogg' | 'flac' | 'aac'; label: string; mime: string; extension: string }> = [
  { id: 'wav', label: 'WAV', mime: 'audio/wav', extension: 'wav' },
  { id: 'mp3', label: 'MP3', mime: 'audio/mpeg', extension: 'mp3' },
  { id: 'ogg', label: 'OGG (Opus)', mime: 'audio/ogg', extension: 'ogg' },
  { id: 'flac', label: 'FLAC', mime: 'audio/flac', extension: 'flac' },
  { id: 'aac', label: 'AAC', mime: 'audio/mp4', extension: 'm4a' },
];

export function audioTagsFrom(options: Record<string, unknown>): AudioTagOptions {
  return {
    title: typeof options.tagTitle === 'string' ? options.tagTitle : undefined,
    artist: typeof options.tagArtist === 'string' ? options.tagArtist : undefined,
    album: typeof options.tagAlbum === 'string' ? options.tagAlbum : undefined,
    year: typeof options.tagYear === 'string' ? options.tagYear : undefined,
    genre: typeof options.tagGenre === 'string' ? options.tagGenre : undefined,
    comment: typeof options.tagComment === 'string' ? options.tagComment : undefined,
    trackNumber: Number(options.tagTrack) > 0 ? Number(options.tagTrack) : undefined,
  };
}

export function registerAudioConverters(): void {
  const sources = ['wav', 'mp3', 'ogg', 'flac', 'aac'] as FormatId[];

  for (const source of sources) {
    for (const target of AUDIO_TARGETS) {
      if (source === target.id) continue;
      registerConverter(source, target.id, `Transcode ${source.toUpperCase()} to ${target.label}`, async (input, options) => {
        let bytes = await transcodeAudio(input.bytes, target.id, {
          bitrateKbps: Number(options.bitrate) > 0 ? Number(options.bitrate) : undefined,
          sampleRate: Number(options.sampleRate) > 0 ? Number(options.sampleRate) : undefined,
          channels: Number(options.channels) > 0 ? Number(options.channels) : undefined,
          trimStart: Number(options.trimStart) > 0 ? Number(options.trimStart) : undefined,
          trimEnd: Number(options.trimEnd) > 0 ? Number(options.trimEnd) : undefined,
          tags: audioTagsFrom(options),
        });
        if (target.id === 'mp3') {
          const tags = audioTagsFrom(options);
          const coverFile = typeof File !== 'undefined' && options.coverArt instanceof File ? options.coverArt : undefined;
          if (coverFile) {
            tags.coverArt = { bytes: new Uint8Array(await coverFile.arrayBuffer()), mime: coverFile.type || 'image/jpeg' };
          }
          if (hasTagOptions(tags)) bytes = await writeId3Tags(bytes, tags);
        }
        return [bytesArtifact(swapExtension(input.fileName, target.extension), bytes, target.mime)];
      });
    }
  }

  for (const source of ['wav', 'mp3'] as FormatId[]) {
    registerConverter(source, 'waveform-svg', 'Render the waveform as SVG', async (input) => {
      const audio = await decodeAudio(input.bytes);
      return [textArtifact(swapExtension(input.fileName, 'waveform.svg'), waveformToSvg(audio), 'image/svg+xml')];
    });
    registerConverter(source, 'spectrogram-png', 'Render a spectrogram as PNG', async (input) => {
      const audio = await decodeAudio(input.bytes);
      return [bytesArtifact(swapExtension(input.fileName, 'spectrogram.png'), await spectrogramToPng(audio), 'image/png')];
    });
  }

}
