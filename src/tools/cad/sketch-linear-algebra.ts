import { Matrix, SingularValueDecomposition, solve } from 'ml-matrix';

function assertFiniteMatrix(matrix: readonly (readonly number[])[], label: string): number {
  const columns = matrix[0]?.length ?? 0;
  for (let row = 0; row < matrix.length; row += 1) {
    if ((matrix[row]?.length ?? 0) !== columns) throw new Error(`${label} must be rectangular.`);
    for (let column = 0; column < columns; column += 1) {
      if (!Number.isFinite(matrix[row]![column])) {
        throw new Error(`${label} contains a non-finite value at [${row}, ${column}].`);
      }
    }
  }
  return columns;
}

/**
 * Computes one damped Gauss-Newton step using ml-matrix's SVD-backed solver.
 * Solving through SVD keeps rank-deficient sketch states deterministic and
 * yields the minimum-norm step instead of relying on a hand-rolled pivot path.
 */
export function solveDampedNormalEquations(
  jacobian: readonly (readonly number[])[],
  residuals: readonly number[],
  damping: number,
): number[] | null {
  if (!Number.isFinite(damping) || damping < 0) throw new Error('Damping must be a finite non-negative number.');
  if (jacobian.length !== residuals.length) throw new Error('Jacobian row count must match residual count.');

  const columns = assertFiniteMatrix(jacobian, 'Jacobian');
  if (columns === 0) return [];
  for (const residual of residuals) {
    if (!Number.isFinite(residual)) throw new Error('Residuals must contain only finite values.');
  }

  const normal = Array.from({ length: columns }, () => Array.from({ length: columns }, () => 0));
  const rhs = Array.from({ length: columns }, () => 0);

  for (let row = 0; row < jacobian.length; row += 1) {
    for (let left = 0; left < columns; left += 1) {
      const leftValue = jacobian[row]![left]!;
      rhs[left] -= leftValue * residuals[row]!;
      for (let right = left; right < columns; right += 1) {
        normal[left]![right] += leftValue * jacobian[row]![right]!;
      }
    }
  }

  for (let left = 0; left < columns; left += 1) {
    normal[left]![left] += damping;
    for (let right = 0; right < left; right += 1) normal[left]![right] = normal[right]![left]!;
  }

  try {
    const result = solve(new Matrix(normal), Matrix.columnVector(rhs), true).getColumn(0);
    return result.every(Number.isFinite) ? result : null;
  } catch {
    return null;
  }
}

/** Returns matrix rank using an explicit absolute singular-value tolerance. */
export function numericalRank(
  matrix: readonly (readonly number[])[],
  tolerance = 1e-8,
): number {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Rank tolerance must be a finite non-negative number.');
  const columns = assertFiniteMatrix(matrix, 'Matrix');
  if (matrix.length === 0 || columns === 0) return 0;

  const decomposition = new SingularValueDecomposition(new Matrix(matrix as number[][]), {
    autoTranspose: true,
  });
  return decomposition.diagonal.reduce((rank, singularValue) => rank + (singularValue > tolerance ? 1 : 0), 0);
}
