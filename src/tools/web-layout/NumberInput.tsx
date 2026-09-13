import { useEffect, useState } from "react";
export function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="wl-field">
      {label}
      <input
        aria-label={label}
        type="number"
        required
        step="any"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim() && e.target.validity.valid)
            onChange(Number(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}
