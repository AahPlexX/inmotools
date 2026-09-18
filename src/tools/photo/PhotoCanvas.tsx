import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { classifyPhotoClipping, photoColorReadout, type PhotoColorReadout } from './photo-color-readout';
import PhotoCropOverlay, { type PhotoCompositionOverlay } from './PhotoCropOverlay';
import PhotoScopes from './PhotoScopes';
import { photoStraightenFromGuide } from './photo-crop';
import { createPhotoInspectionOverlay } from './photo-scopes';
import { photoSelectionWeight } from './photo-selection';
import { photoMaskWeight } from './photo-engine';
import { normalizePhotoMaskOverlay } from './photo-mask';
import type { LocalAdjustment, NormalizedCrop, PhotoHistogram, PhotoSelection, RetouchOperation } from './photo-types';
import './photo-comparison.css';
import './photo-observation.css';

export interface PhotoCanvasInteraction {
  kind: 'local' | 'retouch' | 'selection';
  id: string;
  label: string;
  mode: 'radial' | 'linear' | 'brush' | 'red-eye' | 'retouch-source' | 'retouch-target'
    | 'selection-rectangle' | 'selection-ellipse' | 'selection-lasso' | 'selection-color';
}

export interface PhotoCanvasGesture {
  start: { x: number; y: number; pressure: number };
  end: { x: number; y: number; pressure: number };
  path: Array<{ x: number; y: number; pressure: number }>;
  sampledColor?: { red: number; green: number; blue: number };
}

interface PhotoCanvasProps {
  previewUrl: string | null;
  proofBaseUrl?: string | null;
  originalUrl: string | null;
  compare: boolean;
  zoom: number;
  sourceName?: string;
  histogram?: PhotoHistogram | null;
  colorManaged?: boolean;
  busy?: boolean;
  localAdjustments?: LocalAdjustment[];
  retouch?: RetouchOperation[];
  selection?: PhotoSelection | null;
  interaction?: PhotoCanvasInteraction | null;
  crop?: NormalizedCrop;
  geometryMode?: 'crop' | 'straighten' | null;
  compositionOverlay?: PhotoCompositionOverlay;
  gridDivisions?: number;
  onGesture?: (gesture: PhotoCanvasGesture) => void;
  onCropCommit?: (crop: NormalizedCrop) => void;
  onStraightenCommit?: (degrees: number) => void;
  onZoomChange: (zoom: number) => void;
}

interface GestureState {
  pointerId: number;
  start: PhotoCanvasGesture['start'];
  path: PhotoCanvasGesture['path'];
}

interface StraightenGesture {
  pointerId: number;
  startClient: { x: number; y: number };
  startNormalized: { x: number; y: number };
  endNormalized: { x: number; y: number };
}

type PhotoCompareMode = 'split' | 'side-by-side';
type PhotoOverlayMode = 'clipping' | 'focus' | 'exposure-zones' | null;
type PhotoCanvasBackground = 'checkerboard' | 'dark' | 'light' | 'black';

interface PinnedPhotoSample {
  id: number;
  x: number;
  y: number;
  pixelX: number;
  pixelY: number;
  after: PhotoColorReadout;
  beforeProof?: PhotoColorReadout;
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
  proofBaseUrl,
  originalUrl,
  compare,
  zoom,
  sourceName,
  histogram,
  colorManaged = false,
  busy,
  localAdjustments = [],
  retouch = [],
  selection = null,
  interaction = null,
  crop = { x: 0, y: 0, width: 1, height: 1 },
  geometryMode = null,
  compositionOverlay = 'none',
  gridDivisions = 4,
  onGesture,
  onCropCommit,
  onStraightenCommit,
  onZoomChange,
}: PhotoCanvasProps) {
  const [gesture, setGesture] = useState<GestureState | null>(null);
  const [straightenGesture, setStraightenGesture] = useState<StraightenGesture | null>(null);
  const [overlayMode, setOverlayMode] = useState<PhotoOverlayMode>(null);
  const [scopesVisible, setScopesVisible] = useState(false);
  const [samplerActive, setSamplerActive] = useState(false);
  const [samples, setSamples] = useState<PinnedPhotoSample[]>([]);
  const [background, setBackground] = useState<PhotoCanvasBackground>('checkerboard');
  const [navigatorViewport, setNavigatorViewport] = useState({ left: 0, top: 0, width: 100, height: 100 });
  const [compareMode, setCompareMode] = useState<PhotoCompareMode>('split');
  const [compareSplit, setCompareSplit] = useState(50);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const proofBaseImageRef = useRef<HTMLImageElement | null>(null);
  const clippingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const localMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const nextSampleIdRef = useRef(1);

  useEffect(() => {
    setCompareMode('split');
    setCompareSplit(50);
  }, [originalUrl]);

  useEffect(() => {
    setSamples([]);
  }, [originalUrl]);

  useEffect(() => {
    const previewImage = previewImageRef.current;
    if (!previewImage) return;
    const proofImage = proofBaseImageRef.current;
    const refresh = () => {
      if (!previewImage.naturalWidth || !previewImage.naturalHeight) return;
      setSamples((current) => current.map((sample) => {
        const after = readPixelAtNormalized(previewImage, sample.x, sample.y);
        if (!after) return sample;
        const beforeProof = proofBaseUrl && proofImage
          ? readPixelAtNormalized(proofImage, sample.x, sample.y) ?? undefined
          : undefined;
        return {
          ...sample,
          pixelX: Math.min(previewImage.naturalWidth - 1, Math.max(0, Math.floor(sample.x * previewImage.naturalWidth))),
          pixelY: Math.min(previewImage.naturalHeight - 1, Math.max(0, Math.floor(sample.y * previewImage.naturalHeight))),
          after,
          beforeProof,
        };
      }));
    };
    if (previewImage.complete && (!proofImage || proofImage.complete)) refresh();
    previewImage.addEventListener('load', refresh);
    proofImage?.addEventListener('load', refresh);
    return () => {
      previewImage.removeEventListener('load', refresh);
      proofImage?.removeEventListener('load', refresh);
    };
  }, [previewUrl, proofBaseUrl]);

  useEffect(() => {
    if (geometryMode !== 'straighten') setStraightenGesture(null);
  }, [geometryMode]);

  useEffect(() => {
    if (!overlayMode || !previewUrl) return;
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
      let imageData: ImageData;
      try {
        imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      } catch {
        return;
      }
      if (overlayMode === 'clipping') {
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
      } else {
        const overlayPixels = createPhotoInspectionOverlay(imageData.data, canvas.width, canvas.height, overlayMode);
        const ownedOverlayPixels = new Uint8ClampedArray(overlayPixels.length);
        ownedOverlayPixels.set(overlayPixels);
        imageData = new ImageData(
          ownedOverlayPixels,
          canvas.width,
          canvas.height,
        );
      }
      context.putImageData(imageData, 0, 0);
    };

    if (image.complete) draw();
    else image.addEventListener('load', draw, { once: true });
    return () => image.removeEventListener('load', draw);
  }, [overlayMode, compareMode, previewUrl]);

  useEffect(() => {
    const image = previewImageRef.current;
    const canvas = selectionCanvasRef.current;
    if (!image || !canvas || !selection || !previewUrl) return;
    const draw = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let pixels: ImageData;
      try {
        pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      } catch {
        return;
      }
      for (let pixel = 0; pixel < canvas.width * canvas.height; pixel += 1) {
        const offset = pixel * 4;
        const weight = photoSelectionWeight(
          selection,
          (pixel % canvas.width + 0.5) / canvas.width,
          (Math.floor(pixel / canvas.width) + 0.5) / canvas.height,
          pixels.data[offset],
          pixels.data[offset + 1],
          pixels.data[offset + 2],
        );
        pixels.data[offset] = 34;
        pixels.data[offset + 1] = 211;
        pixels.data[offset + 2] = 238;
        pixels.data[offset + 3] = Math.round(weight * 105);
      }
      context.putImageData(pixels, 0, 0);
    };
    if (image.complete) draw();
    else image.addEventListener('load', draw, { once: true });
    return () => image.removeEventListener('load', draw);
  }, [selection, previewUrl]);

  useEffect(() => {
    const visibleMasks = localAdjustments
      .map((adjustment) => ({ adjustment, overlay: normalizePhotoMaskOverlay(adjustment.overlay) }))
      .filter(({ overlay }) => overlay.visible)
      .slice(0, 8)
      .map(({ adjustment, overlay }) => ({
        mask: adjustment.mask,
        opacity: overlay.opacity,
        red: Number.parseInt(overlay.color.slice(1, 3), 16),
        green: Number.parseInt(overlay.color.slice(3, 5), 16),
        blue: Number.parseInt(overlay.color.slice(5, 7), 16),
      }));
    const image = previewImageRef.current;
    const canvas = localMaskCanvasRef.current;
    if (!image || !canvas || !visibleMasks.length || !previewUrl) return;
    const draw = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let source: Uint8ClampedArray;
      try {
        source = new Uint8ClampedArray(context.getImageData(0, 0, canvas.width, canvas.height).data);
      } catch {
        return;
      }
      const output = context.createImageData(canvas.width, canvas.height);
      for (let pixel = 0; pixel < canvas.width * canvas.height; pixel += 1) {
        const offset = pixel * 4;
        let alpha = 0;
        let outRed = 0;
        let outGreen = 0;
        let outBlue = 0;
        for (const overlay of visibleMasks) {
          const weight = photoMaskWeight(
            overlay.mask,
            (pixel % canvas.width + 0.5) / canvas.width,
            (Math.floor(pixel / canvas.width) + 0.5) / canvas.height,
            source[offset],
            source[offset + 1],
            source[offset + 2],
          ) * overlay.opacity;
          if (weight <= 0) continue;
          const nextAlpha = alpha + weight * (1 - alpha);
          outRed = (outRed * alpha * (1 - weight) + overlay.red * weight) / nextAlpha;
          outGreen = (outGreen * alpha * (1 - weight) + overlay.green * weight) / nextAlpha;
          outBlue = (outBlue * alpha * (1 - weight) + overlay.blue * weight) / nextAlpha;
          alpha = nextAlpha;
        }
        output.data[offset] = Math.round(outRed);
        output.data[offset + 1] = Math.round(outGreen);
        output.data[offset + 2] = Math.round(outBlue);
        output.data[offset + 3] = Math.round(alpha * 255);
      }
      context.putImageData(output, 0, 0);
    };
    if (image.complete) draw();
    else image.addEventListener('load', draw, { once: true });
    return () => image.removeEventListener('load', draw);
  }, [localAdjustments, previewUrl]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !previewUrl) return;
    const update = () => {
      const scrollWidth = Math.max(scroller.clientWidth, scroller.scrollWidth);
      const scrollHeight = Math.max(scroller.clientHeight, scroller.scrollHeight);
      setNavigatorViewport({
        left: scroller.scrollLeft / scrollWidth * 100,
        top: scroller.scrollTop / scrollHeight * 100,
        width: Math.min(100, scroller.clientWidth / scrollWidth * 100),
        height: Math.min(100, scroller.clientHeight / scrollHeight * 100),
      });
    };
    const frame = requestAnimationFrame(update);
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [previewUrl, zoom, compareMode]);

  function sampleAtPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const image = previewImageRef.current;
    if (!image?.naturalWidth || !image.naturalHeight) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    try {
      const after = readPixelAtNormalized(image, nx, ny);
      if (!after) return;
      const beforeProof = proofBaseUrl && proofBaseImageRef.current
        ? readPixelAtNormalized(proofBaseImageRef.current, nx, ny) ?? undefined
        : undefined;
      setSamples((current) => [...current, {
        id: nextSampleIdRef.current++,
        x: nx,
        y: ny,
        pixelX: Math.min(image.naturalWidth - 1, Math.max(0, Math.floor(nx * image.naturalWidth))),
        pixelY: Math.min(image.naturalHeight - 1, Math.max(0, Math.floor(ny * image.naturalHeight))),
        after,
        beforeProof,
      }].slice(-8));
    } catch {
      // Ignore canvas security errors from unexpected non-local image sources.
    }
  }

  function readPixelAtNormalized(sampleImage: HTMLImageElement, x: number, y: number): PhotoColorReadout | null {
    if (!sampleImage.naturalWidth || !sampleImage.naturalHeight) return null;
    const sx = Math.min(sampleImage.naturalWidth - 1, Math.max(0, Math.floor(x * sampleImage.naturalWidth)));
    const sy = Math.min(sampleImage.naturalHeight - 1, Math.max(0, Math.floor(y * sampleImage.naturalHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) return null;
    context.drawImage(sampleImage, sx, sy, 1, 1, 0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    return photoColorReadout(pixel[0], pixel[1], pixel[2], pixel[3]);
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
    const sample = interaction.mode === 'selection-color' && previewImageRef.current
      ? readPixelAtNormalized(previewImageRef.current, end.x, end.y)
      : null;
    onGesture({
      start: gesture.start,
      end,
      path,
      sampledColor: sample ? { red: sample.r, green: sample.g, blue: sample.b } : undefined,
    });
    setGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancelGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture?.pointerId === event.pointerId) setGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function beginStraightenGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (geometryMode !== 'straighten' || !onStraightenCommit || !originalUrl) return;
    event.preventDefault();
    const point = pointerPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setStraightenGesture({
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startNormalized: { x: point.x, y: point.y },
      endNormalized: { x: point.x, y: point.y },
    });
  }

  function moveStraightenGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!straightenGesture || straightenGesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointerPoint(event);
    setStraightenGesture((current) => current
      ? { ...current, endNormalized: { x: point.x, y: point.y } }
      : current);
  }

  function endStraightenGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!straightenGesture || straightenGesture.pointerId !== event.pointerId || !onStraightenCommit) return;
    event.preventDefault();
    const correction = photoStraightenFromGuide(
      straightenGesture.startClient,
      { x: event.clientX, y: event.clientY },
    );
    setStraightenGesture(null);
    if (correction !== null) onStraightenCommit(correction);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancelStraightenGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (straightenGesture?.pointerId === event.pointerId) setStraightenGesture(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const canvasInteractive = Boolean(interaction || samplerActive);
  const geometryActive = Boolean(geometryMode && originalUrl);
  const comparisonActive = Boolean(!geometryActive && compare && originalUrl && previewUrl);

  function inspectionLayers() {
    return <>
      {overlayMode ? <canvas ref={clippingCanvasRef} className="photo-clipping-overlay" data-testid={`photo-${overlayMode}-overlay`} aria-hidden="true" /> : null}
      {selection ? <canvas ref={selectionCanvasRef} className="photo-selection-overlay" data-testid="photo-selection-overlay" aria-hidden="true" /> : null}
      {localAdjustments.some((adjustment) => normalizePhotoMaskOverlay(adjustment.overlay).visible) ? <canvas ref={localMaskCanvasRef} className="photo-mask-overlay" data-testid="photo-mask-overlay" aria-hidden="true" /> : null}
      {samples.length ? (
        <svg className="photo-sampler-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {samples.map((sample, index) => <g key={sample.id} transform={`translate(${sample.x * 100} ${sample.y * 100})`}>
            <circle r="2.25" />
            <text x="3" y="-3">{index + 1}</text>
          </g>)}
        </svg>
      ) : null}
    </>;
  }

  function editedSurface(className: string, testId?: string) {
    return (
      <div
        className={`${className}${busy ? ' is-rendering' : ''}${canvasInteractive ? ' is-interactive' : ''}`}
        data-testid={testId}
        onPointerDown={beginGesture}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={cancelGesture}
      >
        <img
          ref={previewImageRef}
          src={previewUrl ?? undefined}
          alt={`Edited preview of ${sourceName || 'selected photo'}`}
          className="photo-preview-image"
          data-testid="photo-preview"
          draggable={false}
        />
        {inspectionLayers()}
        <PhotoOverlays localAdjustments={localAdjustments} retouch={retouch} activeId={interaction?.id} />
        {busy ? <span className="photo-render-badge" role="status">Rendering preview…</span> : null}
      </div>
    );
  }

  function geometrySurface() {
    if (!originalUrl) return null;
    return (
      <div
        className="photo-image-frame photo-geometry-frame is-interactive"
        style={{ '--photo-zoom': zoom, '--photo-inverse-zoom': 1 / Math.max(zoom, 0.01) } as React.CSSProperties}
        data-testid="photo-image-frame"
        onPointerDown={geometryMode === 'straighten' ? beginStraightenGesture : undefined}
        onPointerMove={geometryMode === 'straighten' ? moveStraightenGesture : undefined}
        onPointerUp={geometryMode === 'straighten' ? endStraightenGesture : undefined}
        onPointerCancel={geometryMode === 'straighten' ? cancelStraightenGesture : undefined}
      >
        <img
          src={originalUrl}
          alt={`Geometry reference for ${sourceName || 'selected photo'}`}
          className="photo-preview-image"
          data-testid="photo-geometry-reference"
          draggable={false}
        />
        <PhotoCropOverlay
          crop={crop}
          compositionOverlay={compositionOverlay}
          gridDivisions={gridDivisions}
          interactive={geometryMode === 'crop' && Boolean(onCropCommit)}
          onCommit={(nextCrop) => onCropCommit?.(nextCrop)}
        />
        {straightenGesture ? (
          <svg className="photo-straighten-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line
              x1={straightenGesture.startNormalized.x * 100}
              y1={straightenGesture.startNormalized.y * 100}
              x2={straightenGesture.endNormalized.x * 100}
              y2={straightenGesture.endNormalized.y * 100}
            />
          </svg>
        ) : null}
      </div>
    );
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
        {comparisonActive ? (
          <div className="photo-comparison-controls" role="group" aria-label="Before and after comparison controls">
            <div className="photo-comparison-mode-buttons">
              <button type="button" aria-pressed={compareMode === 'split'} onClick={() => setCompareMode('split')}>Split</button>
              <button type="button" aria-pressed={compareMode === 'side-by-side'} onClick={() => setCompareMode('side-by-side')}>Side by side</button>
            </div>
            {compareMode === 'split' ? (
              <label className="photo-compare-range">
                <span>Split {compareSplit}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={compareSplit}
                  aria-label="Before/after split position"
                  onChange={(event) => setCompareSplit(Number(event.target.value))}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        <div className="photo-observation-controls" role="group" aria-label="Image inspection controls">
          <button
            type="button"
            aria-pressed={overlayMode === 'clipping'}
            disabled={!previewUrl}
            onClick={() => setOverlayMode((value) => value === 'clipping' ? null : 'clipping')}
          >Clipping warnings</button>
          <button
            type="button"
            aria-pressed={overlayMode === 'focus'}
            disabled={!previewUrl}
            onClick={() => setOverlayMode((value) => value === 'focus' ? null : 'focus')}
          >Focus map</button>
          <button
            type="button"
            aria-pressed={overlayMode === 'exposure-zones'}
            disabled={!previewUrl}
            onClick={() => setOverlayMode((value) => value === 'exposure-zones' ? null : 'exposure-zones')}
          >Exposure zones</button>
          <button
            type="button"
            aria-pressed={samplerActive}
            disabled={!previewUrl || Boolean(interaction) || geometryActive}
            onClick={() => setSamplerActive((value) => !value)}
          >Color sampler</button>
          <button
            type="button"
            aria-pressed={scopesVisible}
            disabled={!previewUrl}
            onClick={() => setScopesVisible((value) => !value)}
          >Scopes</button>
          <label className="photo-canvas-background-control">
            <span>Background</span>
            <select aria-label="Canvas background" value={background} onChange={(event) => setBackground(event.target.value as PhotoCanvasBackground)}>
              <option value="checkerboard">Checkerboard</option>
              <option value="dark">Dark gray</option>
              <option value="light">Light gray</option>
              <option value="black">Black</option>
            </select>
          </label>
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

      {interaction ? <div className="photo-tool-hint" role="status">{interaction.label} · {interaction.mode === 'selection-color' || interaction.mode === 'red-eye' || interaction.mode.startsWith('retouch-') ? 'click or tap the photo to place it' : 'drag on the photo to place it'}</div> : null}
      {geometryMode === 'crop' ? <div className="photo-tool-hint" role="status">Crop editing active · drag the frame or its handles. The numerical crop controls remain available for precise keyboard entry.</div> : null}
      {geometryMode === 'straighten' ? <div className="photo-tool-hint" role="status">Straighten active · drag along a horizon or vertical reference. The measured correction remains editable below.</div> : null}
      {samplerActive && !geometryActive ? <div className="photo-tool-hint" role="status">Color sampler active · click or tap the photo to pin up to eight rendered pixels</div> : null}
      {samples.length ? (
        <section className="photo-color-readout" role="status" aria-label="Sampled color readout">
          <header><strong>{samples.length} pinned sample{samples.length === 1 ? '' : 's'}</strong><button type="button" onClick={() => setSamples([])}>Clear samples</button></header>
          <ol>
            {samples.map((sample, index) => <li key={sample.id}>
              <strong>#{index + 1} · pixel {sample.pixelX}, {sample.pixelY} · {sample.after.hex}</strong>
              {sample.beforeProof ? <span>Before proof {sample.beforeProof.hex} RGB {sample.beforeProof.r}, {sample.beforeProof.g}, {sample.beforeProof.b} → After proof RGB {sample.after.r}, {sample.after.g}, {sample.after.b}</span> : <span>RGB {sample.after.r}, {sample.after.g}, {sample.after.b} · HSL {sample.after.hue}°, {sample.after.saturation}%, {sample.after.lightness}%</span>}
              {colorManaged ? <span>XYZ D65 {sample.after.xyz.x}, {sample.after.xyz.y}, {sample.after.xyz.z} · Lab D65 {sample.after.lab.l}, {sample.after.lab.a}, {sample.after.lab.b}</span> : null}
              {sample.after.a < 255 ? <span>Alpha {Math.round(sample.after.a / 255 * 100)}%</span> : null}
              <button type="button" aria-label={`Remove pinned sample ${index + 1}`} onClick={() => setSamples((current) => current.filter((item) => item.id !== sample.id))}>Remove</button>
            </li>)}
          </ol>
        </section>
      ) : null}

      {scopesVisible && previewUrl ? <PhotoScopes previewUrl={previewUrl} /> : null}

      {proofBaseUrl ? <img ref={proofBaseImageRef} data-testid="photo-proof-base" src={proofBaseUrl} alt="" hidden aria-hidden="true" /> : null}

      <div ref={scrollerRef} className={`photo-canvas-scroller photo-canvas-background-${background}`} data-photo-canvas>
        {!previewUrl ? (
          <div className="photo-empty-state">
            <div className="photo-empty-icon" aria-hidden="true">▧</div>
            <h3>Open a photo to begin</h3>
            <p>Your source stays on this device. Every adjustment remains reversible until you export a new copy.</p>
          </div>
        ) : geometryActive ? (
          geometrySurface()
        ) : comparisonActive && compareMode === 'side-by-side' ? (
          <div
            className="photo-compare-side-by-side"
            data-testid="photo-compare-side-by-side"
            style={{ '--photo-zoom': zoom } as React.CSSProperties}
          >
            <div className="photo-compare-pane photo-compare-before-pane" data-testid="photo-compare-before-image">
              <img src={originalUrl ?? undefined} alt={`Original before view of ${sourceName || 'selected photo'}`} draggable={false} />
              <span className="photo-compare-pane-label">Before</span>
            </div>
            <div className="photo-compare-pane-wrap" data-testid="photo-compare-after-image">
              {editedSurface('photo-compare-pane photo-compare-after-pane')}
              <span className="photo-compare-pane-label">After</span>
            </div>
          </div>
        ) : (
          <div
            className={`photo-image-frame${busy ? ' is-rendering' : ''}${canvasInteractive ? ' is-interactive' : ''}`}
            style={{ '--photo-zoom': zoom, '--photo-compare-split': `${compareSplit}%` } as React.CSSProperties}
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
            {comparisonActive ? (
              <>
                <div className="photo-before-overlay" data-testid="photo-before-overlay" aria-hidden="true">
                  <img src={originalUrl ?? undefined} alt="" draggable={false} />
                  <span className="photo-before-label">Before</span>
                </div>
                <span className="photo-compare-divider" aria-hidden="true" />
              </>
            ) : null}
            {inspectionLayers()}
            <PhotoOverlays localAdjustments={localAdjustments} retouch={retouch} activeId={interaction?.id} />
            {busy ? <span className="photo-render-badge" role="status">Rendering preview…</span> : null}
          </div>
        )}
      </div>
      {previewUrl && zoom > 1 ? (
        <button
          type="button"
          className="photo-navigator"
          aria-label="Navigator minimap"
          onClick={(event) => {
            const scroller = scrollerRef.current;
            if (!scroller) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
            scroller.scrollTo({
              left: x * scroller.scrollWidth - scroller.clientWidth / 2,
              top: y * scroller.scrollHeight - scroller.clientHeight / 2,
            });
          }}
        >
          <img src={previewUrl} alt="" aria-hidden="true" />
          <span aria-hidden="true" style={{
            left: `${navigatorViewport.left}%`,
            top: `${navigatorViewport.top}%`,
            width: `${navigatorViewport.width}%`,
            height: `${navigatorViewport.height}%`,
          }} />
        </button>
      ) : null}
    </section>
  );
}
