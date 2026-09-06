export interface ClampInput { minValue: number; maxValue: number; minViewport: number; maxViewport: number; unit: string }
export interface ScaleInput { minBase: number; maxBase: number; ratio: number; steps: number[] }

const trim = (value: number) => Number(value.toFixed(4)).toString();

export function buildClamp(input: ClampInput) {
  if (!(input.maxViewport > input.minViewport)) throw new Error('Maximum viewport must exceed minimum viewport.');
  if (input.maxValue < input.minValue) throw new Error('Maximum value must be at least the minimum value.');
  const slope = (input.maxValue - input.minValue) / (input.maxViewport - input.minViewport);
  const intercept = input.minValue - slope * input.minViewport;
  const vw = slope * 100;
  return {
    css: `clamp(${trim(input.minValue)}${input.unit}, calc(${trim(intercept)}${input.unit} + ${trim(vw)}vw), ${trim(input.maxValue)}${input.unit})`,
    slope,
    intercept,
  };
}

// Each step gets its own interpolation, computed from that step's own bounds.
//
// Reusing the base step's preferred expression - which is what happens if the
// caller only substitutes min and max - produces a rule that is wrong for every
// step except the base. The preferred term encodes a specific line through
// (minViewport, minValue) and (maxViewport, maxValue); pairing it with different
// bounds means a step pins to its minimum until the base line happens to cross
// it, then stops short of its declared maximum. With min 1rem, max 2rem,
// 320-1440px and ratio 1.25, step-1 stayed flat at 1.25rem until roughly 1041px
// and reached only 2rem instead of 2.5rem.
export function buildScaleMatrix(input: ScaleInput & Partial<Omit<ClampInput, 'minValue' | 'maxValue'>>) {
  if (input.ratio <= 0) throw new Error('Ratio must be positive.');
  const minViewport = input.minViewport ?? 320;
  const maxViewport = input.maxViewport ?? 1440;
  const unit = input.unit ?? 'rem';

  return input.steps.map((step) => {
    const minValue = input.minBase * Math.pow(input.ratio, step);
    const maxValue = input.maxBase * Math.pow(input.ratio, step);
    const clamp = buildClamp({ minValue, maxValue, minViewport, maxViewport, unit });
    return {
      name: `step-${step}`,
      min: minValue,
      max: maxValue,
      css: clamp.css,
      slope: clamp.slope,
      intercept: clamp.intercept,
    };
  });
}

// The value a clamp actually resolves to at a given viewport width.
//
// This exists so a preview can be honest. Applying a `clamp()` containing `vw`
// units inline resolves against the real document viewport, so every simulated
// width renders identically - the labels claim to show four widths while showing
// one. Resolving the arithmetic here lets the preview render the size the rule
// would genuinely produce at each width.
export function resolveClampAt(input: ClampInput, viewportPx: number): number {
  const { slope, intercept } = buildClamp(input);
  const preferred = intercept + slope * viewportPx;
  return Math.min(Math.max(preferred, input.minValue), input.maxValue);
}
