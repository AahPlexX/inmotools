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

export function buildScaleMatrix(input: ScaleInput) {
  if (input.ratio <= 0) throw new Error('Ratio must be positive.');
  return input.steps.map((step) => ({
    name: `step-${step}`,
    min: input.minBase * Math.pow(input.ratio, step),
    max: input.maxBase * Math.pow(input.ratio, step),
  }));
}
