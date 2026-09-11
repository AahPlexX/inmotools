import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { classifyPhotoClipping, photoColorReadout, type PhotoColorReadout } from './photo-color-readout';
import type { LocalAdjustment, PhotoHistogram, RetouchOperation } from './photo-types';

export interface PhotoCanvasInteraction {
  kind: 'local' | 'retouch';
  id: string;
  label: string;
  mode: 'radial' | 'linear' | 'brush' | 'red-eye' | 'retouch-source' | 'retouch-target';
}

export interface PhotoCanvasGesture {
  start: { x: number; y: number; pressure: number };
  end: { x: number; y: number; pressure: number };
  path: Array<{ x: number; y: number; pressure: number }>;
}

interface PhotoCanvasProps {
  previewUrl: string | null;
  originalUrl: string | null;
  compare: boolean;
  zoom: number;
  sourceName?: string;
  histogram?: PhotoHistogram | null;
  busy?: boolean;
  localAdjustments?: LocalAdjustment[];
  retouch?: RetouchOperation[];
  interaction?: PhotoCanvasInteraction | null;
  onGesture?: (gesture: PhotoCanvasGesture) => void;
  onZoomChange: (zoom: number) => void;
}

interface GestureState {
  pointerId: number;
  start: PhotoCanvasGesture['start'];
  path: PhotoCanvasGesture['path'];
}

function histogramPath(values: number[], width = 256, height = 56): string {
  const max = Math.max(1, ...values);
  return values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - (value / max) * height;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function pointerPoint(event: ReactPointerEvent<HTMLElement>) {
  const image = event.currentTarget.querySelector<HTMLElement>('.photo-preview-image');
  const rect = (image ?? event.currentTarget).getBoundingClientRect();
  const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
  const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    pressure: Math.min(1, Math.max(0, event.pressure > 0 ? event.pressure : 1)),
  };
}

function PhotoOverlays({
  localAdjustments,
  retouch,
  activeId,
}: {
  localAdjustments: LocalAdjustment[];
  retouch: RetouchOperation[];
  activeId?: string;
}) {
  return (
    <svg className="photo-edit-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {localAdjustments.map((adjustment) => {
        if (!adjustment.enabled) return null;
        const mask = adjustment.mask;
        const active = adjustment.id === activeId;
        if (mask.type === 'radial') {
          return <ellipse key={adjustment.id} data-photo-mask="radial" cx={mask.cx * 100} cy={mask.cy * 100} rx={mask.rx * 100} ry={mask.ry * 100} className={active ? 'is-active' : undefined} />;
        }
        if (mask.type === 'linear') {
          return <g key={adjustment.id} data-photo-mask="linear" className={active ? 'is-active' : undefined}>
            <line x1={mask.x1 * 100} y1={mask.y1 * 100} x2={mask.x2 * 100} y2={mask.y2 * 100} />
            <circle cx={mask.x1 * 100} cy={mask.y1 * 100} r="1.4" />
            <circle cx={mask.x2 * 100} cy={mask.y2 * 100} r="1.4" />
          </g>;
        }
        if (mask.type === 'brush') {
          return <g key={adjustment.id} data-photo-mask="brush" className={active ? 'is-active' : undefined}>
            {mask.points.slice(-500).map((point, index) => <circle key={`${adjustment.id}-${index}`} cx={point.x * 100} cy={point.y * 100} r={Math.max(0.6, mask.radius * 50 * point.pressure)} />)}
          </g>;
        }
        return null;
      })}
      {retouch.map((operation) => {
        const active = operation.id === activeId;
        if (operation.type === 'red-eye') {
          return <circle key={operation.id} data-photo-retouch="red-eye" cx={operation.x * 100} cy={operation.y * 100} r={operation.radius * 100} className={active ? 'is-active' : undefined} />;
        }
        return <g key={operation.id} data-photo-retouch={operation.type} className={active ? 'is-active' : undefined}>
          <line x1={operation.sourceX * 100} y1={operation.sourceY * 100} x2={operation.targetX * 100} y2={operation.targetY * 100} />
          <circle cx={operation.sourceX * 100} cy={operation.sourceY * 100} r={operation.radius * 100} className="photo-retouch-source" />
          <circle cx={operation.targetX * 100} cy={operation.targetY * 100} r={operation.radius * 100} className="photo-retouch-target" />
        </g>;
      })}
    </svg>
  );
}

export default function PhotoCanvas({
  previewUrl,
  originalUrl,
  compare,
  zoom,
  sourceName,
  histogram,
  busy,
  localAdjustments = [],
  retouch = [],
  interaction = null,
  onGesture,
  onZoomChange,
}: PhotoCanvasProps) {
  const [gesture, setGesture] = useState<GestureState | null>(null);
  const [clippingVisible, setClippingVisible] = useState(false);
  const [samplerActive, setSamplerActive] = useState(false);
  const [sample, setSample] = useState<PhotoColorReadout | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const clippingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!clippingVisible || !previewUrl) return;
    const image = previewImageRef.current;
    const canvas = clippingCanvasRef.current;
    if (!image || !canvas) return;

    const draw = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let offset = 0; offset < data.length; offset += 4) {
        const clipping = classifyPhotoClipping(data[offset], data[offset + 1], data[offset + 2]);
        if (clipping === 'highlight') {
          data[offset] = 255;
          data[offset + 1] = 64;
          data[offset + 2] = 64;
          data[offset + 3] = 210;
        } else if (clipping === 'shadow') {
          data[offset] = 59;
          data[offset + 1] = 130;
          data[offset + 2] = 246;
          data[offset + 3] = 210;
        } else {
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
          data[offset + 3] = 0;
        }
      }
      context.putImageData(imageData, 0, 0);
    };

    if (image.complete) draw();
    else image.addEventListener('load', draw, { once: true });
    return () => image.removeEventListener('load', draw);
  }, [clippingVisible, previewUrl]);

  function sampleAtPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const image = previewImageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const sx = Math.min(image.naturalWidth - 1, Math.max(0, Math.floor(nx * image.naturalWidth)));
    const sy = Math.min(image.naturalHeight - 1, Math.max(0, Math.floor(ny * image.naturalHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, sx, sy, 1, 1, 0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    setSample(photoColorReadout(pixel[0], pixel[1], pixel[2], pixel[3]));
  }

  function beginGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interaction || !onGesture || !previewUrl) return;
    event.preventDefault();
    const point = pointerPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ pointerId: event.pointerId, start: point, path: [point] });
  }

  function moveGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gesture || gesture.pointerId !== event.pointerId || !interaction) return;
    event.preventDefault();
    const point = pointerPoint(event);
    setGesture((current) => current ? { ...current, path: [...current.path, point].slice(-5000) } : current);
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (samplerActive && !interaction && previewUrl) {
      event.preventDefault();
      sampleAtPointer(event);
      return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId || !interaction || !onGesture) return;
    event.preventDefault();
    const end = pointerPoint(event);
    const path = gesture.path.length ? [...gesture.path, end] : [gesture.start, end];
    onGesture({ start: gesture.start, end, path });
    setGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancelGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture?.pointerId === event.pointerId) setGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const canvasInteractive = Boolean(interaction || samplerActive);

  return (
    <section className="photo-stage" aria-label="Photo preview">
      <div className="photo-stage-toolbar">
        <div className="photo-zoom-controls" role="group" aria-label="Zoom controls">
          <button type="button" onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => onZoomChange(1)} aria-label="Actual size">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => onZoomChange(Math.min(4, zoom + 0.25))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => onZoomChange(0.75)} aria-label="Fit photo">Fit</button>
        </div>
        <div className="photo-observation-controls" role="group" aria-label="Image inspection controls">
          <button
            type="button"
            aria-pressed={clippingVisible}
            disabled={!previewUrl}
            onClick={() => setClippingVisible((value) => !value)}
          >Clipping warnings</button>
          <button
            type="button"
            aria-pressed={samplerActive}
            disabled={!previewUrl || Boolean(interaction)}
            onClick={() => setSamplerActive((value) => !value)}
          >Color sampler</button>
        </div>
        {histogram ? (
          <svg className="photo-mini-histogram" viewBox="0 0 256 56" role="img" aria-label="Live RGB and luminance histogram">
            <path data-histogram-channel="red" d={histogramPath(histogram.red)} />
            <path data-histogram-channel="green" d={histogramPath(histogram.green)} />
            <path data-histogram-channel="blue" d={histogramPath(histogram.blue)} />
            <path data-histogram-channel="luminance" d={histogramPath(histogram.luminance)} />
          </svg>
        ) : null}
      </div>

      {interaction ? <div className="photo-tool-hint" role="status">{interaction.label} · drag on the photo to place it</div> : null}
      {samplerActive ? <div className="photo-tool-hint" role="status">Color sampler active · click or tap the photo to inspect one rendered pixel</div> : null}
      {sample ? (
        <div className="photo-color-readout" role="status" aria-label="Sampled color readout">
          <strong>{sample.hex}</strong>
          <span>RGB {sample.r}, {sample.g}, {sample.b}</span>
          <span>HSL {sample.hue}°, {sample.saturation}%, {sample.lightness}%</span>
          {sample.a < 255 ? <span>Alpha {Math.round(sample.a / 255 * 100)}%</span> : null}
        </div>
      ) : null}

      <div className="photo-canvas-scroller" data-photo-canvas>
        {!previewUrl ? (
          <div className="photo-empty-state">
            <div className="photo-empty-icon" aria-hidden="true">▧</div>
            <h3>Open a photo to begin</h3>
            <p>Your source stays on this device. Every adjustment remains reversible until you export a new copy.</p>
          </div>
        ) : (
          <div
            className={`photo-image-frame${busy ? ' is-rendering' : ''}${canvasInteractive ? ' is-interactive' : ''}`}
            style={{ '--photo-zoom': zoom } as React.CSSProperties}
            data-testid="photo-image-frame"
            onPointerDown={beginGesture}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={cancelGesture}
          >
            <img
              ref={previewImageRef}
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
            {clippingVisible ? <canvas ref={clippingCanvasRef} className="photo-clipping-overlay" data-testid="photo-clipping-overlay" aria-hidden="true" /> : null}
            <PhotoOverlays localAdjustments={localAdjustments} retouch={retouch} activeId={interaction?.id} />
            {busy ? <span className="photo-render-badge" role="status">Rendering preview…</span> : null}
          </div>
        )}
      </div>
    </section>
  );
}
