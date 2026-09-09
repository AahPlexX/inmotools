export type FluidUnit = 'rem' | 'px';

export interface ClampInput {
  minValue: number;
  maxValue: number;
  minViewport: number;
  maxViewport: number;
  unit: FluidUnit;
  rootFontPx?: number;
}
export interface ScaleInput { minBase: number; maxBase: number; ratio: number; steps: number[] }

const MIN_DECIMALS = 4;
const MAX_DECIMALS = 12;
const SERIALIZATION_RELATIVE_TOLERANCE = 5e-5;

function trimFixed(value: number, decimals: number): string {
  const text = value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
  return text === '-0' || text === '' ? '0' : text;
}

function cssNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Generated CSS contains a non-finite number.');
  for (let decimals = MIN_DECIMALS; decimals <= MAX_DECIMALS; decimals += 1) {
    const text = trimFixed(value, decimals);
    const parsed = Number(text);
    const tolerance = Math.max(1e-12, Math.abs(value) * SERIALIZATION_RELATIVE_TOLERANCE);
    if (Math.abs(parsed - value) <= tolerance) return text;
  }
  throw new Error('A scale value is below the supported emitted CSS precision. Increase the values or reduce the viewport span.');
}

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
  const unitToPx = input.unit === 'rem' ? rootFontPx : 1;
  const vw = slope * unitToPx * 100;

  const minCss = cssNumber(input.minValue);
  const maxCss = cssNumber(input.maxValue);
  const interceptCss = cssNumber(intercept);
  const vwCss = cssNumber(vw);
  const emitted = {
    minValue: Number(minCss),
    maxValue: Number(maxCss),
    intercept: Number(interceptCss),
    vw: Number(vwCss),
  };

  return {
    css: `clamp(${minCss}${input.unit}, calc(${interceptCss}${input.unit} + ${vwCss}vw), ${maxCss}${input.unit})`,
    slope,
    intercept,
    vw,
    rootFontPx,
    emitted,
  };
}

export function buildScaleMatrix(input: ScaleInput & Partial<Omit<ClampInput, 'minValue' | 'maxValue'>>) {
  if (!Number.isFinite(input.ratio) || input.ratio <= 0) throw new Error('Scale ratio must be a positive finite number.');
  if (!input.steps.length) throw new Error('At least one scale step is required.');
  if (!input.steps.every(Number.isInteger)) throw new Error('Scale steps must be whole numbers.');
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

/** Resolves the actual serialized CSS coefficients, not the higher-precision source math. */
export function resolveGeneratedCssAt(input: ClampInput, viewportPx: number): number {
  const { emitted, rootFontPx } = buildClamp(input);
  const unitToPx = input.unit === 'rem' ? rootFontPx : 1;
  const preferredPx = emitted.intercept * unitToPx + emitted.vw * viewportPx / 100;
  const preferred = preferredPx / unitToPx;
  return Math.min(Math.max(preferred, emitted.minValue), emitted.maxValue);
}
