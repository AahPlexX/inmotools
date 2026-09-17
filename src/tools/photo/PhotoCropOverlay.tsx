import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import PhotoCompositionOverlay, { type PhotoCompositionMode } from './PhotoCompositionOverlay';
import { adjustPhotoCrop, type PhotoCropHandle } from './photo-crop';
import type { NormalizedCrop } from './photo-types';
import './photo-crop.css';

const HANDLES = [
  ['nw', 'top left', 0, 0], ['n', 'top', 50, 0], ['ne', 'top right', 100, 0],
  ['w', 'left', 0, 50], ['e', 'right', 100, 50],
  ['sw', 'bottom left', 0, 100], ['s', 'bottom', 50, 100], ['se', 'bottom right', 100, 100],
] as const;

export default function PhotoCropOverlay({ sourceUrl, sourceName, sourceWidth, crop, zoom, composition, divisions, onCommit }: {
  sourceUrl: string; sourceName?: string; sourceWidth: number; crop: NormalizedCrop; zoom: number;
  composition: PhotoCompositionMode; divisions: number; onCommit: (crop: NormalizedCrop) => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; handle: PhotoCropHandle; crop: NormalizedCrop; x: number; y: number; width: number; height: number; target: HTMLButtonElement } | null>(null);
  const [draft, setDraft] = useState<NormalizedCrop | null>(null);
  const displayed = draft ?? crop;

  const cancel = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (active?.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
  }, []);
  useEffect(() => { cancel(); }, [crop, cancel]);

  function begin(event: PointerEvent<HTMLButtonElement>, handle: PhotoCropHandle) {
    if (gesture.current || event.button !== 0 || !event.isPrimary) return;
    const rect = surface.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, handle, crop, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, target: event.currentTarget };
  }
  function result(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    return active && active.pointerId === event.pointerId && active.crop === crop
      ? adjustPhotoCrop(crop, active.handle, (event.clientX - active.x) / active.width, (event.clientY - active.y) / active.height) : null;
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const next = result(event);
    if (!next) return;
    event.preventDefault();
    cancel();
    onCommit(next);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, handle: PhotoCropHandle) {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
    if (gesture.current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.1 : 0.01;
    onCommit(adjustPhotoCrop(crop, handle, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
      event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
  }
  return <div ref={surface} className="photo-crop-surface" data-testid="photo-crop-surface"
    style={{ width: Math.min(800, sourceWidth), transform: `scale(${zoom})` }}
    onPointerMove={(event) => { const next = result(event); if (next) setDraft(next); }}
    onPointerUp={finish} onPointerCancel={(event) => { if (gesture.current?.pointerId === event.pointerId) cancel(); }}
    onLostPointerCapture={(event) => { if (gesture.current?.pointerId === event.pointerId) cancel(); }}>
    <img src={sourceUrl} alt={`Crop source of ${sourceName || 'selected photo'}`} data-testid="photo-crop-source" draggable={false} />
    <svg className="photo-crop-shade" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path fillRule="evenodd" d={`M0,0H100V100H0Z M${displayed.x * 100},${displayed.y * 100}h${displayed.width * 100}v${displayed.height * 100}h${-displayed.width * 100}Z`} />
    </svg>
    <div className="photo-crop-frame" style={{ left: `${displayed.x * 100}%`, top: `${displayed.y * 100}%`, width: `${displayed.width * 100}%`, height: `${displayed.height * 100}%` }}>
      <PhotoCompositionOverlay mode={composition} divisions={divisions} />
      <button type="button" className="photo-crop-move" aria-label="Move crop frame" aria-describedby="photo-crop-help"
        onPointerDown={(event) => begin(event, 'move')} onKeyDown={(event) => keyboard(event, 'move')} />
      {HANDLES.map(([handle, label, x, y]) => <button key={handle} type="button" className={`photo-crop-handle photo-crop-${handle}`}
        style={{ left: `${x}%`, top: `${y}%` }} aria-label={`Resize crop ${label}`} aria-describedby="photo-crop-help"
        onPointerDown={(event) => begin(event, handle)} onKeyDown={(event) => keyboard(event, handle)} />)}
    </div>
  </div>;
}
