import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { adjustPhotoCrop, type PhotoCropHandle } from './photo-crop';
import type { NormalizedCrop } from './photo-types';

export type PhotoCompositionOverlay = 'none' | 'thirds' | 'grid' | 'diagonal' | 'golden';

interface PhotoCropOverlayProps {
  crop: NormalizedCrop;
  compositionOverlay: PhotoCompositionOverlay;
  gridDivisions: number;
  interactive: boolean;
  onCommit: (crop: NormalizedCrop) => void;
}

interface CropGesture {
  pointerId: number;
  handle: PhotoCropHandle;
  startX: number;
  startY: number;
  crop: NormalizedCrop;
}

const HANDLE_LABELS: Record<PhotoCropHandle, string> = {
  move: 'Move crop frame',
  n: 'Crop top edge',
  s: 'Crop bottom edge',
  e: 'Crop right edge',
  w: 'Crop left edge',
  ne: 'Crop top right corner',
  nw: 'Crop top left corner',
  se: 'Crop bottom right corner',
  sw: 'Crop bottom left corner',
};

const RESIZE_HANDLES: PhotoCropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function cropStyle(crop: NormalizedCrop): CSSProperties {
  return {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };
}

function handleStyle(crop: NormalizedCrop, handle: PhotoCropHandle): CSSProperties {
  const left = handle.includes('w') ? crop.x : handle.includes('e') ? crop.x + crop.width : crop.x + crop.width / 2;
  const top = handle.includes('n') ? crop.y : handle.includes('s') ? crop.y + crop.height : crop.y + crop.height / 2;
  return { left: `${left * 100}%`, top: `${top * 100}%` };
}

function CompositionGuides({ mode, gridDivisions }: { mode: PhotoCompositionOverlay; gridDivisions: number }) {
  if (mode === 'none') return null;
  const label = { thirds: 'Rule of thirds', grid: 'Grid', diagonal: 'Diagonal', golden: 'Golden ratio' }[mode];
  if (mode === 'diagonal') {
    return (
      <svg className="photo-composition-guides" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} composition guides`}>
        <line x1="0" y1="0" x2="100" y2="100" />
        <line x1="100" y1="0" x2="0" y2="100" />
      </svg>
    );
  }

  const gridDivisionsCount = Math.max(2, Math.min(10, Math.round(gridDivisions)));
  const positions = mode === 'thirds'
    ? [100 / 3, 200 / 3]
    : mode === 'golden'
      ? [38.196601125, 61.803398875]
      : Array.from({ length: gridDivisionsCount - 1 }, (_, index) => (index + 1) * 100 / gridDivisionsCount);
  return (
    <svg className="photo-composition-guides" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} composition guides`}>
      {positions.map((position) => (
        <g key={position}>
          <line data-guide="vertical" x1={position} y1="0" x2={position} y2="100" />
          <line data-guide="horizontal" x1="0" y1={position} x2="100" y2={position} />
        </g>
      ))}
    </svg>
  );
}

export default function PhotoCropOverlay({ crop, compositionOverlay, gridDivisions, interactive, onCommit }: PhotoCropOverlayProps) {
  const [draft, setDraft] = useState(crop);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<CropGesture | null>(null);

  useEffect(() => {
    if (!gestureRef.current) setDraft(crop);
  }, [crop]);

  function beginGesture(handle: PhotoCropHandle, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!interactive || !rootRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      crop: draft,
    };
  }

  function cropFromPointer(event: ReactPointerEvent<HTMLButtonElement>): NormalizedCrop | null {
    const gesture = gestureRef.current;
    const root = rootRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !root) return null;
    const rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return gesture.crop;
    return adjustPhotoCrop(
      gesture.crop,
      gesture.handle,
      (event.clientX - gesture.startX) / rect.width,
      (event.clientY - gesture.startY) / rect.height,
    );
  }

  function moveGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    const next = cropFromPointer(event);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    setDraft(next);
  }

  function endGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    const next = cropFromPointer(event);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = null;
    setDraft(next);
    onCommit(next);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancelGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = null;
    setDraft(crop);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function keyboardAdjust(handle: PhotoCropHandle, event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 0.05 : 0.01;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    event.stopPropagation();
    const next = adjustPhotoCrop(draft, handle, dx, dy);
    setDraft(next);
    onCommit(next);
  }

  function interactionProps(handle: PhotoCropHandle) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => beginGesture(handle, event),
      onPointerMove: moveGesture,
      onPointerUp: endGesture,
      onPointerCancel: cancelGesture,
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => keyboardAdjust(handle, event),
    };
  }

  return (
    <div
      ref={rootRef}
      className={`photo-crop-overlay${interactive ? ' is-interactive' : ''}`}
      data-testid="photo-crop-overlay"
      data-composition-overlay={compositionOverlay}
      aria-hidden={interactive ? undefined : true}
    >
      <span className="photo-crop-dim photo-crop-dim-top" style={{ height: `${draft.y * 100}%` }} />
      <span className="photo-crop-dim photo-crop-dim-left" style={{ top: `${draft.y * 100}%`, width: `${draft.x * 100}%`, height: `${draft.height * 100}%` }} />
      <span className="photo-crop-dim photo-crop-dim-right" style={{ top: `${draft.y * 100}%`, left: `${(draft.x + draft.width) * 100}%`, right: 0, height: `${draft.height * 100}%` }} />
      <span className="photo-crop-dim photo-crop-dim-bottom" style={{ top: `${(draft.y + draft.height) * 100}%`, bottom: 0 }} />
      <span className="photo-crop-frame" style={cropStyle(draft)}>
        <CompositionGuides mode={compositionOverlay} gridDivisions={gridDivisions} />
      </span>
      {interactive ? (
        <>
          <button
            type="button"
            className="photo-crop-move-target"
            aria-label={HANDLE_LABELS.move}
            style={cropStyle(draft)}
            {...interactionProps('move')}
          />
          {RESIZE_HANDLES.map((handle) => (
            <button
              type="button"
              key={handle}
              className={`photo-crop-handle photo-crop-handle-${handle}`}
              aria-label={HANDLE_LABELS[handle]}
              style={handleStyle(draft, handle)}
              {...interactionProps(handle)}
            />
          ))}
          <output className="photo-crop-readout" aria-live="polite">
            {Math.round(draft.width * 1000) / 10}% × {Math.round(draft.height * 1000) / 10}%
          </output>
        </>
      ) : null}
    </div>
  );
}
