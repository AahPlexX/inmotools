import { useState, type PointerEvent as ReactPointerEvent } from 'react';
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
  const rect = event.currentTarget.getBoundingClientRect();
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

      {interaction ? <div className="photo-tool-hint" role="status">{interaction.label} · drag on the photo to place it</div> : null}

      <div className="photo-canvas-scroller" data-photo-canvas>
        {!previewUrl ? (
          <div className="photo-empty-state">
            <div className="photo-empty-icon" aria-hidden="true">▧</div>
            <h3>Open a photo to begin</h3>
            <p>Your source stays on this device. Every adjustment remains reversible until you export a new copy.</p>
          </div>
        ) : (
          <div
            className={`photo-image-frame${busy ? ' is-rendering' : ''}${interaction ? ' is-interactive' : ''}`}
            style={{ '--photo-zoom': zoom } as React.CSSProperties}
            data-testid="photo-image-frame"
            onPointerDown={beginGesture}
            onPointerMove={moveGesture}
            onPointerUp={endGesture}
            onPointerCancel={cancelGesture}
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
            <PhotoOverlays localAdjustments={localAdjustments} retouch={retouch} activeId={interaction?.id} />
            {busy ? <span className="photo-render-badge" role="status">Rendering preview…</span> : null}
          </div>
        )}
      </div>
    </section>
  );
}