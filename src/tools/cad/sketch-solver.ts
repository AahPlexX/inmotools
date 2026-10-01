import { buildInterpolatingSpline, evaluateSpline, evaluateSplineDerivative } from './sketch-spline';
import { numericalRank, solveDampedNormalEquations } from './sketch-linear-algebra';
import type {
  CadSketch,
  SketchArcEntity,
  SketchCircleEntity,
  SketchConstraint,
  SketchEllipseEntity,
  SketchEllipticalArcEntity,
  SketchLineEntity,
  SketchPointEntity,
  SketchSolveOptions,
  SketchSolveResult,
  SketchSplineEntity,
} from './sketch-types';

interface PointIndex {
  point: SketchPointEntity;
  offset: number;
}

interface CircleIndex {
  circle: SketchCircleEntity;
  offset: number;
}

interface ContactParameterIndex {
  offset: number;
  initial: number;
}

interface SketchIndex {
  points: Map<string, PointIndex>;
  lines: Map<string, SketchLineEntity>;
  circles: Map<string, CircleIndex>;
  arcs: Map<string, SketchArcEntity>;
  ellipses: Map<string, SketchEllipseEntity>;
  ellipticalArcs: Map<string, SketchEllipticalArcEntity>;
  splines: Map<string, SketchSplineEntity>;
  contactParameters: Map<string, ContactParameterIndex>;
  variableCount: number;
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
const TAU = Math.PI * 2;

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

function arcIndex(sketch: CadSketch): Map<string, SketchArcEntity> {
  const result = new Map<string, SketchArcEntity>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'arc') continue;
    if (result.has(entity.id)) throw new Error(`Duplicate sketch arc '${entity.id}'.`);
    result.set(entity.id, entity);
  }
  return result;
}

function ellipseIndex(sketch: CadSketch): Map<string, SketchEllipseEntity> {
  const result = new Map<string, SketchEllipseEntity>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'ellipse') continue;
    if (result.has(entity.id)) throw new Error(`Duplicate sketch ellipse '${entity.id}'.`);
    result.set(entity.id, entity);
  }
  return result;
}

function ellipticalArcIndex(sketch: CadSketch): Map<string, SketchEllipticalArcEntity> {
  const result = new Map<string, SketchEllipticalArcEntity>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'elliptical-arc') continue;
    if (result.has(entity.id)) throw new Error(`Duplicate sketch elliptical arc '${entity.id}'.`);
    result.set(entity.id, entity);
  }
  return result;
}

function splineIndex(sketch: CadSketch): Map<string, SketchSplineEntity> {
  const result = new Map<string, SketchSplineEntity>();
  for (const entity of sketch.entities) {
    if (entity.type !== 'spline') continue;
    if (result.has(entity.id)) throw new Error(`Duplicate sketch spline '${entity.id}'.`);
    result.set(entity.id, entity);
  }
  return result;
}

function contactParameterIndex(
  sketch: CadSketch,
  splines: Map<string, SketchSplineEntity>,
  startOffset: number,
): Map<string, ContactParameterIndex> {
  const result = new Map<string, ContactParameterIndex>();
  let offset = startOffset;
  for (const constraint of sketch.constraints) {
    if (!constraint.enabled) continue;
    if (constraint.type !== 'point-on-curve' && constraint.type !== 'tangent-curve') continue;
    if (!splines.has(constraint.curveId)) continue;
    if (result.has(constraint.id)) throw new Error(`Duplicate spline contact constraint '${constraint.id}'.`);
    const initial = finite(constraint.parameter ?? 0.5, `Spline contact parameter '${constraint.id}'`);
    if (initial < 0 || initial > 1) {
      throw new Error(`Spline contact parameter '${constraint.id}' must be between 0 and 1.`);
    }
    result.set(constraint.id, { offset, initial });
    offset += 1;
  }
  return result;
}

function buildIndex(sketch: CadSketch): SketchIndex {
  const points = pointIndex(sketch);
  const lines = lineIndex(sketch);
  const circles = circleIndex(sketch, points.size * 2);
  const arcs = arcIndex(sketch);
  const ellipses = ellipseIndex(sketch);
  const ellipticalArcs = ellipticalArcIndex(sketch);
  const splines = splineIndex(sketch);
  const contactParameters = contactParameterIndex(sketch, splines, points.size * 2 + circles.size);
  return {
    points,
    lines,
    circles,
    arcs,
    ellipses,
    ellipticalArcs,
    splines,
    contactParameters,
    variableCount: points.size * 2 + circles.size + contactParameters.size,
  };
}

function initialValues(index: SketchIndex): number[] {
  const values = Array.from({ length: index.variableCount }, () => 0);
  for (const { point, offset } of index.points.values()) {
    values[offset] = finite(point.x, `Point '${point.id}' x`);
    values[offset + 1] = finite(point.y, `Point '${point.id}' y`);
  }
  for (const { circle, offset } of index.circles.values()) {
    const radius = finite(circle.radius, `Circle '${circle.id}' radius`);
    if (radius <= 0) throw new Error(`Circle '${circle.id}' radius must be positive.`);
    values[offset] = radius;
  }
  for (const { offset, initial } of index.contactParameters.values()) values[offset] = initial;
  return values;
}

function coordinates(values: readonly number[], index: SketchIndex, pointId: string): [number, number] {
  const entry = index.points.get(pointId);
  if (!entry) throw new Error(`Constraint references missing point '${pointId}'.`);
  return [values[entry.offset]!, values[entry.offset + 1]!];
}

function linePoints(values: readonly number[], index: SketchIndex, lineId: string): [[number, number], [number, number]] {
  const line = index.lines.get(lineId);
  if (!line) throw new Error(`Constraint references missing line '${lineId}'.`);
  return [coordinates(values, index, line.startPointId), coordinates(values, index, line.endPointId)];
}

function circleRadius(values: readonly number[], index: SketchIndex, circleId: string): number {
  const entry = index.circles.get(circleId);
  if (!entry) throw new Error(`Constraint references missing circle '${circleId}'.`);
  return values[entry.offset]!;
}

function circleCenter(values: readonly number[], index: SketchIndex, circleId: string): [number, number] {
  const entry = index.circles.get(circleId);
  if (!entry) throw new Error(`Constraint references missing circle '${circleId}'.`);
  return coordinates(values, index, entry.circle.centerPointId);
}

function curveCenter(values: readonly number[], index: SketchIndex, curveId: string): [number, number] {
  if (index.circles.has(curveId)) return circleCenter(values, index, curveId);
  const arc = index.arcs.get(curveId);
  if (arc) return coordinates(values, index, arc.centerPointId);
  const ellipse = index.ellipses.get(curveId);
  if (ellipse) return coordinates(values, index, ellipse.centerPointId);
  const ellipticalArc = index.ellipticalArcs.get(curveId);
  if (ellipticalArc) return coordinates(values, index, ellipticalArc.centerPointId);
  throw new Error(`Constraint references missing centered curve '${curveId}'.`);
}

function curveRadius(values: readonly number[], index: SketchIndex, curveId: string): number {
  if (index.circles.has(curveId)) return circleRadius(values, index, curveId);
  const arc = index.arcs.get(curveId);
  if (arc) {
    const [cx, cy] = coordinates(values, index, arc.centerPointId);
    const [sx, sy] = coordinates(values, index, arc.startPointId);
    const radius = Math.hypot(sx - cx, sy - cy);
    if (radius <= MIN_GEOMETRY_SCALE) throw new Error(`Arc '${arc.id}' start point must differ from its center.`);
    return radius;
  }
  throw new Error(`Constraint references missing circle or arc '${curveId}'.`);
}

function normalizeAngle(angle: number): number {
  const normalized = angle % TAU;
  return normalized < 0 ? normalized + TAU : normalized;
}

function directedSpanViolation(angle: number, startAngle: number, endAngle: number, clockwise: boolean): number {
  const total = clockwise ? normalizeAngle(startAngle - endAngle) : normalizeAngle(endAngle - startAngle);
  const position = clockwise ? normalizeAngle(startAngle - angle) : normalizeAngle(angle - startAngle);
  return position <= total ? 0 : position - total;
}

function pointOnCircularArcResidual(
  pointId: string,
  arc: SketchArcEntity,
  values: readonly number[],
  index: SketchIndex,
): number[] {
  const [px, py] = coordinates(values, index, pointId);
  const [cx, cy] = coordinates(values, index, arc.centerPointId);
  const [sx, sy] = coordinates(values, index, arc.startPointId);
  const [ex, ey] = coordinates(values, index, arc.endPointId);
  const radius = Math.hypot(sx - cx, sy - cy);
  if (radius <= MIN_GEOMETRY_SCALE) throw new Error(`Arc '${arc.id}' start point must differ from its center.`);
  const radial = Math.hypot(px - cx, py - cy) - radius;
  const angle = Math.atan2(py - cy, px - cx);
  const startAngle = Math.atan2(sy - cy, sx - cx);
  const endAngle = Math.atan2(ey - cy, ex - cx);
  return [radial, radius * directedSpanViolation(angle, startAngle, endAngle, arc.clockwise)];
}

function ellipseFrame(
  curve: SketchEllipseEntity | SketchEllipticalArcEntity,
  values: readonly number[],
  index: SketchIndex,
): { cx: number; cy: number; majorRadius: number; minorRadius: number; ux: number; uy: number; vx: number; vy: number } {
  const [cx, cy] = coordinates(values, index, curve.centerPointId);
  const [mx, my] = coordinates(values, index, curve.majorAxisPointId);
  const dx = mx - cx;
  const dy = my - cy;
  const majorRadius = Math.hypot(dx, dy);
  const minorRadius = finite(curve.minorRadius, `Ellipse '${curve.id}' minor radius`);
  if (majorRadius <= MIN_GEOMETRY_SCALE) throw new Error(`Ellipse '${curve.id}' major axis must have non-zero length.`);
  if (minorRadius <= MIN_GEOMETRY_SCALE) throw new Error(`Ellipse '${curve.id}' minor radius must be positive.`);
  const ux = dx / majorRadius;
  const uy = dy / majorRadius;
  return { cx, cy, majorRadius, minorRadius, ux, uy, vx: -uy, vy: ux };
}

function ellipsePointState(
  pointId: string,
  frame: ReturnType<typeof ellipseFrame>,
  values: readonly number[],
  index: SketchIndex,
): { membership: number; parameter: number } {
  const [px, py] = coordinates(values, index, pointId);
  const rx = px - frame.cx;
  const ry = py - frame.cy;
  const localMajor = rx * frame.ux + ry * frame.uy;
  const localMinor = rx * frame.vx + ry * frame.vy;
  const normalizedMajor = localMajor / frame.majorRadius;
  const normalizedMinor = localMinor / frame.minorRadius;
  const scale = Math.min(frame.majorRadius, frame.minorRadius);
  return {
    membership: (Math.hypot(normalizedMajor, normalizedMinor) - 1) * scale,
    parameter: Math.atan2(normalizedMinor, normalizedMajor),
  };
}

function normalizedEllipseCoordinates(
  point: [number, number],
  frame: ReturnType<typeof ellipseFrame>,
): [number, number] {
  const rx = point[0] - frame.cx;
  const ry = point[1] - frame.cy;
  return [
    (rx * frame.ux + ry * frame.uy) / frame.majorRadius,
    (rx * frame.vx + ry * frame.vy) / frame.minorRadius,
  ];
}

function lineClosestPointToCenter(
  lineId: string,
  cx: number,
  cy: number,
  values: readonly number[],
  index: SketchIndex,
): { distance: number; angle: number } {
  const [[ax, ay], [bx, by]] = linePoints(values, index, lineId);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= MIN_GEOMETRY_SCALE * MIN_GEOMETRY_SCALE) {
    throw new Error(`Tangent-curve constraint requires line '${lineId}' to have non-zero length.`);
  }
  const parameter = ((cx - ax) * dx + (cy - ay) * dy) / lengthSquared;
  const qx = ax + parameter * dx;
  const qy = ay + parameter * dy;
  return { distance: Math.hypot(qx - cx, qy - cy), angle: Math.atan2(qy - cy, qx - cx) };
}

function ellipseLineTangencyState(
  lineId: string,
  frame: ReturnType<typeof ellipseFrame>,
  values: readonly number[],
  index: SketchIndex,
): { residual: number; contactParameter: number } {
  const [a, b] = linePoints(values, index, lineId);
  const [ax, ay] = normalizedEllipseCoordinates(a, frame);
  const [bx, by] = normalizedEllipseCoordinates(b, frame);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= MIN_GEOMETRY_SCALE * MIN_GEOMETRY_SCALE) {
    throw new Error(`Tangent-curve constraint requires line '${lineId}' to have non-zero length.`);
  }
  const parameter = -(ax * dx + ay * dy) / lengthSquared;
  const qx = ax + parameter * dx;
  const qy = ay + parameter * dy;
  const distance = Math.hypot(qx, qy);
  if (distance <= MIN_GEOMETRY_SCALE) {
    throw new Error(`Tangent-curve constraint line '${lineId}' passes through the ellipse center and has no unique tangent contact.`);
  }
  const scale = Math.min(frame.majorRadius, frame.minorRadius);
  return { residual: (distance - 1) * scale, contactParameter: Math.atan2(qy, qx) };
}

function splineParameterState(
  constraintId: string,
  values: readonly number[],
  index: SketchIndex,
): { parameter: number; boundsResiduals: [number, number] } {
  const entry = index.contactParameters.get(constraintId);
  if (!entry) throw new Error(`Spline contact constraint '${constraintId}' has no solver parameter.`);
  const raw = finite(values[entry.offset]!, `Spline contact parameter '${constraintId}'`);
  return {
    parameter: Math.max(0, Math.min(1, raw)),
    boundsResiduals: [Math.min(0, raw), Math.max(0, raw - 1)],
  };
}

function currentSplineCurve(splineId: string, values: readonly number[], index: SketchIndex) {
  const spline = index.splines.get(splineId);
  if (!spline) throw new Error(`Constraint references missing spline '${splineId}'.`);
  const fitPoints = spline.fitPointIds.map((pointId) => {
    const [x, y] = coordinates(values, index, pointId);
    return { id: pointId, type: 'point' as const, x, y, construction: false };
  });
  const transient: CadSketch = {
    id: `solver:${splineId}`,
    label: spline.id,
    plane: { kind: 'origin', plane: 'XY' },
    entities: [...fitPoints, { ...spline, fitPointIds: [...spline.fitPointIds] }],
    constraints: [],
  };
  return buildInterpolatingSpline(transient, splineId);
}

function splinePointOnCurveResidual(
  constraintId: string,
  pointId: string,
  splineId: string,
  values: readonly number[],
  index: SketchIndex,
): number[] {
  const state = splineParameterState(constraintId, values, index);
  const contact = evaluateSpline(currentSplineCurve(splineId, values, index), state.parameter);
  const [px, py] = coordinates(values, index, pointId);
  return [px - contact.x, py - contact.y, ...state.boundsResiduals];
}

function splineTangentCurveResidual(
  constraintId: string,
  lineId: string,
  splineId: string,
  values: readonly number[],
  index: SketchIndex,
): number[] {
  const state = splineParameterState(constraintId, values, index);
  const curve = currentSplineCurve(splineId, values, index);
  const contact = evaluateSpline(curve, state.parameter);
  const derivative = evaluateSplineDerivative(curve, state.parameter);
  const [[ax, ay], [bx, by]] = linePoints(values, index, lineId);
  const dx = bx - ax;
  const dy = by - ay;
  const lineLength = Math.hypot(dx, dy);
  const derivativeLength = Math.hypot(derivative.x, derivative.y);
  if (lineLength <= MIN_GEOMETRY_SCALE) {
    throw new Error(`Tangent-curve constraint '${constraintId}' requires a non-zero line length.`);
  }
  if (derivativeLength <= MIN_GEOMETRY_SCALE) {
    throw new Error(`Tangent-curve constraint '${constraintId}' requires a non-zero spline derivative at contact.`);
  }
  const contactOnLine = (dx * (contact.y - ay) - dy * (contact.x - ax)) / lineLength;
  const directionParallel = (dx * derivative.y - dy * derivative.x) / (lineLength * derivativeLength);
  return [contactOnLine, directionParallel, ...state.boundsResiduals];
}

function tangentCurveResidual(
  constraintId: string,
  lineId: string,
  curveId: string,
  values: readonly number[],
  index: SketchIndex,
): number[] {
  if (index.circles.has(curveId)) {
    const [cx, cy] = circleCenter(values, index, curveId);
    const state = lineClosestPointToCenter(lineId, cx, cy, values, index);
    return [state.distance - circleRadius(values, index, curveId)];
  }

  const arc = index.arcs.get(curveId);
  if (arc) {
    const [cx, cy] = coordinates(values, index, arc.centerPointId);
    const [sx, sy] = coordinates(values, index, arc.startPointId);
    const [ex, ey] = coordinates(values, index, arc.endPointId);
    const radius = Math.hypot(sx - cx, sy - cy);
    if (radius <= MIN_GEOMETRY_SCALE) throw new Error(`Arc '${arc.id}' start point must differ from its center.`);
    const state = lineClosestPointToCenter(lineId, cx, cy, values, index);
    const startAngle = Math.atan2(sy - cy, sx - cx);
    const endAngle = Math.atan2(ey - cy, ex - cx);
    return [
      state.distance - radius,
      radius * directedSpanViolation(state.angle, startAngle, endAngle, arc.clockwise),
    ];
  }

  const ellipse = index.ellipses.get(curveId);
  if (ellipse) {
    const state = ellipseLineTangencyState(lineId, ellipseFrame(ellipse, values, index), values, index);
    return [state.residual];
  }

  const ellipticalArc = index.ellipticalArcs.get(curveId);
  if (ellipticalArc) {
    const frame = ellipseFrame(ellipticalArc, values, index);
    const state = ellipseLineTangencyState(lineId, frame, values, index);
    const start = ellipsePointState(ellipticalArc.startPointId, frame, values, index);
    const end = ellipsePointState(ellipticalArc.endPointId, frame, values, index);
    const scale = Math.min(frame.majorRadius, frame.minorRadius);
    return [
      state.residual,
      scale * directedSpanViolation(state.contactParameter, start.parameter, end.parameter, ellipticalArc.clockwise),
    ];
  }

  if (index.splines.has(curveId)) return splineTangentCurveResidual(constraintId, lineId, curveId, values, index);
  throw new Error(`Tangent-curve constraint '${constraintId}' references missing supported curve '${curveId}'.`);
}

function pointOnCurveResidual(
  constraintId: string,
  pointId: string,
  curveId: string,
  values: readonly number[],
  index: SketchIndex,
): number[] {
  if (index.circles.has(curveId)) {
    const [px, py] = coordinates(values, index, pointId);
    const [cx, cy] = circleCenter(values, index, curveId);
    return [Math.hypot(px - cx, py - cy) - circleRadius(values, index, curveId)];
  }

  const arc = index.arcs.get(curveId);
  if (arc) return pointOnCircularArcResidual(pointId, arc, values, index);

  const ellipse = index.ellipses.get(curveId);
  if (ellipse) {
    const frame = ellipseFrame(ellipse, values, index);
    return [ellipsePointState(pointId, frame, values, index).membership];
  }

  const ellipticalArc = index.ellipticalArcs.get(curveId);
  if (ellipticalArc) {
    const frame = ellipseFrame(ellipticalArc, values, index);
    const point = ellipsePointState(pointId, frame, values, index);
    const start = ellipsePointState(ellipticalArc.startPointId, frame, values, index);
    const end = ellipsePointState(ellipticalArc.endPointId, frame, values, index);
    const scale = Math.min(frame.majorRadius, frame.minorRadius);
    return [
      point.membership,
      scale * directedSpanViolation(point.parameter, start.parameter, end.parameter, ellipticalArc.clockwise),
    ];
  }

  if (index.splines.has(curveId)) return splinePointOnCurveResidual(constraintId, pointId, curveId, values, index);
  throw new Error(`Point-on-curve constraint '${constraintId}' references missing supported curve '${curveId}'.`);
}

function arcIntrinsicResiduals(values: readonly number[], index: SketchIndex): number[] {
  const residuals: number[] = [];
  for (const arc of index.arcs.values()) {
    const [cx, cy] = coordinates(values, index, arc.centerPointId);
    const [sx, sy] = coordinates(values, index, arc.startPointId);
    const [ex, ey] = coordinates(values, index, arc.endPointId);
    const startRadius = Math.hypot(sx - cx, sy - cy);
    const endRadius = Math.hypot(ex - cx, ey - cy);
    residuals.push(endRadius - startRadius);
  }
  return residuals;
}

function fixedPointResidual(values: readonly number[], index: SketchIndex, pointId: string, entityId: string): [number, number] {
  const entry = index.points.get(pointId);
  if (!entry) throw new Error(`Fixed entity '${entityId}' references missing point '${pointId}'.`);
  return [values[entry.offset]! - entry.point.x, values[entry.offset + 1]! - entry.point.y];
}

function fixedEntityResidual(entityId: string, values: readonly number[], index: SketchIndex): number[] {
  const point = index.points.get(entityId);
  if (point) {
    return [values[point.offset]! - point.point.x, values[point.offset + 1]! - point.point.y];
  }

  const line = index.lines.get(entityId);
  if (line) {
    return [
      ...fixedPointResidual(values, index, line.startPointId, entityId),
      ...fixedPointResidual(values, index, line.endPointId, entityId),
    ];
  }

  const circle = index.circles.get(entityId);
  if (circle) {
    return [...fixedPointResidual(values, index, circle.circle.centerPointId, entityId), values[circle.offset]! - circle.circle.radius];
  }

  const arc = index.arcs.get(entityId);
  if (arc) {
    return [
      ...fixedPointResidual(values, index, arc.centerPointId, entityId),
      ...fixedPointResidual(values, index, arc.startPointId, entityId),
      ...fixedPointResidual(values, index, arc.endPointId, entityId),
    ];
  }

  const ellipse = index.ellipses.get(entityId);
  if (ellipse) {
    return [
      ...fixedPointResidual(values, index, ellipse.centerPointId, entityId),
      ...fixedPointResidual(values, index, ellipse.majorAxisPointId, entityId),
    ];
  }

  const ellipticalArc = index.ellipticalArcs.get(entityId);
  if (ellipticalArc) {
    return [
      ...fixedPointResidual(values, index, ellipticalArc.centerPointId, entityId),
      ...fixedPointResidual(values, index, ellipticalArc.majorAxisPointId, entityId),
      ...fixedPointResidual(values, index, ellipticalArc.startPointId, entityId),
      ...fixedPointResidual(values, index, ellipticalArc.endPointId, entityId),
    ];
  }

  const spline = index.splines.get(entityId);
  if (spline) {
    return spline.fitPointIds.flatMap((fitPointId) => fixedPointResidual(values, index, fitPointId, entityId));
  }

  throw new Error(`Fixed-entity constraint references missing entity '${entityId}'.`);
}

function residualForConstraint(constraint: SketchConstraint, values: readonly number[], index: SketchIndex): number[] {
  switch (constraint.type) {
    case 'fixed-point': {
      const [x, y] = coordinates(values, index, constraint.pointId);
      return [x - constraint.x, y - constraint.y];
    }
    case 'fixed-entity':
      return fixedEntityResidual(constraint.entityId, values, index);
    case 'horizontal': {
      const [[, ay], [, by]] = linePoints(values, index, constraint.lineId);
      return [by - ay];
    }
    case 'vertical': {
      const [[ax], [bx]] = linePoints(values, index, constraint.lineId);
      return [bx - ax];
    }
    case 'distance': {
      const [a, b] = [coordinates(values, index, constraint.pointAId), coordinates(values, index, constraint.pointBId)];
      return [Math.hypot(b[0] - a[0], b[1] - a[1]) - constraint.value];
    }
    case 'horizontal-distance': {
      const [a, b] = [coordinates(values, index, constraint.pointAId), coordinates(values, index, constraint.pointBId)];
      const target = finite(constraint.value, `Horizontal-distance constraint '${constraint.id}' value`);
      return [(b[0] - a[0]) - target];
    }
    case 'vertical-distance': {
      const [a, b] = [coordinates(values, index, constraint.pointAId), coordinates(values, index, constraint.pointBId)];
      const target = finite(constraint.value, `Vertical-distance constraint '${constraint.id}' value`);
      return [(b[1] - a[1]) - target];
    }
    case 'length': {
      const [[ax, ay], [bx, by]] = linePoints(values, index, constraint.lineId);
      const target = finite(constraint.value, `Length constraint '${constraint.id}' value`);
      if (target <= 0) throw new Error(`Length constraint '${constraint.id}' value must be positive.`);
      return [Math.hypot(bx - ax, by - ay) - target];
    }
    case 'coincident': {
      const [a, b] = [coordinates(values, index, constraint.pointAId), coordinates(values, index, constraint.pointBId)];
      return [b[0] - a[0], b[1] - a[1]];
    }
    case 'radius': {
      const target = finite(constraint.value, `Radius constraint '${constraint.id}' value`);
      if (target <= 0) throw new Error(`Radius constraint '${constraint.id}' value must be positive.`);
      return [curveRadius(values, index, constraint.circleId) - target];
    }
    case 'diameter': {
      const target = finite(constraint.value, `Diameter constraint '${constraint.id}' value`);
      if (target <= 0) throw new Error(`Diameter constraint '${constraint.id}' value must be positive.`);
      return [2 * curveRadius(values, index, constraint.circleId) - target];
    }
    case 'angle': {
      const target = finite(constraint.value, `Angle constraint '${constraint.id}' value`);
      if (target < 0 || target > Math.PI) throw new Error(`Angle constraint '${constraint.id}' value must be between 0 and pi radians.`);
      const [a0, a1] = linePoints(values, index, constraint.lineAId);
      const [b0, b1] = linePoints(values, index, constraint.lineBId);
      const adx = a1[0] - a0[0];
      const ady = a1[1] - a0[1];
      const bdx = b1[0] - b0[0];
      const bdy = b1[1] - b0[1];
      const scale = Math.hypot(adx, ady) * Math.hypot(bdx, bdy);
      if (scale <= MIN_GEOMETRY_SCALE) throw new Error(`Angle constraint '${constraint.id}' requires non-zero line lengths.`);
      return [(adx * bdx + ady * bdy) / scale - Math.cos(target)];
    }
    case 'perpendicular': {
      const [a0, a1] = linePoints(values, index, constraint.lineAId);
      const [b0, b1] = linePoints(values, index, constraint.lineBId);
      const adx = a1[0] - a0[0];
      const ady = a1[1] - a0[1];
      const bdx = b1[0] - b0[0];
      const bdy = b1[1] - b0[1];
      const scale = Math.hypot(adx, ady) * Math.hypot(bdx, bdy);
      if (scale <= MIN_GEOMETRY_SCALE) throw new Error(`Perpendicular constraint '${constraint.id}' requires non-zero line lengths.`);
      return [(adx * bdx + ady * bdy) / scale];
    }
    case 'parallel': {
      const [a0, a1] = linePoints(values, index, constraint.lineAId);
      const [b0, b1] = linePoints(values, index, constraint.lineBId);
      const adx = a1[0] - a0[0];
      const ady = a1[1] - a0[1];
      const bdx = b1[0] - b0[0];
      const bdy = b1[1] - b0[1];
      const scale = Math.hypot(adx, ady) * Math.hypot(bdx, bdy);
      if (scale <= MIN_GEOMETRY_SCALE) throw new Error(`Parallel constraint '${constraint.id}' requires non-zero line lengths.`);
      return [(adx * bdy - ady * bdx) / scale];
    }
    case 'tangent': {
      const [[ax, ay], [bx, by]] = linePoints(values, index, constraint.lineId);
      const [cx, cy] = circleCenter(values, index, constraint.circleId);
      const radius = circleRadius(values, index, constraint.circleId);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length <= MIN_GEOMETRY_SCALE) throw new Error(`Tangent constraint '${constraint.id}' requires a non-zero line length.`);
      const distance = Math.abs(dx * (cy - ay) - dy * (cx - ax)) / length;
      return [distance - radius];
    }
    case 'tangent-curve':
      return tangentCurveResidual(constraint.id, constraint.lineId, constraint.curveId, values, index);
    case 'concentric': {
      const [ax, ay] = curveCenter(values, index, constraint.circleAId);
      const [bx, by] = curveCenter(values, index, constraint.circleBId);
      return [bx - ax, by - ay];
    }
    case 'equal-length': {
      const [a0, a1] = linePoints(values, index, constraint.lineAId);
      const [b0, b1] = linePoints(values, index, constraint.lineBId);
      const aLength = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      const bLength = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
      return [bLength - aLength];
    }
    case 'equal-radius':
      return [curveRadius(values, index, constraint.circleBId) - curveRadius(values, index, constraint.circleAId)];
    case 'midpoint': {
      const [px, py] = coordinates(values, index, constraint.pointId);
      const [[ax, ay], [bx, by]] = linePoints(values, index, constraint.lineId);
      return [px - (ax + bx) / 2, py - (ay + by) / 2];
    }
    case 'point-on-line': {
      const [px, py] = coordinates(values, index, constraint.pointId);
      const [[ax, ay], [bx, by]] = linePoints(values, index, constraint.lineId);
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length <= MIN_GEOMETRY_SCALE) throw new Error(`Point-on-line constraint '${constraint.id}' requires a non-zero line length.`);
      return [(dx * (py - ay) - dy * (px - ax)) / length];
    }
    case 'point-on-circle': {
      const [px, py] = coordinates(values, index, constraint.pointId);
      const [cx, cy] = circleCenter(values, index, constraint.circleId);
      const radius = circleRadius(values, index, constraint.circleId);
      return [Math.hypot(px - cx, py - cy) - radius];
    }
    case 'point-on-curve':
      return pointOnCurveResidual(constraint.id, constraint.pointId, constraint.curveId, values, index);
    case 'symmetric-points': {
      const [pointA, pointB] = [coordinates(values, index, constraint.pointAId), coordinates(values, index, constraint.pointBId)];
      const [axisStart, axisEnd] = linePoints(values, index, constraint.axisLineId);
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

function residualVector(constraints: readonly SketchConstraint[], values: readonly number[], index: SketchIndex): number[] {
  return [
    ...constraints.flatMap((constraint) => residualForConstraint(constraint, values, index)),
    ...arcIntrinsicResiduals(values, index),
  ];
}

function norm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function numericJacobian(constraints: readonly SketchConstraint[], values: readonly number[], index: SketchIndex): number[][] {
  const base = residualVector(constraints, values, index);
  const jacobian = Array.from({ length: base.length }, () => Array.from({ length: values.length }, () => 0));
  for (let column = 0; column < values.length; column += 1) {
    const step = Math.max(1e-7, Math.abs(values[column]!) * 1e-7);
    const plus = [...values];
    const minus = [...values];
    plus[column] = plus[column]! + step;
    minus[column] = minus[column]! - step;
    const plusResidual = residualVector(constraints, plus, index);
    const minusResidual = residualVector(constraints, minus, index);
    for (let row = 0; row < base.length; row += 1) {
      jacobian[row]![column] = (plusResidual[row]! - minusResidual[row]!) / (2 * step);
    }
  }
  return jacobian;
}

function solveCore(
  constraints: readonly SketchConstraint[],
  startingValues: readonly number[],
  index: SketchIndex,
  tolerance: number,
  maxIterations: number,
): SolveCoreResult {
  let values = [...startingValues];
  let damping = 1e-6;
  let residuals = residualVector(constraints, values, index);
  let error = norm(residuals);
  if (error <= tolerance || residuals.length === 0) return { values, converged: true, residual: error, iterations: 0 };

  let iterations = 0;
  for (; iterations < maxIterations; iterations += 1) {
    const jacobian = numericJacobian(constraints, values, index);
    let accepted = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const delta = solveDampedNormalEquations(jacobian, residuals, damping);
      if (!delta) {
        damping *= 10;
        continue;
      }
      const trial = values.map((value, column) => value + delta[column]!);
      const trialResiduals = residualVector(constraints, trial, index);
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

function sketchWithValues(sketch: CadSketch, values: readonly number[], index: SketchIndex): CadSketch {
  return {
    ...sketch,
    entities: sketch.entities.map((entity) => {
      if (entity.type === 'point') {
        const entry = index.points.get(entity.id);
        return entry ? { ...entity, x: values[entry.offset]!, y: values[entry.offset + 1]! } : { ...entity };
      }
      if (entity.type === 'circle') {
        const entry = index.circles.get(entity.id);
        return entry ? { ...entity, radius: values[entry.offset]! } : { ...entity };
      }
      return { ...entity };
    }),
    constraints: sketch.constraints.map((constraint) => {
      const entry = index.contactParameters.get(constraint.id);
      if (entry && (constraint.type === 'point-on-curve' || constraint.type === 'tangent-curve')) {
        return { ...constraint, parameter: Math.max(0, Math.min(1, values[entry.offset]!)) };
      }
      return { ...constraint };
    }),
  };
}

function conflictIds(
  constraints: readonly SketchConstraint[],
  values: readonly number[],
  index: SketchIndex,
  tolerance: number,
  maxIterations: number,
): string[] {
  const conflicts: string[] = [];
  for (const candidate of constraints) {
    const reduced = constraints.filter((constraint) => constraint.id !== candidate.id);
    const result = solveCore(reduced, values, index, tolerance, maxIterations);
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

  const index = buildIndex(sketch);
  const constraints = activeConstraints(sketch);
  const initial = initialValues(index);
  let core = solveCore(constraints, initial, index, tolerance, maxIterations);

  const hardJacobian = numericJacobian(constraints, core.values, index);
  const degreesOfFreedom = Math.max(0, core.values.length - numericalRank(hardJacobian));

  if (core.converged && degreesOfFreedom > 0 && options.dragTarget) {
    const target = index.points.get(options.dragTarget.pointId);
    if (!target) throw new Error(`Drag target references missing point '${options.dragTarget.pointId}'.`);
    const seeded = [...core.values];
    seeded[target.offset] = finite(options.dragTarget.x, 'Drag target x');
    seeded[target.offset + 1] = finite(options.dragTarget.y, 'Drag target y');
    const dragged = solveCore(constraints, seeded, index, tolerance, maxIterations);
    if (dragged.converged) core = dragged;
  }

  if (!core.converged) {
    return {
      sketch: sketchWithValues(sketch, core.values, index),
      converged: false,
      constraintState: 'over',
      degreesOfFreedom,
      residual: core.residual,
      conflicts: conflictIds(constraints, initial, index, tolerance, maxIterations),
      iterations: core.iterations,
    };
  }

  return {
    sketch: sketchWithValues(sketch, core.values, index),
    converged: true,
    constraintState: degreesOfFreedom === 0 ? 'fully' : 'under',
    degreesOfFreedom,
    residual: core.residual,
    conflicts: [],
    iterations: core.iterations,
  };
}
