import { useEffect, useState } from "react";
import { NumberInput } from "./NumberInput";
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  type Appearance,
  type Shadow,
} from "./appearance";

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const supported = !value || CSS.supports("color", value);
  return (
    <label className="wl-field">
      {label}
      <input
        aria-label={label}
        value={value}
        maxLength={500}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Inherit theme color"
      />
      <span className="help-text">
        {supported
          ? ""
          : "This browser does not recognize this color; the base theme is the fallback."}
      </span>
    </label>
  );
}
export function AppearancePanel({
  value,
  theme,
  onChange,
}: {
  value: Appearance | undefined;
  theme: "light" | "dark" | "contrast";
  onChange: (value: Appearance) => boolean;
}) {
  const committed = JSON.stringify(value ?? DEFAULT_APPEARANCE);
  const [draft, setDraft] = useState<Appearance>(() => JSON.parse(committed));
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(JSON.parse(committed));
    setMessage("");
  }, [committed]);
  const patch = (change: Partial<Appearance>) =>
    setDraft((current) => ({ ...current, ...change }));
  const number = (
    label: string,
    key:
      | "blur"
      | "saturation"
      | "brightness"
      | "duration"
      | "delay"
      | "iterations",
    min: number,
    max: number,
  ) => (
    <NumberInput
      label={label}
      value={draft[key]}
      min={min}
      max={max}
      onChange={(v) => patch({ [key]: v })}
    />
  );
  function shadows(key: "shadows" | "textShadows", title: string) {
    const update = (index: number, change: Partial<Shadow>) =>
      patch({
        [key]: draft[key].map((s, i) =>
          i === index ? { ...s, ...change } : s,
        ),
      });
    return (
      <details className="wl-advanced">
        <summary>{title}</summary>
        <p>Layers are drawn front to back. Values use pixels.</p>
        {draft[key].map((s, index) => (
          <fieldset key={index}>
            <legend>
              {title} layer {index + 1}
            </legend>
            <div className="wl-fields">
              {(
                [
                  "x",
                  "y",
                  "blur",
                  ...(key === "shadows" ? ["spread"] : []),
                ] as const
              ).map((field) => (
                <NumberInput
                  key={field}
                  label={`${title} ${index + 1} ${field}`}
                  value={s[field as "x" | "y" | "blur" | "spread"]}
                  min={field === "blur" ? 0 : field === "spread" ? -100 : -200}
                  max={field === "spread" ? 100 : 200}
                  onChange={(v) => update(index, { [field]: v })}
                />
              ))}
            </div>
            <ColorInput
              label={`${title} ${index + 1} color`}
              value={s.color}
              onChange={(color) => update(index, { color })}
            />
            {key === "shadows" && (
              <label className="wl-check">
                <input
                  type="checkbox"
                  checked={s.inset}
                  onChange={(e) => update(index, { inset: e.target.checked })}
                />
                Inset shadow
              </label>
            )}
            <button
              type="button"
              onClick={() =>
                patch({ [key]: draft[key].filter((_, i) => i !== index) })
              }
            >
              Remove {title.toLowerCase()} layer {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={draft[key].length >= 8}
          onClick={() =>
            patch({
              [key]: [
                ...draft[key],
                {
                  x: 0,
                  y: 8,
                  blur: 24,
                  spread: 0,
                  color: "rgb(0 0 0 / 0.16)",
                  inset: false,
                },
              ],
            })
          }
        >
          Add {title.toLowerCase()} layer
        </button>
      </details>
    );
  }
  return (
    <form
      className="wl-appearance"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const valid = parseAppearance(draft);
          if (!onChange(valid))
            throw new Error(
              "Appearance could not be applied. Check the project status above.",
            );
          setMessage(
            "Appearance applied. Undo restores the previous settings.",
          );
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Check appearance settings.",
          );
        }
      }}
    >
      <h3>Color, depth and motion</h3>
      <p>
        Adjust a draft, then apply it to every preview and download. Changes
        remain editable when you switch panels.
      </p>
      <details className="wl-advanced">
        <summary>Theme color expressions</summary>
        <p>
          Editing the {theme} palette. Use hex, rgb(), oklch(), color(display-p3
          …), color-mix() or relative colors. Empty fields inherit the base
          theme. Check contrast after changing foregrounds or surfaces.
        </p>
        {(["accent", "ink", "canvas", "surface"] as const).map((key) => (
          <ColorInput
            key={key}
            label={`${theme} ${key} expression`}
            value={draft.palettes[theme][key]}
            onChange={(color) =>
              patch({
                palettes: {
                  ...draft.palettes,
                  [theme]: { ...draft.palettes[theme], [key]: color },
                },
              })
            }
          />
        ))}
      </details>
      <details className="wl-advanced">
        <summary>Layered gradients</summary>
        <p>
          First layer appears on top. Color stops run from 0% to 100% and are
          sorted when applied.
        </p>
        {draft.gradients.map((g, index) => (
          <fieldset key={index}>
            <legend>Gradient {index + 1}</legend>
            <label className="wl-field">
              Gradient shape
              <select
                aria-label={`Gradient ${index + 1} shape`}
                value={g.type}
                onChange={(e) =>
                  patch({
                    gradients: draft.gradients.map((x, i) =>
                      i === index
                        ? { ...x, type: e.target.value as typeof g.type }
                        : x,
                    ),
                  })
                }
              >
                {["linear", "radial", "conic"].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <NumberInput
              label={`Gradient ${index + 1} angle`}
              value={g.angle}
              min={0}
              max={360}
              onChange={(angle) =>
                patch({
                  gradients: draft.gradients.map((x, i) =>
                    i === index ? { ...x, angle } : x,
                  ),
                })
              }
            />
            {g.stops.map((stop, j) => (
              <div key={j}>
                <ColorInput
                  label={`Gradient ${index + 1} stop ${j + 1} color`}
                  value={stop.color}
                  onChange={(color) =>
                    patch({
                      gradients: draft.gradients.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              stops: x.stops.map((s, k) =>
                                k === j ? { ...s, color } : s,
                              ),
                            }
                          : x,
                      ),
                    })
                  }
                />
                <NumberInput
                  label={`Gradient ${index + 1} stop ${j + 1} position (%)`}
                  value={stop.position}
                  min={0}
                  max={100}
                  onChange={(position) =>
                    patch({
                      gradients: draft.gradients.map((x, i) =>
                        i === index
                          ? {
                              ...x,
                              stops: x.stops.map((s, k) =>
                                k === j ? { ...s, position } : s,
                              ),
                            }
                          : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  disabled={g.stops.length <= 2}
                  onClick={() =>
                    patch({
                      gradients: draft.gradients.map((x, i) =>
                        i === index
                          ? { ...x, stops: x.stops.filter((_, k) => k !== j) }
                          : x,
                      ),
                    })
                  }
                >
                  Remove stop {j + 1}
                </button>
              </div>
            ))}
            <div className="button-row">
              <button
                type="button"
                disabled={g.stops.length >= 12}
                onClick={() =>
                  patch({
                    gradients: draft.gradients.map((x, i) =>
                      i === index
                        ? {
                            ...x,
                            stops: [
                              ...x.stops,
                              { color: "#ffffff", position: 50 },
                            ],
                          }
                        : x,
                    ),
                  })
                }
              >
                Add color stop
              </button>
              <button
                type="button"
                onClick={() =>
                  patch({
                    gradients: draft.gradients.filter((_, i) => i !== index),
                  })
                }
              >
                Remove gradient {index + 1}
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={draft.gradients.length >= 6}
          onClick={() =>
            patch({
              gradients: [
                ...draft.gradients,
                {
                  type: "linear",
                  angle: 135,
                  stops: [
                    { color: "#eef2ff", position: 0 },
                    { color: "#f0fdfa", position: 100 },
                  ],
                },
              ],
            })
          }
        >
          Add gradient layer
        </button>
      </details>
      {shadows("shadows", "Box shadow")}
      {shadows("textShadows", "Text shadow")}
      <details className="wl-advanced">
        <summary>Backdrop filters</summary>
        <p>
          A translucent surface color reveals the effect behind blocks.
          Unsupported browsers retain the surface color. Use an opaque surface
          for a predictable fallback.
        </p>
        {number("Backdrop blur (px)", "blur", 0, 40)}
        {number("Backdrop saturation (%)", "saturation", 0, 300)}
        {number("Backdrop brightness (%)", "brightness", 0, 300)}
      </details>
      <details className="wl-advanced">
        <summary>Motion timeline</summary>
        <label className="wl-check">
          <input
            type="checkbox"
            checked={draft.animated}
            onChange={(e) => patch({ animated: e.target.checked })}
          />
          Animate top-level blocks
        </label>
        <p>
          Animations run when a preview refreshes. Reduced-motion preferences
          disable them. Print output removes motion and restores visible
          content.
        </p>
        <div className="wl-fields">
          {number("Duration (ms)", "duration", 100, 30000)}
          {number("Delay (ms)", "delay", 0, 30000)}
          {number("Iterations", "iterations", 1, 20)}
        </div>
        <svg
          className="wl-curve"
          viewBox="-10 -110 120 320"
          role="img"
          aria-label="Cubic Bézier timing curve: horizontal time and vertical progress"
        >
          <path
            d="M0 100H100V0"
            fill="none"
            stroke="currentColor"
            opacity=".3"
          />
          <path
            d={`M0 100 C${draft.easing[0] * 100} ${100 - draft.easing[1] * 100},${draft.easing[2] * 100} ${100 - draft.easing[3] * 100},100 0`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        <div className="wl-fields">
          {draft.easing.map((v, i) => (
            <NumberInput
              key={i}
              label={`Timing ${["x1", "y1", "x2", "y2"][i]}`}
              value={v}
              min={i % 2 ? -2 : 0}
              max={i % 2 ? 2 : 1}
              onChange={(value) =>
                patch({
                  easing: draft.easing.map((x, j) =>
                    i === j ? value : x,
                  ) as Appearance["easing"],
                })
              }
            />
          ))}
        </div>
        {draft.steps.map((step, index) => (
          <fieldset key={index}>
            <legend>Motion stop {index + 1}</legend>
            <div className="wl-fields">
              {(["at", "opacity", "x", "y", "scale", "rotate"] as const).map(
                (key) => (
                  <NumberInput
                    key={key}
                    label={`Stop ${index + 1} ${key === "at" ? "time (%)" : key === "rotate" ? "rotation (degrees)" : key === "x" || key === "y" ? `${key} offset (px)` : key}`}
                    value={step[key]}
                    min={
                      key === "scale"
                        ? 0.1
                        : key === "x" || key === "y"
                          ? -200
                          : key === "rotate"
                            ? -360
                            : 0
                    }
                    max={
                      key === "at"
                        ? 100
                        : key === "opacity"
                          ? 1
                          : key === "scale"
                            ? 3
                            : key === "rotate"
                              ? 360
                              : 200
                    }
                    onChange={(v) =>
                      patch({
                        steps: draft.steps.map((s, i) =>
                          i === index ? { ...s, [key]: v } : s,
                        ),
                      })
                    }
                  />
                ),
              )}
            </div>
            <button
              type="button"
              disabled={draft.steps.length <= 2}
              onClick={() =>
                patch({ steps: draft.steps.filter((_, i) => i !== index) })
              }
            >
              Remove motion stop {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={draft.steps.length >= 20}
          onClick={() => {
            const at = Array.from({ length: 99 }, (_, i) => i + 1)
              .sort((a, b) => Math.abs(a - 50) - Math.abs(b - 50))
              .find((at) => !draft.steps.some((s) => s.at === at))!;
            patch({
              steps: [
                ...draft.steps,
                { at, opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 },
              ].sort((a, b) => a.at - b.at),
            });
          }}
        >
          Add motion stop
        </button>
      </details>
      <div className="button-row">
        <button type="submit">Apply appearance</button>
        <button
          type="button"
          onClick={() => {
            setDraft(JSON.parse(committed));
            setMessage("Appearance draft restored.");
          }}
        >
          Discard appearance draft
        </button>
      </div>
      <p role="status">{message}</p>
    </form>
  );
}
