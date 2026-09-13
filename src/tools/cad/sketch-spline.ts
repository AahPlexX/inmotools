import type { CadSketch, SketchPointEntity, SketchSplineEntity, SketchVector2 } from './sketch-types';

export interface InterpolatingSplineCurve {
  degree: number;
  closed: boolean;
  controlPoints: SketchVector2[];
  knots: number[];
  fitParameters: number[];
  parameterDomain: readonly [number, number];
  periodicControlCount?: number;
}

const EPSILON = 1e-12;

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function pointMap(sketch: CadSketch): Map<string, SketchPointEntity> {
  const points = new Map<string, SketchPointEntity>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'point') continue;
    if (points.has(entity.id)) throw new Error(`Duplicate sketch point '${entity.id}'.`);
    finite(entity.x, `Point '${entity.id}' x`);
    finite(entity.y, `Point '${entity.id}' y`);
    points.set(entity.id, entity);
  }
  return points;
}

function requireSpline(sketch: CadSketch, splineId: string): SketchSplineEntity {
  const entity = sketch.entities.find((candidate) => candidate.id === splineId);
  if (!entity || entity.type !== 'spline') throw new Error(`Sketch spline '${splineId}' does not exist.`);
  if (!Number.isInteger(entity.degree) || entity.degree < 1 || entity.degree > 5) {
    throw new Error(`Spline '${splineId}' degree must be an integer from 1 through 5.`);
  }
  if (entity.fitPointIds.length < (entity.closed ? 3 : 2)) {
    throw new Error(`Spline '${splineId}' requires at least ${entity.closed ? 3 : 2} fit points.`);
  }
  if (entity.closed && (entity.startTangent || entity.endTangent)) {
    throw new Error(`Closed spline '${splineId}' cannot use endpoint tangent vectors.`);
  }
  return entity;
}

function fitPoints(sketch: CadSketch, spline: SketchSplineEntity): SketchPointEntity[] {
  const points = pointMap(sketch);
  return spline.fitPointIds.map((pointId) => {
    const point = points.get(pointId);
    if (!point) throw new Error(`Spline '${spline.id}' references missing fit point '${pointId}'.`);
    return point;
  });
}

function distance(a: SketchPointEntity, b: SketchPointEntity): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function chordParameters(points: readonly SketchPointEntity[], closed: boolean): number[] {
  const segmentLengths: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const length = distance(points[index - 1]!, points[index]!);
    if (length <= EPSILON) throw new Error('Spline fit points must not contain consecutive coincident points.');
    segmentLengths.push(length);
  }
  if (closed) {
    const closingLength = distance(points[points.length - 1]!, points[0]!);
    if (closingLength <= EPSILON) throw new Error('Closed spline first and last fit points must be distinct.');
    segmentLengths.push(closingLength);
  }

  const total = segmentLengths.reduce((sum, value) => sum + value, 0);
  if (total <= EPSILON) throw new Error('Spline fit-point chord length must be positive.');

  const parameters = [0];
  let accumulated = 0;
  for (let index = 1; index < points.length; index += 1) {
    accumulated += segmentLengths[index - 1]!;
    parameters.push(accumulated / total);
  }
  if (!closed) parameters[parameters.length - 1] = 1;
  return parameters;
}

function openUniformKnots(controlCount: number, degree: number): number[] {
  const knotCount = controlCount + degree + 1;
  const knots = Array.from({ length: knotCount }, () => 0);
  const interiorCount = controlCount - degree - 1;
  for (let index = 0; index <= degree; index += 1) knots[index] = 0;
  for (let index = 1; index <= interiorCount; index += 1) {
    knots[degree + index] = index / (interiorCount + 1);
  }
  for (let index = controlCount; index < knotCount; index += 1) knots[index] = 1;
  return knots;
}

function periodicUniformKnots(uniqueControlCount: number, degree: number): number[] {
  const extendedControlCount = uniqueControlCount + degree;
  return Array.from({ length: extendedControlCount + degree + 1 }, (_, index) => index);
}

function basisValue(
  index: number,
  degree: number,
  parameter: number,
  knots: readonly number[],
  terminalControlIndex: number | null = null,
  terminalParameter: number | null = null,
): number {
  if (degree === 0) {
    if (terminalControlIndex === index && terminalParameter !== null && parameter === terminalParameter) return 1;
    return knots[index]! <= parameter && parameter < knots[index + 1]! ? 1 : 0;
  }

  let value = 0;
  const leftDenominator = knots[index + degree]! - knots[index]!;
  if (Math.abs(leftDenominator) > EPSILON) {
    value += ((parameter - knots[index]!) / leftDenominator)
      * basisValue(index, degree - 1, parameter, knots, terminalControlIndex, terminalParameter);
  }
  const rightDenominator = knots[index + degree + 1]! - knots[index + 1]!;
  if (Math.abs(rightDenominator) > EPSILON) {
    value += ((knots[index + degree + 1]! - parameter) / rightDenominator)
      * basisValue(index + 1, degree - 1, parameter, knots, terminalControlIndex, terminalParameter);
  }
  return value;
}

function basisDerivative(
  index: number,
  degree: number,
  parameter: number,
  knots: readonly number[],
  terminalControlIndex: number | null = null,
  terminalParameter: number | null = null,
): number {
  if (degree === 0) return 0;
  let value = 0;
  const leftDenominator = knots[index + degree]! - knots[index]!;
  if (Math.abs(leftDenominator) > EPSILON) {
    value += degree / leftDenominator
      * basisValue(index, degree - 1, parameter, knots, terminalControlIndex, terminalParameter);
  }
  const rightDenominator = knots[index + degree + 1]! - knots[index + 1]!;
  if (Math.abs(rightDenominator) > EPSILON) {
    value -= degree / rightDenominator
      * basisValue(index + 1, degree - 1, parameter, knots, terminalControlIndex, terminalParameter);
  }
  return value;
}

function openBasisRow(controlCount: number, degree: number, knots: readonly number[], parameter: number): number[] {
  return Array.from({ length: controlCount }, (_, index) => basisValue(index, degree, parameter, knots, controlCount - 1, 1));
}

function openEndpointDerivativeRow(controlCount: number, degree: number, knots: readonly number[], atEnd: boolean): number[] {
  const row = Array.from({ length: controlCount }, () => 0);
  if (!atEnd) {
    const denominator = knots[degree + 1]! - knots[1]!;
    if (Math.abs(denominator) <= EPSILON) throw new Error('Spline start derivative basis is singular.');
    const coefficient = degree / denominator;
    row[0] = -coefficient;
    row[1] = coefficient;
    return row;
  }

  const last = controlCount - 1;
  const denominator = knots[controlCount]! - knots[controlCount - 1]!;
  if (Math.abs(denominator) <= EPSILON) throw new Error('Spline end derivative basis is singular.');
  const coefficient = degree / denominator;
  row[last - 1] = -coefficient;
  row[last] = coefficient;
  return row;
}

function wrapUnit(parameter: number): number {
  if (parameter === 1) return 0;
  const wrapped = parameter % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function periodicBasisRow(uniqueControlCount: number, degree: number, knots: readonly number[], parameter: number): number[] {
  const row = Array.from({ length: uniqueControlCount }, () => 0);
  const extendedControlCount = uniqueControlCount + degree;
  const nativeParameter = degree + wrapUnit(parameter) * uniqueControlCount;
  for (let index = 0; index < extendedControlCount; index += 1) {
    row[index % uniqueControlCount] += basisValue(index, degree, nativeParameter, knots);
  }
  return row;
}

function periodicDerivativeRow(uniqueControlCount: number, degree: number, knots: readonly number[], parameter: number): number[] {
  const row = Array.from({ length: uniqueControlCount }, () => 0);
  const extendedControlCount = uniqueControlCount + degree;
  const nativeParameter = degree + wrapUnit(parameter) * uniqueControlCount;
  for (let index = 0; index < extendedControlCount; index += 1) {
    row[index % uniqueControlCount] += basisDerivative(index, degree, nativeParameter, knots) * uniqueControlCount;
  }
  return row;
}

function solveSquareSystem(matrix: readonly number[][], rhs: readonly number[]): number[] {
  const size = rhs.length;
  if (matrix.length !== size || matrix.some((row) => row.length !== size)) {
    throw new Error('Spline interpolation linear system must be square.');
  }
  const augmented = matrix.map((row, index) => [...row, rhs[index]!]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(augmented[pivot]![column]!) <= 1e-13) {
      throw new Error('Spline interpolation system is singular for the supplied fit geometry.');
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]![column]!;
    for (let index = column; index <= size; index += 1) augmented[column]![index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      if (Math.abs(factor) <= EPSILON) continue;
      for (let index = column; index <= size; index += 1) {
        augmented[row]![index] -= factor * augmented[column]![index]!;
      }
    }
  }
  return augmented.map((row) => row[size]!);
}

function minimumNormExactSolution(matrix: readonly number[][], rhs: readonly number[]): number[] {
  if (matrix.length !== rhs.length) throw new Error('Spline interpolation equation count does not match target count.');
  if (matrix.length === 0) return [];
  const columns = matrix[0]!.length;
  if (columns < matrix.length) throw new Error('Spline interpolation requires at least as many controls as equations.');
  if (matrix.some((row) => row.length !== columns)) throw new Error('Spline interpolation matrix rows must have equal length.');

  const gram = Array.from({ length: matrix.length }, (_, row) =>
    Array.from({ length: matrix.length }, (_, column) => {
      let sum = 0;
      for (let index = 0; index < columns; index += 1) sum += matrix[row]![index]! * matrix[column]![index]!;
      return sum;
    }),
  );
  const dual = solveSquareSystem(gram, rhs);
  return Array.from({ length: columns }, (_, column) => {
    let sum = 0;
    for (let row = 0; row < matrix.length; row += 1) sum += matrix[row]![column]! * dual[row]!;
    return sum;
  });
}

function solveControlPoints(rows: readonly number[][], targets: readonly SketchVector2[]): SketchVector2[] {
  if (rows.length !== targets.length) throw new Error('Spline interpolation rows and targets must align.');
  const xs = minimumNormExactSolution(rows, targets.map((target) => target.x));
  const ys = minimumNormExactSolution(rows, targets.map((target) => target.y));
  return xs.map((x, index) => ({ x, y: ys[index]! }));
}

function validateTangent(tangent: SketchVector2 | undefined, label: string): SketchVector2 | undefined {
  if (!tangent) return undefined;
  finite(tangent.x, `${label} x`);
  finite(tangent.y, `${label} y`);
  if (Math.hypot(tangent.x, tangent.y) <= EPSILON) throw new Error(`${label} must be non-zero.`);
  return { ...tangent };
}

export function buildInterpolatingSpline(sketch: CadSketch, splineId: string): InterpolatingSplineCurve {
  const spline = requireSpline(sketch, splineId);
  const points = fitPoints(sketch, spline);
  const fitParameters = chordParameters(points, spline.closed);
  const startTangent = validateTangent(spline.startTangent, `Spline '${spline.id}' start tangent`);
  const endTangent = validateTangent(spline.endTangent, `Spline '${spline.id}' end tangent`);

  if (spline.closed) {
    const controlCount = Math.max(points.length, spline.degree + 1);
    const knots = periodicUniformKnots(controlCount, spline.degree);
    const rows = fitParameters.map((parameter) => periodicBasisRow(controlCount, spline.degree, knots, parameter));
    const controls = solveControlPoints(rows, points.map((point) => ({ x: point.x, y: point.y })));
    return {
      degree: spline.degree,
      closed: true,
      controlPoints: controls,
      knots,
      fitParameters,
      parameterDomain: [0, 1],
      periodicControlCount: controlCount,
    };
  }

  const tangentEquationCount = Number(Boolean(startTangent)) + Number(Boolean(endTangent));
  const controlCount = Math.max(points.length + tangentEquationCount, spline.degree + 1);
  const knots = openUniformKnots(controlCount, spline.degree);
  const rows = fitParameters.map((parameter) => openBasisRow(controlCount, spline.degree, knots, parameter));
  const targets: SketchVector2[] = points.map((point) => ({ x: point.x, y: point.y }));
  if (startTangent) {
    rows.push(openEndpointDerivativeRow(controlCount, spline.degree, knots, false));
    targets.push(startTangent);
  }
  if (endTangent) {
    rows.push(openEndpointDerivativeRow(controlCount, spline.degree, knots, true));
    targets.push(endTangent);
  }
  const controls = solveControlPoints(rows, targets);
  return {
    degree: spline.degree,
    closed: false,
    controlPoints: controls,
    knots,
    fitParameters,
    parameterDomain: [0, 1],
  };
}

function validatedParameter(curve: InterpolatingSplineCurve, parameter: number): number {
  finite(parameter, 'Spline parameter');
  if (parameter < curve.parameterDomain[0] - EPSILON || parameter > curve.parameterDomain[1] + EPSILON) {
    throw new Error(`Spline parameter must be within [${curve.parameterDomain[0]}, ${curve.parameterDomain[1]}].`);
  }
  if (curve.closed) return wrapUnit(Math.max(0, Math.min(1, parameter)));
  return Math.max(0, Math.min(1, parameter));
}

export function evaluateSpline(curve: InterpolatingSplineCurve, parameter: number): SketchVector2 {
  const u = validatedParameter(curve, parameter);
  const row = curve.closed
    ? periodicBasisRow(curve.periodicControlCount ?? curve.controlPoints.length, curve.degree, curve.knots, u)
    : openBasisRow(curve.controlPoints.length, curve.degree, curve.knots, u);
  let x = 0;
  let y = 0;
  for (let index = 0; index < curve.controlPoints.length; index += 1) {
    x += row[index]! * curve.controlPoints[index]!.x;
    y += row[index]! * curve.controlPoints[index]!.y;
  }
  return { x, y };
}

export function evaluateSplineDerivative(curve: InterpolatingSplineCurve, parameter: number): SketchVector2 {
  const u = validatedParameter(curve, parameter);
  let row: number[];
  if (curve.closed) {
    row = periodicDerivativeRow(curve.periodicControlCount ?? curve.controlPoints.length, curve.degree, curve.knots, u);
  } else if (u === 0 || u === 1) {
    row = openEndpointDerivativeRow(curve.controlPoints.length, curve.degree, curve.knots, u === 1);
  } else {
    row = Array.from({ length: curve.controlPoints.length }, (_, index) =>
      basisDerivative(index, curve.degree, u, curve.knots, curve.controlPoints.length - 1, 1),
    );
  }
  let x = 0;
  let y = 0;
  for (let index = 0; index < curve.controlPoints.length; index += 1) {
    x += row[index]! * curve.controlPoints[index]!.x;
    y += row[index]! * curve.controlPoints[index]!.y;
  }
  return { x, y };
}
