export type RefinementParameterKind =
  | 'scale'
  | 'zero-shift'
  | 'lattice-a'
  | 'lattice-b'
  | 'lattice-c'
  | 'alpha'
  | 'beta'
  | 'gamma'
  | 'background'
  | 'profile-width'
  | 'phase-scale'
  | 'preferred-orientation'
  | 'coordinate'
  | 'occupancy'
  | 'adp';

export interface RefinementObservation {
  readonly x: number;
  readonly observed: number;
  readonly weight?: number;
}

export interface RefinementParameter {
  readonly id: string;
  readonly label: string;
  readonly kind: RefinementParameterKind;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly fixed: boolean;
}

export interface RefinementMetrics {
  readonly weightedSse: number;
  /** Rwp = sqrt(sum(w * residual^2) / sum(w * observed^2)). */
  readonly rwp: number;
  /** Rp = sum(abs(residual)) / sum(abs(observed)). */
  readonly rp: number;
}

export type RefinementTerminationReason =
  | 'converged'
  | 'max-iterations'
  | 'no-free-parameters'
  | 'singular';

export interface RefinementResult {
  readonly parameters: Readonly<Record<string, number>>;
  readonly changes: Readonly<Record<string, number>>;
  readonly activeParameterIds: readonly string[];
  readonly metrics: RefinementMetrics;
  readonly iterations: number;
  readonly converged: boolean;
  readonly terminationReason: RefinementTerminationReason;
}

export interface RefinementOptions {
  readonly maxIterations?: number;
  readonly tolerance?: number;
  readonly finiteDifferenceStep?: number;
  readonly damping?: number;
}

export type RefinementModel = (
  x: number,
  parameters: Readonly<Record<string, number>>,
) => number;

interface EvaluatedState {
  readonly predictions: readonly number[];
  readonly residuals: readonly number[];
  readonly metrics: RefinementMetrics;
}

const DEFAULT_OPTIONS: Required<RefinementOptions> = {
  maxIterations: 50,
  tolerance: 1e-8,
  finiteDifferenceStep: 1e-6,
  damping: 1e-8,
};

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function validateInputs(
  observations: readonly RefinementObservation[],
  parameters: readonly RefinementParameter[],
  options: Required<RefinementOptions>,
): void {
  if (observations.length === 0) throw new RangeError('Refinement requires at least one observation.');
  for (const [index, observation] of observations.entries()) {
    if (!Number.isFinite(observation.x) || !Number.isFinite(observation.observed)) {
      throw new RangeError(`Observation ${index + 1} must contain finite x and observed values.`);
    }
    assertPositiveFinite(observation.weight ?? 1, `Observation ${index + 1} weight`);
  }

  const ids = new Set<string>();
  for (const parameter of parameters) {
    if (!parameter.id.trim()) throw new RangeError('Refinement parameter IDs must not be empty.');
    if (ids.has(parameter.id)) throw new RangeError(`Duplicate refinement parameter ID: ${parameter.id}`);
    ids.add(parameter.id);
    if (![parameter.value, parameter.min, parameter.max].every(Number.isFinite)) {
      throw new RangeError(`Refinement parameter ${parameter.id} must use finite value and bounds.`);
    }
    if (parameter.min > parameter.max) {
      throw new RangeError(`Refinement parameter ${parameter.id} has min greater than max.`);
    }
    if (parameter.value < parameter.min || parameter.value > parameter.max) {
      throw new RangeError(`Refinement parameter ${parameter.id} starts outside its bounds.`);
    }
  }

  if (!Number.isSafeInteger(options.maxIterations) || options.maxIterations <= 0) {
    throw new RangeError('Maximum refinement iterations must be a positive integer.');
  }
  assertPositiveFinite(options.tolerance, 'Refinement tolerance');
  assertPositiveFinite(options.finiteDifferenceStep, 'Finite-difference step');
  if (!Number.isFinite(options.damping) || options.damping < 0) {
    throw new RangeError('Refinement damping must be a non-negative finite number.');
  }
}

function recordFromParameters(parameters: readonly RefinementParameter[]): Record<string, number> {
  return Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.value]));
}

function evaluate(
  observations: readonly RefinementObservation[],
  values: Readonly<Record<string, number>>,
  model: RefinementModel,
): EvaluatedState {
  const predictions: number[] = [];
  const residuals: number[] = [];
  let weightedSse = 0;
  let observedWeightedSquares = 0;
  let absoluteResiduals = 0;
  let absoluteObserved = 0;

  for (const observation of observations) {
    const predicted = model(observation.x, values);
    if (!Number.isFinite(predicted)) {
      throw new RangeError('Refinement model returned a non-finite calculated value.');
    }
    const residual = observation.observed - predicted;
    const weight = observation.weight ?? 1;
    predictions.push(predicted);
    residuals.push(residual);
    weightedSse += weight * residual * residual;
    observedWeightedSquares += weight * observation.observed * observation.observed;
    absoluteResiduals += Math.abs(residual);
    absoluteObserved += Math.abs(observation.observed);
  }

  return {
    predictions,
    residuals,
    metrics: {
      weightedSse,
      rwp: observedWeightedSquares > 0
        ? Math.sqrt(weightedSse / observedWeightedSquares)
        : (weightedSse === 0 ? 0 : Number.POSITIVE_INFINITY),
      rp: absoluteObserved > 0
        ? absoluteResiduals / absoluteObserved
        : (absoluteResiduals === 0 ? 0 : Number.POSITIVE_INFINITY),
    },
  };
}

function solveLinearSystem(matrix: readonly (readonly number[])[], rhs: readonly number[]): number[] | null {
  const size = rhs.length;
  const augmented = Array.from({ length: size }, (_, row) => [
    ...matrix[row]!,
    rhs[row]!,
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(augmented[pivot]![column]!) < 1e-15) return null;
    if (pivot !== column) [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];

    const pivotValue = augmented[column]![column]!;
    for (let index = column; index <= size; index += 1) augmented[column]![index] /= pivotValue;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      if (factor === 0) continue;
      for (let index = column; index <= size; index += 1) {
        augmented[row]![index] -= factor * augmented[column]![index]!;
      }
    }
  }

  return augmented.map((row) => row[size]!);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildNormalEquations(
  observations: readonly RefinementObservation[],
  parameters: readonly RefinementParameter[],
  active: readonly RefinementParameter[],
  currentValues: Readonly<Record<string, number>>,
  current: EvaluatedState,
  model: RefinementModel,
  finiteDifferenceStep: number,
  damping: number,
): { matrix: number[][]; rhs: number[] } {
  const jacobian = observations.map((observation) => active.map((parameter) => {
    const value = currentValues[parameter.id]!;
    const nominalStep = finiteDifferenceStep * Math.max(1, Math.abs(value));
    const lower = Math.max(parameter.min, value - nominalStep);
    const upper = Math.min(parameter.max, value + nominalStep);
    if (!(upper > lower)) return 0;

    const lowerValues = { ...currentValues, [parameter.id]: lower };
    const upperValues = { ...currentValues, [parameter.id]: upper };
    const lowerPrediction = model(observation.x, lowerValues);
    const upperPrediction = model(observation.x, upperValues);
    if (!Number.isFinite(lowerPrediction) || !Number.isFinite(upperPrediction)) {
      throw new RangeError(`Refinement model returned a non-finite derivative sample for ${parameter.id}.`);
    }
    return (upperPrediction - lowerPrediction) / (upper - lower);
  }));

  const matrix = active.map((_, left) => active.map((__, right) => {
    let sum = 0;
    for (let row = 0; row < observations.length; row += 1) {
      const weight = observations[row]!.weight ?? 1;
      sum += weight * jacobian[row]![left]! * jacobian[row]![right]!;
    }
    return sum + (left === right ? damping : 0);
  }));

  const rhs = active.map((_, column) => {
    let sum = 0;
    for (let row = 0; row < observations.length; row += 1) {
      const weight = observations[row]!.weight ?? 1;
      sum += weight * jacobian[row]![column]! * current.residuals[row]!;
    }
    return sum;
  });

  void parameters;
  return { matrix, rhs };
}

function changesFrom(
  initial: Readonly<Record<string, number>>,
  current: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(Object.keys(initial).map((id) => [id, current[id]! - initial[id]!]));
}

/**
 * Small, deterministic projected Gauss-Newton/Levenberg-Marquardt core for
 * bounded crystallographic least-squares tasks. The caller owns the scientific
 * forward model; this engine owns parameter bounds, fixed/free state,
 * convergence bookkeeping, and common profile residual metrics.
 */
export function refineLeastSquares(
  observations: readonly RefinementObservation[],
  parameters: readonly RefinementParameter[],
  model: RefinementModel,
  options: RefinementOptions = {},
): RefinementResult {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  validateInputs(observations, parameters, resolved);

  const initialValues = recordFromParameters(parameters);
  let currentValues = { ...initialValues };
  let current = evaluate(observations, currentValues, model);
  const active = parameters.filter((parameter) => !parameter.fixed && parameter.min < parameter.max);
  const activeParameterIds = active.map((parameter) => parameter.id);

  if (active.length === 0) {
    return {
      parameters: currentValues,
      changes: changesFrom(initialValues, currentValues),
      activeParameterIds,
      metrics: current.metrics,
      iterations: 0,
      converged: true,
      terminationReason: 'no-free-parameters',
    };
  }

  let damping = resolved.damping;
  let acceptedIterations = 0;
  let singularAttempts = 0;

  for (let iteration = 1; iteration <= resolved.maxIterations; iteration += 1) {
    const equations = buildNormalEquations(
      observations,
      parameters,
      active,
      currentValues,
      current,
      model,
      resolved.finiteDifferenceStep,
      damping,
    );
    const delta = solveLinearSystem(equations.matrix, equations.rhs);
    if (!delta) {
      singularAttempts += 1;
      damping = Math.max(1e-12, damping === 0 ? 1e-8 : damping * 10);
      if (singularAttempts >= 6) {
        return {
          parameters: currentValues,
          changes: changesFrom(initialValues, currentValues),
          activeParameterIds,
          metrics: current.metrics,
          iterations: iteration,
          converged: false,
          terminationReason: 'singular',
        };
      }
      continue;
    }

    const candidateValues = { ...currentValues };
    let maxDelta = 0;
    let maxMagnitude = 0;
    for (let index = 0; index < active.length; index += 1) {
      const parameter = active[index]!;
      const before = currentValues[parameter.id]!;
      const after = clamp(before + delta[index]!, parameter.min, parameter.max);
      candidateValues[parameter.id] = after;
      maxDelta = Math.max(maxDelta, Math.abs(after - before));
      maxMagnitude = Math.max(maxMagnitude, Math.abs(after));
    }

    const candidate = evaluate(observations, candidateValues, model);
    if (candidate.metrics.weightedSse <= current.metrics.weightedSse) {
      const priorSse = current.metrics.weightedSse;
      const improvement = priorSse - candidate.metrics.weightedSse;
      currentValues = candidateValues;
      current = candidate;
      acceptedIterations += 1;
      damping = Math.max(1e-14, damping * 0.25);

      const stepConverged = maxDelta <= resolved.tolerance * (1 + maxMagnitude);
      const objectiveConverged = improvement <= resolved.tolerance * (1 + priorSse);
      if (stepConverged || objectiveConverged) {
        return {
          parameters: currentValues,
          changes: changesFrom(initialValues, currentValues),
          activeParameterIds,
          metrics: current.metrics,
          iterations: iteration,
          converged: true,
          terminationReason: 'converged',
        };
      }
    } else {
      damping = Math.max(1e-12, damping === 0 ? 1e-8 : damping * 10);
    }
  }

  return {
    parameters: currentValues,
    changes: changesFrom(initialValues, currentValues),
    activeParameterIds,
    metrics: current.metrics,
    iterations: resolved.maxIterations,
    converged: false,
    terminationReason: 'max-iterations',
  };
}
