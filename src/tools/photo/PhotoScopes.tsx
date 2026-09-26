import { useEffect, useRef, useState } from 'react';
import {
  PHOTO_EXPOSURE_ZONE_LABELS,
  PHOTO_SCOPE_HEIGHT,
  PHOTO_SCOPE_WIDTH,
  PHOTO_VECTORSCOPE_SIZE,
  analyzePhotoScopes,
  type PhotoScopeAnalysis,
} from './photo-scopes';

interface PhotoScopesProps {
  previewUrl: string;
}

function paintDensity(
  canvas: HTMLCanvasElement,
  values: number[],
  width: number,
  height: number,
  color: readonly [number, number, number],
): void {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const output = context.createImageData(width, height);
  const max = values.reduce((current, value) => Math.max(current, value), 1);
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index]) continue;
    const alpha = Math.min(255, Math.round(36 + Math.sqrt(values[index] / max) * 219));
    const offset = index * 4;
    output.data[offset] = color[0];
    output.data[offset + 1] = color[1];
    output.data[offset + 2] = color[2];
    output.data[offset + 3] = alpha;
  }
  context.putImageData(output, 0, 0);
}

function paintParade(canvas: HTMLCanvasElement, analysis: PhotoScopeAnalysis): void {
  canvas.width = PHOTO_SCOPE_WIDTH * 3;
  canvas.height = PHOTO_SCOPE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return;
  const channels = [
    [analysis.parade.red, [239, 68, 68]],
    [analysis.parade.green, [34, 197, 94]],
    [analysis.parade.blue, [59, 130, 246]],
  ] as const;
  channels.forEach(([values, color], channel) => {
    const part = document.createElement('canvas');
    paintDensity(part, values, PHOTO_SCOPE_WIDTH, PHOTO_SCOPE_HEIGHT, color);
    context.drawImage(part, channel * PHOTO_SCOPE_WIDTH, 0);
  });
}

export default function PhotoScopes({ previewUrl }: PhotoScopesProps) {
  const [analysis, setAnalysis] = useState<PhotoScopeAnalysis | null>(null);
  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const paradeRef = useRef<HTMLCanvasElement | null>(null);
  const vectorscopeRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnalysis(null);
    const image = new Image();
    image.onload = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
      const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      try {
        const next = analyzePhotoScopes(context.getImageData(0, 0, width, height).data, width, height);
        if (!cancelled) setAnalysis(next);
      } catch {
        if (!cancelled) setAnalysis(null);
      }
    };
    image.onerror = () => { if (!cancelled) setAnalysis(null); };
    image.src = previewUrl;
    return () => { cancelled = true; image.src = ''; };
  }, [previewUrl]);

  useEffect(() => {
    if (!analysis || !waveformRef.current || !paradeRef.current || !vectorscopeRef.current) return;
    paintDensity(waveformRef.current, analysis.waveform, PHOTO_SCOPE_WIDTH, PHOTO_SCOPE_HEIGHT, [226, 232, 240]);
    paintParade(paradeRef.current, analysis);
    paintDensity(vectorscopeRef.current, analysis.vectorscope, PHOTO_VECTORSCOPE_SIZE, PHOTO_VECTORSCOPE_SIZE, [250, 204, 21]);
  }, [analysis]);

  return (
    <section className="photo-scopes" aria-label="Photo inspection scopes" data-testid="photo-scopes">
      <figure>
        <figcaption>Luminance waveform</figcaption>
        <canvas ref={waveformRef} role="img" aria-label="Luminance waveform scope" />
      </figure>
      <figure>
        <figcaption>RGB parade</figcaption>
        <canvas ref={paradeRef} role="img" aria-label="RGB parade scope" />
      </figure>
      <figure>
        <figcaption>Vectorscope</figcaption>
        <canvas ref={vectorscopeRef} role="img" aria-label="YCbCr vectorscope" />
      </figure>
      <figure className="photo-exposure-zones">
        <figcaption>Exposure zones</figcaption>
        <ol aria-label="Exposure zone distribution">
          {PHOTO_EXPOSURE_ZONE_LABELS.map((label, index) => {
            const total = Math.max(1, analysis?.sampleCount ?? 0);
            const percent = Math.round((analysis?.exposureZones[index] ?? 0) / total * 100);
            return <li key={label}><span>{label} EV</span><meter min={0} max={100} value={percent}>{percent}%</meter><span>{percent}%</span></li>;
          })}
        </ol>
      </figure>
    </section>
  );
}
