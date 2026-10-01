import { useState } from 'react';
import PhotoSliderControl from './PhotoSliderControl';
import {
  CORNER_KEYS,
  expandedDimensions,
  NEUTRAL_CORNERS,
  NEUTRAL_FREE_TRANSFORM,
  normalizeCanvasExpansion,
  normalizeCornerOffsets,
  normalizeFreeTransform,
  type PhotoCanvasExpansion,
  type PhotoCornerOffsets,
  type PhotoFreeTransform,
} from './photo-transform';

export interface PhotoTransformControlsProps {
  freeTransform: PhotoFreeTransform | null;
  perspectiveCorners: PhotoCornerOffsets | null;
  canvasExpansion: PhotoCanvasExpansion | null;
  /** Edited photo size at 100 %, before any canvas change; null until a photo is open. */
  frame: { width: number; height: number } | null;
  onChange: (patch: {
    freeTransform?: PhotoFreeTransform | null;
    perspectiveCorners?: PhotoCornerOffsets | null;
    canvasExpansion?: PhotoCanvasExpansion | null;
  }) => void;
  /** Renders the finished photo and trims fully transparent edges; resolves to a status message. */
  onTrimTransparent: () => Promise<string>;
}

const CORNER_LABELS: Record<(typeof CORNER_KEYS)[number], string> = {
  topLeft: 'Top-left corner',
  topRight: 'Top-right corner',
  bottomRight: 'Bottom-right corner',
  bottomLeft: 'Bottom-left corner',
};

const SIDES = [
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
] as const;

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

/** Free transform, four-corner perspective, and canvas size for the Crop & geometry panel. Values
 * are shown as percentages of the photo so they read the same at any export size. */
export default function PhotoTransformControls({
  freeTransform,
  perspectiveCorners,
  canvasExpansion,
  frame,
  onChange,
  onTrimTransparent,
}: PhotoTransformControlsProps) {
  const [keepProportions, setKeepProportions] = useState(true);
  const [sameOnAllSides, setSameOnAllSides] = useState(false);
  const [trimBusy, setTrimBusy] = useState(false);
  const [trimMessage, setTrimMessage] = useState('');
  const transform = freeTransform ?? NEUTRAL_FREE_TRANSFORM;
  const corners = perspectiveCorners ?? NEUTRAL_CORNERS;
  const expansion: PhotoCanvasExpansion = canvasExpansion ?? { top: 0, right: 0, bottom: 0, left: 0, fill: 'transparent', color: '#ffffff' };
  const disabled = !frame;

  function patchTransform(patch: Partial<PhotoFreeTransform>) {
    onChange({ freeTransform: normalizeFreeTransform({ ...transform, ...patch }) });
  }

  function setScale(axis: 'scaleX' | 'scaleY', percent: number) {
    const value = percent / 100;
    if (!keepProportions) { patchTransform({ [axis]: value }); return; }
    // Keep the current width:height ratio, so a stretched photo stays stretched by the same amount.
    const ratio = axis === 'scaleX' ? transform.scaleY / transform.scaleX : transform.scaleX / transform.scaleY;
    const other = axis === 'scaleX' ? 'scaleY' : 'scaleX';
    patchTransform({ [axis]: value, [other]: value * ratio });
  }

  function patchCorner(key: (typeof CORNER_KEYS)[number], axis: 'x' | 'y', percent: number) {
    onChange({ perspectiveCorners: normalizeCornerOffsets({ ...corners, [key]: { ...corners[key], [axis]: percent / 100 } }) });
  }

  function patchExpansion(patch: Partial<PhotoCanvasExpansion>) {
    onChange({ canvasExpansion: normalizeCanvasExpansion({ ...expansion, ...patch }) });
  }

  function setSide(side: (typeof SIDES)[number]['key'], percent: number) {
    const value = percent / 100;
    patchExpansion(sameOnAllSides ? { top: value, right: value, bottom: value, left: value } : { [side]: value });
  }

  const output = frame ? expandedDimensions(frame.width, frame.height, canvasExpansion) : null;
  const trimmed = SIDES.some(({ key }) => expansion[key] < 0);

  return (
    <>
      <details className="photo-section" data-testid="photo-free-transform">
        <summary>Free transform</summary>
        <p className="photo-export-note">Move, resize, or turn the photo inside its frame. Any area it uncovers becomes transparent; fill it with Canvas size or trim it away.</p>
        <PhotoSliderControl label="Move right %" value={round(transform.x * 100)} min={-100} max={100} step={0.5} onChange={(value) => patchTransform({ x: value / 100 })} />
        <PhotoSliderControl label="Move down %" value={round(transform.y * 100)} min={-100} max={100} step={0.5} onChange={(value) => patchTransform({ y: value / 100 })} />
        <label className="photo-check-row">
          <input type="checkbox" checked={keepProportions} onChange={(event) => setKeepProportions(event.target.checked)} />
          Keep proportions
        </label>
        <PhotoSliderControl label="Width scale %" value={round(transform.scaleX * 100)} min={10} max={400} step={1} neutral={100} onChange={(value) => setScale('scaleX', value)} />
        <PhotoSliderControl label="Height scale %" value={round(transform.scaleY * 100)} min={10} max={400} step={1} neutral={100} onChange={(value) => setScale('scaleY', value)} />
        <PhotoSliderControl label="Transform rotation degrees" value={round(transform.rotation)} min={-180} max={180} step={0.5} onChange={(value) => patchTransform({ rotation: value })} />
        <div className="photo-inline-actions">
          <button type="button" disabled={disabled || !freeTransform} onClick={() => onChange({ freeTransform: null })}>Reset free transform</button>
        </div>
      </details>

      <details className="photo-section" data-testid="photo-corner-perspective">
        <summary>Corner perspective</summary>
        <p className="photo-export-note">Move each corner independently to square up a sign, screen, or document shot at an angle. Values are percentages of the photo’s width (horizontal) and height (vertical); positive moves right or down.</p>
        {CORNER_KEYS.map((key) => (
          <fieldset key={key} className="photo-corner-fieldset">
            <legend>{CORNER_LABELS[key]}</legend>
            <PhotoSliderControl label={`${CORNER_LABELS[key]} horizontal %`} value={round(corners[key].x * 100)} min={-50} max={50} step={0.25} onChange={(value) => patchCorner(key, 'x', value)} />
            <PhotoSliderControl label={`${CORNER_LABELS[key]} vertical %`} value={round(corners[key].y * 100)} min={-50} max={50} step={0.25} onChange={(value) => patchCorner(key, 'y', value)} />
          </fieldset>
        ))}
        <div className="photo-inline-actions">
          <button type="button" disabled={disabled || !perspectiveCorners} onClick={() => onChange({ perspectiveCorners: null })}>Reset corners</button>
        </div>
      </details>

      <details className="photo-section" data-testid="photo-canvas-size">
        <summary>Canvas size</summary>
        <p className="photo-export-note">Add space around the finished photo for a border, caption area, or a square post. Layers and masks stay on the photo itself.</p>
        <label className="photo-check-row">
          <input type="checkbox" checked={sameOnAllSides} onChange={(event) => setSameOnAllSides(event.target.checked)} />
          Same on all sides
        </label>
        {SIDES.map(({ key, label }) => (
          <PhotoSliderControl
            key={key}
            label={`Add to ${label.toLowerCase()} %`}
            value={round(expansion[key] * 100)}
            min={trimmed ? -45 : 0}
            max={200}
            step={0.5}
            onChange={(value) => setSide(key, value)}
          />
        ))}
        <label className="photo-control">
          <span>Added canvas</span>
          <select aria-label="Added canvas fill" value={expansion.fill} onChange={(event) => patchExpansion({ fill: event.target.value === 'color' ? 'color' : 'transparent' })}>
            <option value="transparent">Transparent</option>
            <option value="color">Solid color</option>
          </select>
        </label>
        {trimmed ? <p className="photo-export-note">Negative values trim that much off the finished photo.</p> : null}
        {expansion.fill === 'color' ? (
          <label className="photo-control">
            <span>Canvas color</span>
            <input type="color" aria-label="Canvas color" value={expansion.color} onChange={(event) => patchExpansion({ color: event.target.value })} />
          </label>
        ) : (
          <p className="photo-export-note">JPEG has no transparency, so transparent canvas exports in the JPEG background color.</p>
        )}
        {frame && output ? (
          <p className="photo-export-note" data-testid="photo-canvas-size-readout">
            {canvasExpansion ? `Photo ${frame.width} × ${frame.height} px → canvas ${output.width} × ${output.height} px at full size.` : `Canvas matches the photo: ${frame.width} × ${frame.height} px.`}
          </p>
        ) : null}
        <div className="photo-inline-actions">
          <button
            type="button"
            disabled={disabled || trimBusy}
            onClick={() => {
              setTrimBusy(true);
              setTrimMessage('');
              onTrimTransparent()
                .then(setTrimMessage)
                .catch((error: unknown) => setTrimMessage(`Trimming failed: ${error instanceof Error ? error.message : 'unknown error'}`))
                .finally(() => setTrimBusy(false));
            }}
          >{trimBusy ? 'Finding edges…' : 'Trim transparent edges'}</button>
          <button type="button" disabled={disabled || !canvasExpansion} onClick={() => onChange({ canvasExpansion: null })}>Reset canvas size</button>
        </div>
        {trimMessage ? <p className="photo-export-note" role="status">{trimMessage}</p> : null}
      </details>
    </>
  );
}
