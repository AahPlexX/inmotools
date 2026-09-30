/**
 * Bounded Levenberg-Marquardt least squares (master design items 109-111).
 *
 * Generic on purpose: the powder model supplies a residual function, this core supplies
 * fixed/free/bounded parameters, a numeric Jacobian, damping, and an honest termination
 * report. Bounds are enforced by clamping each trial step, so a parameter can sit exactly
 * on a limit. Convergence is only reported when the relative chi-square improvement falls
 * below the tolerance or no damped step can improve the fit; running out of iterations is
 * always reported as 'max-iterations', never as converged.
 */

export interface FitParameter {
  readonly name: string;
  readonly value: number;
  readonly free: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface FitOptions {
  /** Maximum accepted-step iterations (default 100). */
  readonly maxIterations?: number;
  /** Relative chi-square improvement below which the fit is converged (default 1e-10). */
  readonly tolerance?: number;
}

export type FitTermination = 'converged' | 'max-iterations';

export interface FitResult {
  readonly parameters: readonly FitParameter[];
  readonly iterations: number;
  readonly converged: boolean;
  readonly termination: FitTermination;
  readonly initialChiSquare: number;
  readonly chiSquare: number;
}

const MAX_DAMPING_ATTEMPTS = 24;

function clampValue(value: number, parameter: FitParameter): number {
  const lower = parameter.min ?? -Infinity;
  const upper = parameter.max ?? Infinity;
  return Math.min(upper, Math.max(lower, value));
}

/** Solve A x = b by Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row, index) => [...row, rhs[index]!]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(a[pivot]![column]!) < 1e-300) return null;
    [a[column], a[pivot]] = [a[pivot]!, a[column]!];
    for (let row = column + 1; row < n; row += 1) {
      const factor = a[row]![column]! / a[column]![column]!;
      for (let k = column; k <= n; k += 1) a[row]![k]! -= factor * a[column]![k]!;
    }
  }
  const solution = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = a[row]![n]!;
    for (let k = row + 1; k < n; k += 1) sum -= a[row]![k]! * solution[k]!;
    solution[row] = sum / a[row]![row]!;
  }
  return solution.every(Number.isFinite) ? solution : null;
}

/**
 * Minimise the sum of squared residuals over the free parameters.
 *
 * @throws {RangeError} no free parameter, a start value outside its bounds, or residuals that are empty or non-finite.
 */
export function fitLeastSquares(
  parameters: readonly FitParameter[],
  residuals: (values: readonly number[]) => readonly number[],
  options: FitOptions = {},
): FitResult {
  const maxIterations = options.maxIterations ?? 100;
  const tolerance = options.tolerance ?? 1e-10;
  const freeIndices = parameters.flatMap((parameter, index) => (parameter.free ? [index] : []));
  if (!freeIndices.length) throw new RangeError('Fit needs at least one free parameter.');
  for (const parameter of parameters) {
    const lower = parameter.min ?? -Infinity;
    const upper = parameter.max ?? Infinity;
    if (!Number.isFinite(parameter.value) || lower > upper || parameter.value < lower || parameter.value > upper) {
      throw new RangeError(`Parameter "${parameter.name}" starts outside its bounds or is not finite.`);
    }
  }

  const evaluate = (values: readonly number[]): { readonly r: readonly number[]; readonly chi: number } => {
    const r = residuals(values);
    if (!r.length || !r.every(Number.isFinite)) throw new RangeError('Residuals must be a non-empty array of finite numbers.');
    return { r, chi: r.reduce((sum, value) => sum + value * value, 0) };
  };

  let values = parameters.map((parameter) => parameter.value);
  let current = evaluate(values);
  const initialChiSquare = current.chi;
  let iterations = 0;
  let converged = false;

  while (iterations < maxIterations && !converged) {
    // --- numeric Jacobian over the free parameters (step flips inward at an upper bound) ---
    const jacobian = freeIndices.map((index) => {
      const parameter = parameters[index]!;
      const base = values[index]!;
      let step = 1e-6 * Math.max(Math.abs(base), 1e-3);
      if (base + step > (parameter.max ?? Infinity)) step = -step;
      const shifted = [...values];
      shifted[index] = base + step;
      return evaluate(shifted).r.map((value, row) => (value - current.r[row]!) / step);
    });
    const normal = jacobian.map((left) => jacobian.map((right) => left.reduce((sum, value, row) => sum + value * right[row]!, 0)));
    const gradient = jacobian.map((column) => column.reduce((sum, value, row) => sum + value * current.r[row]!, 0));

    // --- damped step search: grow lambda until the trial (clamped to bounds) lowers chi-square ---
    let damping = 1e-3;
    let accepted: { readonly next: number[]; readonly chi: number; readonly r: readonly number[] } | null = null;
    for (let attempt = 0; attempt < MAX_DAMPING_ATTEMPTS && !accepted; attempt += 1) {
      const damped = normal.map((row, i) => row.map((value, j) => (i === j ? value + damping * (value || 1) : value)));
      const delta = solveLinear(damped, gradient.map((value) => -value));
      if (delta) {
        const next = [...values];
        freeIndices.forEach((index, i) => {
          next[index] = clampValue(values[index]! + delta[i]!, parameters[index]!);
        });
        const trial = evaluate(next);
        if (trial.chi < current.chi) accepted = { next, chi: trial.chi, r: trial.r };
      }
      damping *= 10;
    }

    // No damped step improves the fit: a stationary point (or bound-limited optimum) was reached.
    if (!accepted) {
      converged = true;
      break;
    }
    iterations += 1;
    const improvement = current.chi - accepted.chi;
    values = accepted.next;
    current = { r: accepted.r, chi: accepted.chi };
    if (improvement <= tolerance * (current.chi + tolerance)) converged = true;
  }

  return {
    parameters: parameters.map((parameter, index) => ({ ...parameter, value: values[index]! })),
    iterations,
    converged,
    termination: converged ? 'converged' : 'max-iterations',
    initialChiSquare,
    chiSquare: current.chi,
  };
}
