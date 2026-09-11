import type { PhotoHistogram } from './photo-types';

interface PhotoCanvasProps {
  previewUrl: string | null;
  originalUrl: string | null;
  compare: boolean;
  zoom: number;
  sourceName?: string;
  histogram?: PhotoHistogram | null;
  busy?: boolean;
  onZoomChange: (zoom: number) => void;
}

function histogramPath(values: number[], width = 256, height = 56): string {
  const max = Math.max(1, ...values);
  return values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - (value / max) * height;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function PhotoCanvas({
  previewUrl,
  originalUrl,
  compare,
  zoom,
  sourceName,
  histogram,
  busy,
  onZoomChange,
}: PhotoCanvasProps) {
  return (
    <section className="photo-stage" aria-label="Photo preview">
      <div className="photo-stage-toolbar">
        <div className="photo-zoom-controls" role="group" aria-label="Zoom controls">
          <button type="button" onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => onZoomChange(1)} aria-label="Actual size">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => onZoomChange(Math.min(4, zoom + 0.25))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => onZoomChange(0.75)} aria-label="Fit photo">Fit</button>
        </div>
        {histogram ? (
          <svg className="photo-mini-histogram" viewBox="0 0 256 56" role="img" aria-label="Live luminance histogram">
            <path d={histogramPath(histogram.luminance)} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
      </div>

      <div className="photo-canvas-scroller" data-photo-canvas>
        {!previewUrl ? (
          <div className="photo-empty-state">
            <div className="photo-empty-icon" aria-hidden="true">▧</div>
            <h3>Open a photo to begin</h3>
            <p>Your source stays on this device. Every adjustment remains reversible until you export a new copy.</p>
          </div>
        ) : (
          <div
            className={`photo-image-frame${busy ? ' is-rendering' : ''}`}
            style={{ '--photo-zoom': zoom } as React.CSSProperties}
          >
            <img
              src={previewUrl}
              alt={`Edited preview of ${sourceName || 'selected photo'}`}
              className="photo-preview-image"
              data-testid="photo-preview"
              draggable={false}
            />
            {compare && originalUrl ? (
              <div className="photo-before-overlay" aria-hidden="true">
                <img src={originalUrl} alt="" draggable={false} />
                <span className="photo-before-label">Before</span>
              </div>
            ) : null}
            {busy ? <span className="photo-render-badge" role="status">Rendering preview…</span> : null}
          </div>
        )}
      </div>
    </section>
  );
}
