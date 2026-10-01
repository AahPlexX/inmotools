import { MAX_VIDEO_EXPORT_FRAMES, buildExportFrames, negotiateVideoExports, readExportMetadata, requireNegotiatedCandidate, videoContainerTags } from './export-engine';
import { VIDEO_EXPORT_CANDIDATES, type VideoExportCandidate } from './export-types';
import type { TacticalProject } from './tactics-types';

export async function probeTacticalVideoExports(): Promise<VideoExportCandidate[]> {
  const { canEncodeVideo } = await import('mediabunny');
  return negotiateVideoExports({
    canEncodeVideo: (codec, options) => canEncodeVideo(codec, {
      width: options.width,
      height: options.height,
      bitrate: options.bitrate,
    }),
  }, VIDEO_EXPORT_CANDIDATES);
}

async function paintSvg(canvas: HTMLCanvasElement, svg: string): Promise<void> {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    context.fillStyle = '#0b1220';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sourceWidth = image.naturalWidth || canvas.width;
    const sourceHeight = image.naturalHeight || canvas.height;
    const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function encodeTacticalVideo(
  project: TacticalProject,
  sceneId: string,
  candidate: VideoExportCandidate,
  negotiated: readonly VideoExportCandidate[],
): Promise<Uint8Array> {
  const confirmed = requireNegotiatedCandidate(candidate.id, negotiated);
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat, canEncodeVideo } = await import('mediabunny');
  const supported = await canEncodeVideo(confirmed.codec, {
    width: confirmed.width,
    height: confirmed.height,
    bitrate: confirmed.bitrate,
  });
  if (supported !== true) {
    throw new Error('Video encoder did not confirm this format. Download the frame-sequence ZIP instead.');
  }
  if (typeof document === 'undefined') {
    throw new Error('Video export needs a browser canvas. Download the frame-sequence ZIP instead.');
  }

  const frames = buildExportFrames(project, sceneId, {
    width: confirmed.width,
    height: confirmed.height,
    frameRate: confirmed.frameRate,
    maxFrames: MAX_VIDEO_EXPORT_FRAMES,
    showCaption: false,
  });
  const canvas = document.createElement('canvas');
  canvas.width = confirmed.width;
  canvas.height = confirmed.height;
  const target = new BufferTarget();
  const output = new Output({
    format: confirmed.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: confirmed.codec,
    bitrate: confirmed.bitrate,
    latencyMode: 'quality',
  });
  output.addVideoTrack(source, { frameRate: confirmed.frameRate });
  output.setMetadataTags(videoContainerTags(readExportMetadata(project)));
  await output.start();
  const frameDuration = 1 / confirmed.frameRate;
  try {
    for (let index = 0; index < frames.length; index += 1) {
      await paintSvg(canvas, frames[index]!.svg);
      await source.add(index * frameDuration, frameDuration);
    }
    source.close();
    await output.finalize();
  } catch (error) {
    if (output.state === 'started') await output.cancel().catch(() => undefined);
    throw error;
  }
  if (!target.buffer) throw new Error('Video export produced no bytes. Download the frame-sequence ZIP instead.');
  return new Uint8Array(target.buffer);
}
