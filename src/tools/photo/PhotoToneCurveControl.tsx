import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  addTonePoint,
  addTonePointInLargestGap,
  canonicalToneCurve,
  removeTonePoint,
  resetToneCurve,
  updateTonePoint,
} from './photo-tone-curve';
import type { TonePoint } from './photo-types';
import './photo-tone-curve.css';

interface PhotoToneCurveControlProps {
  points: TonePoint[];
  onChange: (points: TonePoint[]) => void;
}

function curvePath(points: readonly TonePoint[]): string {
  return canonicalToneCurve(points)
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x * 100).toFixed(2)} ${(100 - point.y * 100).toFixed(2)}`)
    .join(' ');
}

function percent(value: number): number {
  return Math.round(value * 1000) / 10;
}

function normalizedPercent(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed / 100)) : fallback;
}

export default function PhotoToneCurveControl({ points, onChange }: PhotoToneCurveControlProps) {
  const curve = canonicalToneCurve(points);

  function addFromPointer(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;
    onChange(addTonePoint(curve, x, y));
  }

  return (
    <div className="photo-tone-curve" data-testid="photo-tone-curve">
      <div className="photo-tone-curve-header">
        <div>
          <strong>Tone curve</strong>
          <span>Input → output luminance</span>
        </div>
        <div className="photo-inline-actions">
          <button type="button" onClick={() => onChange(addTonePointInLargestGap(curve))}>Add point</button>
          <button type="button" onClick={() => onChange(resetToneCurve())}>Reset curve</button>
        </div>
      </div>

      <svg
        className="photo-tone-curve-graph"
        viewBox="0 0 100 100"
        role="img"
        aria-label="Tone curve graph. Click the graph to add a point."
        onPointerDown={addFromPointer}
      >
        {[25, 50, 75].map((position) => (
          <g key={position} className="photo-tone-curve-grid">
            <line x1={position} y1="0" x2={position} y2="100" />
            <line x1="0" y1={position} x2="100" y2={position} />
          </g>
        ))}
        <line className="photo-tone-curve-reference" x1="0" y1="100" x2="100" y2="0" />
        <path className="photo-tone-curve-path" d={curvePath(curve)} />
        {curve.map((point, index) => (
          <circle
            key={`${index}-${point.x}-${point.y}`}
            className="photo-tone-curve-point"
            cx={point.x * 100}
            cy={100 - point.y * 100}
            r={index === 0 || index === curve.length - 1 ? 2.2 : 2.8}
          />
        ))}
      </svg>

      <div className="photo-tone-point-list" aria-label="Tone curve points">
        {curve.map((point, index) => {
          const endpoint = index === 0 || index === curve.length - 1;
          return (
            <div className="photo-tone-point-row" key={`point-${index}`}>
              <span>Point {index + 1}</span>
              <label>
                Input %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={percent(point.x)}
                  disabled={endpoint}
                  aria-label={`Tone point ${index + 1} input percent`}
                  onChange={(event) => onChange(updateTonePoint(curve, index, { x: normalizedPercent(event.target.value, point.x) }))}
                />
              </label>
              <label>
                Output %
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={percent(point.y)}
                  aria-label={`Tone point ${index + 1} output percent`}
                  onChange={(event) => onChange(updateTonePoint(curve, index, { y: normalizedPercent(event.target.value, point.y) }))}
                />
              </label>
              <button type="button" disabled={endpoint} onClick={() => onChange(removeTonePoint(curve, index))} aria-label={`Remove tone point ${index + 1}`}>Remove</button>
            </div>
          );
        })}
      </div>
      <p className="photo-export-note">Click the graph to add a point, or use the numeric controls for precise keyboard editing. Endpoints stay anchored at 0% and 100% input.</p>
    </div>
  );
}
