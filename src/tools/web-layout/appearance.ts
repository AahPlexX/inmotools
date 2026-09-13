export type Palette = {
  accent: string;
  ink: string;
  canvas: string;
  surface: string;
};
export type Gradient = {
  type: "linear" | "radial" | "conic";
  angle: number;
  stops: { color: string; position: number }[];
};
export type Shadow = {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
};
export type MotionStep = {
  at: number;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
};
export type Appearance = {
  palettes: Record<"light" | "dark" | "contrast", Palette>;
  gradients: Gradient[];
  shadows: Shadow[];
  textShadows: Shadow[];
  blur: number;
  saturation: number;
  brightness: number;
  animated: boolean;
  duration: number;
  delay: number;
  iterations: number;
  easing: [number, number, number, number];
  steps: MotionStep[];
};
const emptyPalette = (): Palette => ({
  accent: "",
  ink: "",
  canvas: "",
  surface: "",
});
export const DEFAULT_APPEARANCE: Appearance = {
  palettes: {
    light: emptyPalette(),
    dark: emptyPalette(),
    contrast: emptyPalette(),
  },
  gradients: [],
  shadows: [],
  textShadows: [],
  blur: 0,
  saturation: 100,
  brightness: 100,
  animated: false,
  duration: 800,
  delay: 0,
  iterations: 1,
  easing: [0.25, 0.1, 0.25, 1],
  steps: [
    { at: 0, opacity: 0, x: 0, y: 8, scale: 1, rotate: 0 },
    { at: 100, opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 },
  ],
};
function num(v: unknown, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new Error(`Use a number from ${min} to ${max}.`);
  return v;
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid appearance object.");
  return v as Record<string, unknown>;
}
function list(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max)
    throw new Error(`Use at most ${max} entries.`);
  return v;
}
function bool(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("Invalid toggle.");
  return v;
}
export function colorExpression(v: unknown, empty = false): string {
  if (
    typeof v !== "string" ||
    v.length > 500 ||
    (!empty && !v.trim()) ||
    /[;{}<>@\\"']/.test(v) ||
    /url\s*\(|expression\s*\(/i.test(v)
  )
    throw new Error("Use a CSS color expression without URLs or declarations.");
  return v.trim();
}
export function parseAppearance(v: unknown): Appearance {
  const p = object(v),
    palettes = object(p.palettes);
  const palette = (theme: string) =>
    Object.fromEntries(
      Object.entries(object(palettes[theme]))
        .filter(([key]) => ["accent", "ink", "surface", "canvas"].includes(key))
        .map(([key, value]) => [key, colorExpression(value, true)]),
    ) as Palette;
  const resultPalettes = {
    light: palette("light"),
    dark: palette("dark"),
    contrast: palette("contrast"),
  };
  for (const palette of Object.values(resultPalettes))
    for (const key of ["accent", "ink", "surface", "canvas"])
      if (!(key in palette))
        throw new Error("Palette is missing a color field.");
  const shadows = (v: unknown) =>
    list(v, 8).map((entry) => {
      const s = object(entry);
      return {
        x: num(s.x, -200, 200),
        y: num(s.y, -200, 200),
        blur: num(s.blur, 0, 200),
        spread: num(s.spread, -100, 100),
        color: colorExpression(s.color),
        inset: bool(s.inset),
      };
    });
  const gradients = list(p.gradients, 6).map((entry) => {
    const g = object(entry);
    if (!["linear", "radial", "conic"].includes(g.type as string))
      throw new Error("Unknown gradient type.");
    const stops = list(g.stops, 12).map((entry) => {
      const s = object(entry);
      return {
        color: colorExpression(s.color),
        position: num(s.position, 0, 100),
      };
    });
    if (stops.length < 2)
      throw new Error("A gradient needs at least two stops.");
    return {
      type: g.type as Gradient["type"],
      angle: num(g.angle, 0, 360),
      stops: stops.sort((a, b) => a.position - b.position),
    };
  });
  const steps = list(p.steps, 20)
    .map((entry) => {
      const s = object(entry);
      return {
        at: num(s.at, 0, 100),
        opacity: num(s.opacity, 0, 1),
        x: num(s.x, -200, 200),
        y: num(s.y, -200, 200),
        scale: num(s.scale, 0.1, 3),
        rotate: num(s.rotate, -360, 360),
      };
    })
    .sort((a, b) => a.at - b.at);
  if (
    steps.length < 2 ||
    steps[0].at !== 0 ||
    steps.at(-1)?.at !== 100 ||
    new Set(steps.map((s) => s.at)).size !== steps.length
  )
    throw new Error("Use unique motion stops including 0% and 100%.");
  const easing = list(p.easing, 4);
  if (easing.length !== 4) throw new Error("A timing curve needs four values.");
  return {
    palettes: resultPalettes,
    gradients,
    shadows: shadows(p.shadows),
    textShadows: shadows(p.textShadows),
    blur: num(p.blur, 0, 40),
    saturation: num(p.saturation, 0, 300),
    brightness: num(p.brightness, 0, 300),
    animated: bool(p.animated),
    duration: num(p.duration, 100, 30000),
    delay: num(p.delay, 0, 30000),
    iterations: num(p.iterations, 1, 20),
    easing: [
      num(easing[0], 0, 1),
      num(easing[1], -2, 2),
      num(easing[2], 0, 1),
      num(easing[3], -2, 2),
    ],
    steps,
  };
}
export function appearanceCss(
  a: Appearance | undefined,
  theme: "light" | "dark" | "contrast",
): string {
  if (!a) return "";
  const palette = Object.entries(a.palettes[theme])
    .filter(([, v]) => v)
    .map(
      ([key, value]) => `@supports(color:${value}){:root{--${key}:${value}}}`,
    )
    .join("\n");
  const gradient = a.gradients
    .map(
      (g) =>
        `${g.type}-gradient(${g.type === "linear" ? `${g.angle}deg,` : g.type === "conic" ? `from ${g.angle}deg,` : ""}${g.stops.map((s) => `${s.color} ${s.position}%`).join(",")})`,
    )
    .join(",");
  const box =
    a.shadows
      .map(
        (s) =>
          `${s.inset ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`,
      )
      .join(",") || "none";
  const text =
    a.textShadows
      .map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.color}`)
      .join(",") || "none";
  return `${palette}\n${gradient ? `body{background-image:${gradient}}` : ""}\n.block{box-shadow:${box};text-shadow:${text};backdrop-filter:blur(${a.blur}px) saturate(${a.saturation}%) brightness(${a.brightness}%)}\n${a.animated ? `@keyframes wl-enter{${a.steps.map((s) => `${s.at}%{opacity:${s.opacity};transform:translate(${s.x}px,${s.y}px) scale(${s.scale}) rotate(${s.rotate}deg)}`).join("")}}.layout>.block{animation:wl-enter ${a.duration}ms cubic-bezier(${a.easing.join(",")}) ${a.delay}ms ${a.iterations} both}` : ""}\n@media print{:root{--surface:#fff;--ink:#000;--canvas:#fff;color-scheme:light}body{background-image:none}.block{box-shadow:none;text-shadow:none;backdrop-filter:none;animation:none!important;transform:none!important;opacity:1!important}}`;
}
