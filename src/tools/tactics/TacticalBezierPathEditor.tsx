import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createNormalizedPoint } from './pitch-engine';
import type { NormalizedPoint, TacticalMotionPathKind } from './tactics-types';

interface TacticalBezierPathEditorProps {
  kind: TacticalMotionPathKind;
  start: NormalizedPoint;
  end: NormalizedPoint;
  controls: [NormalizedPoint, NormalizedPoint];
  onEndChange: (point: NormalizedPoint) => void;
  onControlsChange: (controls: [NormalizedPoint, NormalizedPoint]) => void;
}

type Handle = 'end' | 0 | 1;

const percent = (value: number) => Number((value * 100).toFixed(1));
const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

function pathData(
  kind: TacticalMotionPathKind,
  start: NormalizedPoint,
  end: NormalizedPoint,
  controls: [NormalizedPoint, NormalizedPoint],
): string {
  const p = (point: NormalizedPoint) => `${percent(point.x)} ${percent(point.y)}`;
  if (kind === 'quadratic-bezier') return `M ${p(start)} Q ${p(controls[0])} ${p(end)}`;
  if (kind === 'cubic-bezier') return `M ${p(start)} C ${p(controls[0])} ${p(controls[1])} ${p(end)}`;
  return `M ${p(start)} L ${p(end)}`;
}

export default function TacticalBezierPathEditor({
  kind,
  start,
  end,
  controls,
  onEndChange,
  onControlsChange,
}: TacticalBezierPathEditorProps) {
  const [activeHandle, setActiveHandle] = useState<Handle | null>(null);
  const activeHandleRef = useRef<Handle | null>(null);

  function updateHandle(handle: Handle, point: NormalizedPoint) {
    if (handle === 'end') {
      onEndChange(point);
      return;
    }
    const next: [NormalizedPoint, NormalizedPoint] = [{ ...controls[0] }, { ...controls[1] }];
    next[handle] = point;
    onControlsChange(next);
  }

  function pointFromPointer(event: PointerEvent<SVGSVGElement>): NormalizedPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return createNormalizedPoint(
      clampUnit((event.clientX - rect.left) / rect.width),
      clampUnit((event.clientY - rect.top) / rect.height),
    );
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const handle = activeHandleRef.current;
    if (handle === null) return;
    event.preventDefault();
    updateHandle(handle, pointFromPointer(event));
  }

  function handleKeyDown(handle: Handle, event: KeyboardEvent<SVGCircleElement>) {
    const point = handle === 'end' ? end : controls[handle];
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    updateHandle(handle, createNormalizedPoint(
      clampUnit(point.x + delta[0]),
      clampUnit(point.y + delta[1]),
    ));
  }

  const renderHandle = (handle: Handle, point: NormalizedPoint, label: string) => (
    <circle
      className="tactical-path-handle"
      cx={percent(point.x)}
      cy={percent(point.y)}
      r="7.5"
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        activeHandleRef.current = handle;
        setActiveHandle(handle);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        activeHandleRef.current = null;
        setActiveHandle(null);
      }}
      onKeyDown={(event) => handleKeyDown(handle, event)}
    >
      <title>{label}. Drag, or use arrow keys; hold Shift for larger keyboard steps.</title>
    </circle>
  );

  return (
    <fieldset className="tactical-path-editor">
      <legend>Trajectory path</legend>
      <p>Drag the end node and curve handles, or use the numeric fields and keyboard arrows.</p>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-label="Interactive trajectory path editor"
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          activeHandleRef.current = null;
          setActiveHandle(null);
        }}
      >
        <rect x="0" y="0" width="100" height="100" rx="4" className="tactical-path-editor-surface" />
        {kind !== 'linear' ? (
          <>
            <line x1={percent(start.x)} y1={percent(start.y)} x2={percent(controls[0].x)} y2={percent(controls[0].y)} className="tactical-path-tangent" />
            <line
              x1={percent(kind === 'cubic-bezier' ? controls[1].x : controls[0].x)}
              y1={percent(kind === 'cubic-bezier' ? controls[1].y : controls[0].y)}
              x2={percent(end.x)}
              y2={percent(end.y)}
              className="tactical-path-tangent"
            />
          </>
        ) : null}
        <path d={pathData(kind, start, end, controls)} className="tactical-path-preview" />
        <circle cx={percent(start.x)} cy={percent(start.y)} r="4" className="tactical-path-anchor">
          <title>Start trajectory node</title>
        </circle>
        {renderHandle('end', end, 'End trajectory node')}
        {kind !== 'linear' ? renderHandle(0, controls[0], 'Control point 1') : null}
        {kind === 'cubic-bezier' ? renderHandle(1, controls[1], 'Control point 2') : null}
      </svg>

      <div className="tactical-path-values">
        <label>Motion end X %<input name="motionEndX" type="number" min="0" max="100" step="0.1" value={percent(end.x)} onChange={(event) => onEndChange(createNormalizedPoint(Number(event.target.value) / 100, end.y))} required /></label>
        <label>Motion end Y %<input name="motionEndY" type="number" min="0" max="100" step="0.1" value={percent(end.y)} onChange={(event) => onEndChange(createNormalizedPoint(end.x, Number(event.target.value) / 100))} required /></label>
        {kind !== 'linear' ? (
          <>
            <label>Control 1 X %<input name="control1X" type="number" min="0" max="100" step="0.1" value={percent(controls[0].x)} onChange={(event) => onControlsChange([createNormalizedPoint(Number(event.target.value) / 100, controls[0].y), controls[1]])} required /></label>
            <label>Control 1 Y %<input name="control1Y" type="number" min="0" max="100" step="0.1" value={percent(controls[0].y)} onChange={(event) => onControlsChange([createNormalizedPoint(controls[0].x, Number(event.target.value) / 100), controls[1]])} required /></label>
          </>
        ) : null}
        {kind === 'cubic-bezier' ? (
          <>
            <label>Control 2 X %<input name="control2X" type="number" min="0" max="100" step="0.1" value={percent(controls[1].x)} onChange={(event) => onControlsChange([controls[0], createNormalizedPoint(Number(event.target.value) / 100, controls[1].y)])} required /></label>
            <label>Control 2 Y %<input name="control2Y" type="number" min="0" max="100" step="0.1" value={percent(controls[1].y)} onChange={(event) => onControlsChange([controls[0], createNormalizedPoint(controls[1].x, Number(event.target.value) / 100)])} required /></label>
          </>
        ) : null}
      </div>
    </fieldset>
  );
}
