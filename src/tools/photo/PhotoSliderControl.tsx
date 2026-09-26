import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Parses a numeric field, keeping the previous value while the field is empty or mid-edit. */
export function readNumber(value: string, fallback: number): number {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Enter commits a numeric field the same way leaving it does. */
export function inputCommit(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.currentTarget.blur();
}

export interface PhotoSliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Value the Reset button returns to; Reset is disabled while the control is already there. */
  neutral?: number;
  onChange: (value: number) => void;
  /** Hide the Reset button (for controls that have no meaningful neutral value). */
  resettable?: boolean;
  /** Custom reset action; defaults to `onChange(neutral)`. */
  onReset?: () => void;
}

/** Paired range + number input used for every numeric Photo Studio setting, so keyboard users can
 * type exact values and pointer users can drag. */
export default function PhotoSliderControl({ label, value, min, max, step, neutral = 0, onChange, resettable = true, onReset }: PhotoSliderControlProps) {
  return (
    <label className="photo-control">
      <span className="photo-inline-actions">
        <span>{label}</span>
        {resettable ? (
          <button
            type="button"
            aria-label={`Reset ${label}`}
            disabled={Math.abs(value - neutral) < 1e-9}
            onClick={(event) => {
              event.preventDefault();
              if (onReset) onReset(); else onChange(neutral);
            }}
          >Reset</button>
        ) : null}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label} slider`}
        onChange={(event) => onChange(readNumber(event.target.value, value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label} value`}
        onChange={(event) => onChange(readNumber(event.target.value, value))}
        onKeyDown={inputCommit}
      />
    </label>
  );
}
