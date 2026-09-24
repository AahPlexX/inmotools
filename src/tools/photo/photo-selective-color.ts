/** Selective color: print-style cyan/magenta/yellow/black adjustments applied to one color family
 * at a time. Unlike the HSL ranges (which rotate hue and scale saturation/lightness), this moves
 * the "ink" behind each RGB channel — cyan ↔ red, magenta ↔ green, yellow ↔ blue, black ↔ all —
 * so, for example, adding cyan to the reds only deepens red areas without shifting their hue.
 *
 * Family membership is computed from the pixel's sorted channels (max ≥ mid ≥ min, 0–1):
 * - primaries (reds/greens/blues): max − mid, when that channel is the largest;
 * - secondaries (yellows/cyans/magentas): mid − min, when the complementary channel is the smallest;
 * - whites: how far the smallest channel sits above 50 %; blacks: how far the largest sits below;
 * - neutrals: 1 − (|max − 0.5| + |min − 0.5|), strongest for mid-grey.
 * Each family's CMYK change is scaled by that weight and summed. In `relative` mode a change scales
 * the ink already present (100 % cyan doubles existing cyan); in `absolute` mode it adds ink
 * directly. This is a deterministic, documented model, not a copy of any other product's math. */

export type SelectiveColorFamily = 'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas' | 'whites' | 'neutrals' | 'blacks';

export const SELECTIVE_COLOR_FAMILIES: Array<{ id: SelectiveColorFamily; label: string }> = [
  { id: 'reds', label: 'Reds' },
  { id: 'yellows', label: 'Yellows' },
  { id: 'greens', label: 'Greens' },
  { id: 'cyans', label: 'Cyans' },
  { id: 'blues', label: 'Blues' },
  { id: 'magentas', label: 'Magentas' },
  { id: 'whites', label: 'Whites' },
  { id: 'neutrals', label: 'Neutrals' },
  { id: 'blacks', label: 'Blacks' },
];

export interface SelectiveColorInks { cyan: number; magenta: number; yellow: number; black: number }

export interface PhotoSelectiveColor {
  mode: 'relative' | 'absolute';
  ranges: Record<SelectiveColorFamily, SelectiveColorInks>;
}

const ZERO: SelectiveColorInks = { cyan: 0, magenta: 0, yellow: 0, black: 0 };

function clampInk(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;
}

export function neutralSelectiveColor(): PhotoSelectiveColor {
  return { mode: 'relative', ranges: Object.fromEntries(SELECTIVE_COLOR_FAMILIES.map(({ id }) => [id, { ...ZERO }])) as PhotoSelectiveColor['ranges'] };
}

export function isNeutralSelectiveColor(value: PhotoSelectiveColor | null | undefined): boolean {
  return !value || SELECTIVE_COLOR_FAMILIES.every(({ id }) => {
    const inks = value.ranges[id];
    return inks.cyan === 0 && inks.magenta === 0 && inks.yellow === 0 && inks.black === 0;
  });
}

/** Rebuilds untrusted input; an all-zero result normalizes to null so neutral recipes stay minimal. */
export function normalizeSelectiveColor(value: unknown): PhotoSelectiveColor | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const ranges = (input.ranges && typeof input.ranges === 'object' ? input.ranges : {}) as Record<string, Record<string, unknown> | undefined>;
  const result: PhotoSelectiveColor = {
    mode: input.mode === 'absolute' ? 'absolute' : 'relative',
    ranges: Object.fromEntries(SELECTIVE_COLOR_FAMILIES.map(({ id }) => {
      const inks = ranges[id] ?? {};
      return [id, { cyan: clampInk(inks.cyan), magenta: clampInk(inks.magenta), yellow: clampInk(inks.yellow), black: clampInk(inks.black) }];
    })) as PhotoSelectiveColor['ranges'],
  };
  return isNeutralSelectiveColor(result) ? null : result;
}

export function selectiveColorWeights(r: number, g: number, b: number): Record<SelectiveColorFamily, number> {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const mid = r + g + b - max - min;
  const primary = max - mid;
  const secondary = mid - min;
  return {
    reds: r === max && r > mid ? primary : 0,
    greens: g === max && g > mid && r !== max ? primary : 0,
    blues: b === max && b > mid && r !== max && g !== max ? primary : 0,
    yellows: b === min && b < mid && g !== min && r !== min ? secondary : 0,
    cyans: r === min && r < mid ? secondary : 0,
    magentas: g === min && g < mid && r !== min ? secondary : 0,
    whites: Math.max(0, (min - 0.5) * 2),
    blacks: Math.max(0, (0.5 - max) * 2),
    neutrals: Math.max(0, 1 - (Math.abs(max - 0.5) + Math.abs(min - 0.5))),
  };
}

/** Applies selective color to one display-referred RGB triple (0–1). */
export function applySelectiveColor(rgb: [number, number, number], settings: PhotoSelectiveColor): [number, number, number] {
  const [r, g, b] = rgb;
  const weights = selectiveColorWeights(r, g, b);
  const ink = [1 - r, 1 - g, 1 - b];
  const change = [0, 0, 0];
  for (const { id } of SELECTIVE_COLOR_FAMILIES) {
    const weight = weights[id];
    if (weight <= 0) continue;
    const inks = settings.ranges[id];
    const perChannel = [inks.cyan + inks.black, inks.magenta + inks.black, inks.yellow + inks.black];
    for (let channel = 0; channel < 3; channel += 1) {
      const amount = perChannel[channel];
      if (amount === 0) continue;
      change[channel] += weight * (settings.mode === 'relative' ? ink[channel] * amount : amount);
    }
  }
  return [
    Math.min(1, Math.max(0, r - change[0])),
    Math.min(1, Math.max(0, g - change[1])),
    Math.min(1, Math.max(0, b - change[2])),
  ];
}
