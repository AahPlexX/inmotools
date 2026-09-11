import type {
  CadSketch,
  SketchCircleEntity,
  SketchConstraint,
  SketchLineEntity,
  SketchPointEntity,
  SketchSolveOptions,
  SketchSolveResult,
} from './sketch-types';

interface PointIndex {
  point: SketchPointEntity;
  offset: number;
}

interface CircleIndex {
  circle: SketchCircleEntity;
  offset: number;
}

interface SolveCoreResult {
  values: number[];
  converged: boolean;
  residual: number;
  iterations: number;
}

const DEFAULT_TOLERANCE = 1e-9;
const DEFAULT_MAX_ITERATIONS = 80;
const MIN_GEOMETRY_SCALE = 1e-12;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function activeConstraints(sketch: CadSketch): SketchConstraint[] {
  return sketch.constraints.filter((constraint) => constraint.enabled);
}

function pointIndex(sketch: CadSketch): Map<string, PointIndex> {
  const result = new Map<string, PointIndex>();
  let offset = 0;
  for (const entity of sketch.entities) {
    if (entity.type !== 'point') continue;
    if (result.has(entity.id)) throw new Error(`Duplicate sketch point '${entity.id}'.`);
    result.set(entity.id, { point: entity, offset });
    offset += 2;
  }
  return result;
}

function lineIndex(sketch: CadSketch): Map<string, SketchLineEntity> {
  const result = new Map<string, SketchLineEntity>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'line') continue;
    if (result.has(entity.id)) throw new Error(`Duplicate sketch line '${entity.id}'.`);
    result.set(entity.id, entity);
  }
  return result;
}

function circleIndex(sketch: CadSketch, startOffset: number): Map<string, CircleIndex> {
  const result = new Map<string, CircleIndex>();
  let offset = startOffset;
  for (const entity of sketch.entities) {
    if (entity.type !== 'circle') continue;
    if (result.has(entity.id)) throw new Error(`Duplicate sketch circle '${entity.id}'.`);
    result.set(entity.id, { circle: entity, offset });
    offset += 1;
  }
  return result;
}

function initialValues(points: Map<string, PointIndex>, circles: Map<string, CircleIndex>): number[] {
  const values = Array.from({ length: points.size * 2 + circles.size }, () => 0);
  for (const { point, offset } of points.values()) {
    values[offset] = finite(point.x, `Point '${point.id}' x`);
    values[offset + 1] = finite(point.y, `Point '${point.id}' y`);
  }
  for (const { circle, offset } of circles.values()) {
    const radius = finite(circle.radius, `Circle '${circle.id}' radius`);
    if (radius <= 0) throw new Error(`Circle '${circle.id}' radius must be positive.`);
    values[offset] = radius;
  }
  return values;
}

function coordinates(values: readonly number[], points: Map<string, PointIndex>, pointId: string): [number, number] {
  const entry = points.get(pointId);
  if (!entry) throw new Error(`Constraint references missing point '${pointId}'.`);
  return [values[entry.offset]!, values[entry.offset + 1]!];
}

function linePoints(
  values: readonly number[],
  points: Map<string, PointIndex>,
  lines: Map<string, SketchLineEntity>,
  lineId: string,
): [[number, number], [number, number]] {
  const line = lines.get(lineId);
  if (!line) throw new Error(`Constraint references missing line '${lineId}'.`);
  return [coordinates(values, points, line.startPointId), coordinates(values, points, line.endPointId)];
}

function circleRadius(values: readonly number[], circles: Map<string, CircleIndex>, circleId: string): number {
  const entry = circles.get(circleId);
  if (!entry) throw new Error(`Constraint references missing circle '${circleId}'.`);
  return values[entry.offset]!;
}

function circleCenter(
  values: readonly number[],
  points: Map<string, PointIndex>,
  circles: Map<string, CircleIndex>,
  circleId: string,
): [number, number] {
  const entry = circles.get(circleId);
  if (!entry) throw new Error(`Constraint references missing circle '${circleId}'.`);
  return coordinates(values, points, entry.circle.centerPointId);
}

function fixedEntityResidual(
  entityId: string,
  values: readonly number[],
  points: Map<string, PointIndex>,
  lines: Map<string, SketchLineEntity>,
  circles: Map<string, CircleIndex>,
): number[] {
  const point = points.get(entityId);
  if (point) {
    return [values[point.offset]! - point.point.x, values[point.offset + 1]! - point.point.y];
  }

  const line = lines.get(entityId);
  if (line) {
    const start = points.get(line.startPointId);
    const end = points.get(line.endPointId);
    if (!start || !end) throw new Error(`Fixed line '${entityId}' references missing endpoint geometry.`);
    return [
      values[start.offset]! - start.point.x,
      values[start.offset + 1]! - start.point.y,
      values[end.offset]! - end.point.x,
      values[end.offset + 1]! - end.point.y,
    ];
  }

  const circle = circles.get(entityId);
  if (circle) {
    const center = points.get(circle.circle.centerPointId);
    if (!center) throw new Error(`Fixed circle '${entityId}' references a missing center point.`);
    return [
      values[center.offset]! - center.point.x,
      values[center.offset + 1]! - center.point.y,
      values[circle.offset]! - circle.circle.radius,
    ];
  }

  throw new Error(`Fixed-entity constraint references missing entity '${entityId}'.`);
}

function residualForConstraint(
  constraint: SketchConstraint,
  values: readonly number[],
  points: Map<string, PointIndex>,
  lines: Map<string, SketchLineEntity>,
  circles: Map<string, CircleIndex>,
): number[] {
  switch (constraint.type) {
    case 'fixed-point': {
      const [x, y] = coordinates(values, points, constraint.pointId);
      return [x - constraint.x, y - constraint.y];
    }
    case 'fixed-entity':
      return fixedEntityResidual(constraint.entityId, values, points, lines, circles);
    case 'horizontal': {
      const [[, ay], [, by]] = linePoints(values, points, lines, constraint.lineId);
      return [by - ay];
    }
    case 'vertical': {
      const [[ax], [bx]] = linePoints(values, points, lines, constraint.lineId);
      return [bx - ax];
    }
    case 'distance': {
      const [a, b] = [coordinates(values, points, constraint.pointAId), coordinates(values, points, constraint.pointBId)];
      return [Math.hypot(b[0] - a[0], b[1] - a[1]) - constraint.value];
    }
    case 'coincident': {
      const [a, b] = [coordinates(values, points, constraint.pointAId), coordinates(values, points, constraint.pointBId)];
      return [b[0] - a[0], b[1] - a[1]];
    }
    case 'radius': {
      const target = finite(constraint.value, `Radius constraint '${constraint.id}' value`);
      if (target <= 0) throw new Error(`Radius constraint '${constraint.id}' value must be positive.`);
      return [circleRadius(values, circles, constraint.circleId) - target];
    }
    case 'perpendicular': {
      const [a0, a1] = linePoints(values, points, lines, constraint.lineAId);
      const [b0, b1] = linePoints(values, points, lines, constraint.lineBId);
      const adx = a1[0] - a0[0];
      const ady = a1[1] - a0[1];
      const bdx = b1[0] - b0[0];
      const bdy = b1[1] - b0[1];
      const scale = Math.hypot(adx, ady) * Math.hypot(bdx, bdy);
      if (scale <= MIN_GEOMETRY_SCALE) throw new Error(`Perpendicular constraint '${constraint.id}' requires non-zero line lengths.`);
      return [(adx * bdx + ady * bdy) / scale];
    }
    case 'parallel': {
      const [a0, a1] = linePoints(values, points, lines, constraint.lineAId);
      const [b0, b1] = linePoints(values, points, lines, constraint.lineBId);
      const adx = a1[0] - a0[0];
      const ady = a1[1] - a0[1];
      const bdx = b1[0] - b0[0];
      const bdy = b1[1] - b0[1];
      const scale = Math.hypot(adx, ady) * Math.hypot(bdx, bdy);
      if (scale <= MIN_GEOMETRY_SCALE) throw new Error(`Parallel constraint '${constraint.id}' requires non-zero line lengths.`);
      return [(adx * bdy - ady * bdx) / scale];
    }
    case 'tangent': {
      const [[ax, ay], [bx, by]] = linePoints(values, points, lines, constraint.lineId);
      const [cx, cy] = circleCenter(values, points, circles, constraint.circleId);
      const radius = circleRadius(values, circles, constraint.circleId);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length <= MIN_GEOMETRY_SCALE) throw new Error(`Tangent constraint '${constraint.id}' requires a non-zero line length.`);
      const distance = Math.abs(dx * (cy - ay) - dy * (cx - ax)) / length;
      return [distance - radius];
    }
    case 'concentric': {
      const [ax, ay] = circleCenter(values, points, circles, constraint.circleAId);
      const [bx, by] = circleCenter(values, points, circles, constraint.circleBId);
      return [bx - ax, by - ay];
    }
    case 'equal-length': {
      const [a0, a1] = linePoints(values, points, lines, constraint.lineAId);
      const [b0, b1] = linePoints(values, points, lines, constraint.lineBId);
      const aLength = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      const bLength = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
      return [bLength - aLength];
    }
    case 'equal-radius':
      return [circleRadius(values, circles, constraint.circleBId) - circleRadius(values, circles, constraint.circleAId)];
    case 'midpoint': {
      const [px, py] = coordinates(values, points, constraint.pointId);
      const [[ax, ay], [bx, by]] = linePoints(values, points, lines, constraint.lineId);
      return [px - (ax + bx) / 2, py - (ay + by) / 2];
    }
    case 'point-on-line': {
      const [px, py] = coordinates(values, points, constraint.pointId);
      const [[ax, ay], [bx, by]] = linePoints(values, points, lines, constraint.lineId);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length <= MIN_GEOMETRY_SCALE) throw new Error(`Point-on-line constraint '${constraint.id}' requires a non-zero line length.`);
      return [(dx * (py - ay) - dy * (px - ax)) / length];
    }
    case 'point-on-circle': {
      const [px, py] = coordinates(values, points, constraint.pointId);
      const [cx, cy] = circleCenter(values, points, circles, constraint.circleId);
      const radius = circleRadius(values, circles, constraint.circleId);
      return [Math.hypot(px - cx, py - cy) - radius];
    }
    case 'symmetric-points': {
      const [pointA, pointB] = [
        coordinates(values, points, constraint.pointAId),
        coordinates(values, points, constraint.pointBId),
      ];
      const [axisStart, axisEnd] = linePoints(values, points, lines, constraint.axisLineId);
      const dx = axisEnd[0] - axisStart[0];
      const dy = axisEnd[1] - axisStart[1];
      const length = Math.hypot(dx, dy);
      if (length <= MIN_GEOMETRY_SCALE) throw new Error(`Symmetry constraint '${constraint.id}' requires a non-zero axis line.`);
      const midpointX = (pointA[0] + pointB[0]) / 2;
      const midpointY = (pointA[1] + pointB[1]) / 2;
      const midpointOnAxis = (dx * (midpointY - axisStart[1]) - dy * (midpointX - axisStart[0])) / length;
      const pairPerpendicularToAxis = (dx * (pointB[0] - pointA[0]) + dy * (pointB[1] - pointA[1])) / length;
      return [midpointOnAxis, pairPerpendicularToAxis];
    }
  }
}

function residualVector(
  constraints: readonly SketchConstraint[],
  values: readonly number[],
  points: Map<string, PointIndex>,
  lines: Map<string, SketchLineEntity>,
  circles: Map<string, CircleIndex>,
): number[] {
  return constraints.flatMap((constraint) => residualForConstraint(constraint, values, points, lines, circles));
}

function norm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function numericJacobian(
  constraints: readonly SketchConstraint[],
  values: readonly number[],
  points: Map<string, PointIndex>,
  lines: Map<string, SketchLineEntity>,
  circles: Map<string, CircleIndex>,
): number[][] {
  const base = residualVector(constraints, values, points, lines, circles);
  const jacobian = Array.from({ length: base.length }, () => Array.from({ length: values.length }, () => 0));
  for (let column = 0; column < values.length; column += 1) {
    const step = Math.max(1e-7, Math.abs(values[column]!) * 1e-7);
    const plus = [...values];
    const minus = [...values];
    plus[column] = plus[column]! + step;
    minus[column] = minus[column]! - step;
    const plusResidual = residualVector(constraints, plus, points, lines, circles);
    const minusResidual = residualVector(constraints, minus, points, lines, circles);
    for (let row = 0; row < base.length; row += 1) {
      jacobian[row]![column] = (plusResidual[row]! - minusResidual[row]!) / (2 * step);
    }
  }
  return jacobian;
}

function normalEquations(jacobian: readonly number[][], residuals: readonly number[], damping: number): { matrix: number[][]; rhs: number[] } {
  const columns = jacobian[0]?.length ?? 0;
  const matrix = Array.from({ length: columns }, () => Array.from({ length: columns }, () => 0));
  const rhs = Array.from({ length: columns }, () => 0);
  for (let row = 0; row < jacobian.length; row += 1) {
    for (let left = 0; left < columns; left += 1) {
      const jl = jacobian[row]![left]!;
      rhs[left] -= jl * residuals[row]!;
      for (let right = left; right < columns; right += 1) {
        matrix[left]![right] += jl * jacobian[row]![right]!;
      }
    }
  }
  for (let left = 0; left < columns; left += 1) {
    matrix[left]![left] += damping;
    for (let right = 0; right < left; right += 1) matrix[left]![right] = matrix[right]![left]!;
  }
  return { matrix, rhs };
}

function solveLinearSystem(matrix: readonly number[][], rhs: readonly number[]): number[] | null {
  const size = rhs.length;
  if (size === 0) return [];
  const augmented = matrix.map((row, index) => [...row, rhs[index]!]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(augmented[pivot]![column]!) < 1e-14) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]![column]!;
    for (let index = column; index <= size; index += 1) augmented[column]![index] /= divisor;
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

function matrixRank(matrix: readonly number[][], tolerance = 1e-8): number {
  if (!matrix.length || !matrix[0]?.length) return 0;
  const work = matrix.map((row) => [...row]);
  const rows = work.length;
  const columns = work[0]!.length;
  let rank = 0;
  let column = 0;
  while (rank < rows && column < columns) {
    let pivot = rank;
    for (let row = rank + 1; row < rows; row += 1) {
      if (Math.abs(work[row]![column]!) > Math.abs(work[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(work[pivot]![column]!) <= tolerance) {
      column += 1;
      continue;
    }
    [work[rank], work[pivot]] = [work[pivot]!, work[rank]!];
    const divisor = work[rank]![column]!;
    for (let index = column; index < columns; index += 1) work[rank]![index] /= divisor;
    for (let row = rank + 1; row < rows; row += 1) {
      const factor = work[row]![column]!;
      for (let index = column; index < columns; index += 1) work[row]![index] -= factor * work[rank]![index]!;
    }
    rank += 1;
    column += 1;
  }
  return rank;
}

function solveCore(
  constraints: readonly SketchConstraint[],
  startingValues: readonly number[],
  points: Map<string, PointIndex>,
  lines: Map<string, SketchLineEntity>,
  circles: Map<string, CircleIndex>,
  tolerance: number,
  maxIterations: number,
): SolveCoreResult {
  let values = [...startingValues];
  let damping = 1e-6;
  let residuals = residualVector(constraints, values, points, lines, circles);
  let error = norm(residuals);
  if (error <= tolerance || constraints.length === 0) return { values, converged: true, residual: error, iterations: 0 };

  let iterations = 0;
  for (; iterations < maxIterations; iterations += 1) {
    const jacobian = numericJacobian(constraints, values, points, lines, circles);
    let accepted = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { matrix, rhs } = normalEquations(jacobian, residuals, damping);
      const delta = solveLinearSystem(matrix, rhs);
      if (!delta) {
        damping *= 10;
        continue;
      }
      const trial = values.map((value, index) => value + delta[index]!);
      const trialResiduals = residualVector(constraints, trial, points, lines, circles);
      const trialError = norm(trialResiduals);
      if (trialError < error) {
        values = trial;
        residuals = trialResiduals;
        error = trialError;
        damping = Math.max(1e-12, damping * 0.25);
        accepted = true;
        break;
      }
      damping *= 10;
    }
    if (error <= tolerance) return { values, converged: true, residual: error, iterations: iterations + 1 };
    if (!accepted) break;
  }
  return { values, converged: error <= tolerance, residual: error, iterations };
}

function sketchWithValues(
  sketch: CadSketch,
  values: readonly number[],
  points: Map<string, PointIndex>,
  circles: Map<string, CircleIndex>,
): CadSketch {
  return {
    ...sketch,
    entities: sketch.entities.map((entity) => {
      if (entity.type === 'point') {
        const entry = points.get(entity.id);
        return entry ? { ...entity, x: values[entry.offset]!, y: values[entry.offset + 1]! } : { ...entity };
      }
      if (entity.type === 'circle') {
        const entry = circles.get(entity.id);
        return entry ? { ...entity, radius: values[entry.offset]! } : { ...entity };
      }
      return { ...entity };
    }),
    constraints: sketch.constraints.map((constraint) => ({ ...constraint })),
  };
}

function conflictIds(
  constraints: readonly SketchConstraint[],
  values: readonly number[],
  points: Map<string, PointIndex>,
  lines: Map<string, SketchLineEntity>,
  circles: Map<string, CircleIndex>,
  tolerance: number,
  maxIterations: number,
): string[] {
  const conflicts: string[] = [];
  for (const candidate of constraints) {
    const reduced = constraints.filter((constraint) => constraint.id !== candidate.id);
    const result = solveCore(reduced, values, points, lines, circles, tolerance, maxIterations);
    if (result.converged) conflicts.push(candidate.id);
  }
  return conflicts.length ? conflicts : constraints.map((constraint) => constraint.id);
}

export function solveSketch(sketch: CadSketch, options: SketchSolveOptions = {}): SketchSolveResult {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  finite(tolerance, 'Sketch tolerance');
  if (tolerance <= 0) throw new Error('Sketch tolerance must be positive.');
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) throw new Error('Sketch maxIterations must be a positive integer.');

  const points = pointIndex(sketch);
  const lines = lineIndex(sketch);
  const circles = circleIndex(sketch, points.size * 2);
  const constraints = activeConstraints(sketch);
  const initial = initialValues(points, circles);
  let core = solveCore(constraints, initial, points, lines, circles, tolerance, maxIterations);

  const hardJacobian = numericJacobian(constraints, core.values, points, lines, circles);
  const degreesOfFreedom = Math.max(0, core.values.length - matrixRank(hardJacobian));

  if (core.converged && degreesOfFreedom > 0 && options.dragTarget) {
    const target = points.get(options.dragTarget.pointId);
    if (!target) throw new Error(`Drag target references missing point '${options.dragTarget.pointId}'.`);
    const seeded = [...core.values];
    seeded[target.offset] = finite(options.dragTarget.x, 'Drag target x');
    seeded[target.offset + 1] = finite(options.dragTarget.y, 'Drag target y');
    const dragged = solveCore(constraints, seeded, points, lines, circles, tolerance, maxIterations);
    if (dragged.converged) core = dragged;
  }

  if (!core.converged) {
    return {
      sketch: sketchWithValues(sketch, core.values, points, circles),
      converged: false,
      constraintState: 'over',
      degreesOfFreedom,
      residual: core.residual,
      conflicts: conflictIds(constraints, initial, points, lines, circles, tolerance, maxIterations),
      iterations: core.iterations,
    };
  }

  return {
    sketch: sketchWithValues(sketch, core.values, points, circles),
    converged: true,
    constraintState: degreesOfFreedom === 0 ? 'fully' : 'under',
    degreesOfFreedom,
    residual: core.residual,
    conflicts: [],
    iterations: core.iterations,
  };
}