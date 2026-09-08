export interface ClampInput {
  minValue: number;
  maxValue: number;
  minViewport: number;
  maxViewport: number;
  unit: 'rem' | 'px';
  rootFontPx?: number;
}
export interface ScaleInput { minBase: number; maxBase: number; ratio: number; steps: number[] }

const trim = (value: number) => Number(value.toFixed(4)).toString();

function validateInput(input: ClampInput) {
  if (![input.minValue, input.maxValue, input.minViewport, input.maxViewport].every(Number.isFinite)) throw new Error('All scale values must be finite numbers.');
  if (!(input.maxViewport > input.minViewport)) throw new Error('Maximum viewport must exceed minimum viewport.');
  if (input.maxValue < input.minValue) throw new Error('Maximum value must be at least the minimum value.');
  if (input.minValue <= 0) throw new Error('Minimum type size must be greater than zero.');
  const rootFontPx = input.rootFontPx ?? 16;
  if (!Number.isFinite(rootFontPx) || rootFontPx <= 0) throw new Error('Root font size must be a positive finite pixel value.');
  return rootFontPx;
}

export function buildClamp(input: ClampInput) {
  const rootFontPx = validateInput(input);
  const slope = (input.maxValue - input.minValue) / (input.maxViewport - input.minViewport);
  const intercept = input.minValue - slope * input.minViewport;
  // slope is expressed in the selected size unit per CSS pixel. A vw unit
  // contributes viewportPx / 100 CSS pixels, so rem interpolation must convert
  // the desired rem delta to pixels using the declared root-font assumption.
  const unitToPx = input.unit === 'rem' ? rootFontPx : 1;
  const vw = slope * unitToPx * 100;
  return {
    css: `clamp(${trim(input.minValue)}${input.unit}, calc(${trim(intercept)}${input.unit} + ${trim(vw)}vw), ${trim(input.maxValue)}${input.unit})`,
    slope,
    intercept,
    vw,
    rootFontPx,
  };
}

export function buildScaleMatrix(input: ScaleInput & Partial<Omit<ClampInput, 'minValue' | 'maxValue'>>) {
  if (!Number.isFinite(input.ratio) || input.ratio <= 0) throw new Error('Ratio must be a positive finite number.');
  const minViewport = input.minViewport ?? 320;
  const maxViewport = input.maxViewport ?? 1440;
  const unit = input.unit ?? 'rem';
  const rootFontPx = input.rootFontPx ?? 16;

  return input.steps.map((step) => {
    const minValue = input.minBase * Math.pow(input.ratio, step);
    const maxValue = input.maxBase * Math.pow(input.ratio, step);
    const clamp = buildClamp({ minValue, maxValue, minViewport, maxViewport, unit, rootFontPx });
    return {
      name: `step-${step}`,
      min: minValue,
      max: maxValue,
      css: clamp.css,
      slope: clamp.slope,
      intercept: clamp.intercept,
      vw: clamp.vw,
    };
  });
}

export function resolveClampAt(input: ClampInput, viewportPx: number): number {
  const { slope, intercept } = buildClamp(input);
  const preferred = intercept + slope * viewportPx;
  return Math.min(Math.max(preferred, input.minValue), input.maxValue);
}

/** Resolves the generated mixed-unit CSS using the same root assumption. */
export function resolveGeneratedCssAt(input: ClampInput, viewportPx: number): number {
  const { intercept, vw, rootFontPx } = buildClamp(input);
  const preferredPx = intercept * (input.unit === 'rem' ? rootFontPx : 1) + vw * viewportPx / 100;
  const preferred = preferredPx / (input.unit === 'rem' ? rootFontPx : 1);
  return Math.min(Math.max(preferred, input.minValue), input.maxValue);
}
