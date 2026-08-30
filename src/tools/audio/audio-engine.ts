export function clampAudioSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function encodeSigned24(sample: number): number {
  const clamped = clampAudioSample(sample);
  return clamped < 0
    ? Math.round(clamped * 8_388_608)
    : Math.round(clamped * 8_388_607);
}

export function encodePcm24Wav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  if (!channels.length) throw new Error('At least one audio channel is required.');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Sample rate must be a positive finite number.');
  if (channels.length > 65_535) throw new Error('Channel count exceeds the WAV PCM limit.');

  const sampleCount = channels[0].length;
  if (channels.some((channel) => channel.length !== sampleCount)) throw new Error('All audio channels must have the same length.');

  const channelCount = channels.length;
  const bytesPerSample = 3;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = sampleCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate) * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < sampleCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const encoded = encodeSigned24(channels[channel][frame]);
      const unsigned = encoded < 0 ? encoded + 0x1000000 : encoded;
      view.setUint8(offset, unsigned & 0xff);
      view.setUint8(offset + 1, (unsigned >> 8) & 0xff);
      view.setUint8(offset + 2, (unsigned >> 16) & 0xff);
      offset += 3;
    }
  }

  return buffer;
}
