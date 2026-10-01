/**
 * Paired slider + number control for master-chain parameters.
 *
 * Dragging the slider or typing previews the value live (`onPreview`, sent to
 * the realtime worklet) without touching history; releasing the slider,
 * leaving the field, or pressing Enter commits once (`onCommit`, one undo
 * step). Escape in the number field restores the committed value.
 */
import { useEffect, useId, useState, type KeyboardEvent } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  /** Formats the value for the slider's accessible value text. */
  describe?: (value: number) => string;
  /** Maps slider position to value, e.g. logarithmic frequency. Defaults to linear. */
  scale?: { toSlider: (value: number) => number; fromSlider: (position: number) => number; sliderMin: number; sliderMax: number; sliderStep: number };
  onPreview?: (value: number) => void;
  onCommit: (value: number) => void;
}

export const logScale = (min: number, max: number) => ({
  toSlider: (value: number) => Math.log(Math.max(min, value) / min) / Math.log(max / min),
  fromSlider: (position: number) => min * (max / min) ** position,
  sliderMin: 0,
  sliderMax: 1,
  sliderStep: 0.001,
});

const round = (value: number, step: number) => {
  const digits = Math.max(0, Math.min(4, Math.ceil(-Math.log10(step))));
  return Number(value.toFixed(digits));
};

export function formatFrequency(hz: number) {
  return hz >= 1000 ? `${Number((hz / 1000).toFixed(hz >= 10_000 ? 1 : 2))} kHz` : `${Math.round(hz)} Hz`;
}

export default function ParameterControl({ label, value, min, max, step, unit, disabled, describe, scale, onPreview, onCommit }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<number | null>(null);
  const [text, setText] = useState(String(round(value, step)));
  useEffect(() => { if (draft === null) setText(String(round(value, step))); }, [value, step, draft]);
  const shown = draft ?? value;
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  const preview = (next: number) => { const bounded = clamp(round(next, step)); setDraft(bounded); setText(String(bounded)); onPreview?.(bounded); };
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  const commitText = () => {
    const parsed = Number(text);
    if (text.trim() === '' || !Number.isFinite(parsed)) { setText(String(round(value, step))); setDraft(null); return; }
    const bounded = clamp(round(parsed, step));
    if (bounded !== value) onCommit(bounded);
    setDraft(null);
    setText(String(bounded));
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); commitText(); }
    else if (event.key === 'Escape') { event.preventDefault(); setDraft(null); setText(String(round(value, step))); onPreview?.(value); }
  };

  return <div className="mastering-param">
    <label htmlFor={`${id}-number`} className="mastering-param-label">{label}{unit ? <span className="mastering-unit"> ({unit})</span> : null}</label>
    <input
      type="range"
      aria-label={label}
      aria-valuetext={describe ? describe(shown) : `${shown}${unit ? ` ${unit}` : ''}`}
      min={scale?.sliderMin ?? min}
      max={scale?.sliderMax ?? max}
      step={scale?.sliderStep ?? step}
      value={scale ? scale.toSlider(shown) : shown}
      disabled={disabled}
      onChange={(event) => preview(scale ? scale.fromSlider(Number(event.target.value)) : Number(event.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
    <input id={`${id}-number`} className="mastering-param-number" type="number" inputMode={min < 0 ? 'text' : 'decimal'} min={min} max={max} step={step} value={text} disabled={disabled}
      onChange={(event) => { setText(event.target.value); const parsed = Number(event.target.value); if (event.target.value.trim() !== '' && Number.isFinite(parsed)) onPreview?.(clamp(parsed)); }}
      onBlur={commitText} onKeyDown={onKey} />
  </div>;
}
