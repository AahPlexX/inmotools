import type { CadFeature, CadProject, CadTopologyRefRecord } from './cad-types';
import type { CadExactKernel, CadHelixDefinition, CadKernelShape, CadKernelVector3 } from './kernel-contract';
import {
  buildSketchPath3d,
  buildSketchProfile3d,
  negate,
  perpendicularInPlane,
  resolveAngleDatumPlaneFrame,
  resolveDatumPlaneFrame,
  resolveMidPlaneDatumPlaneFrame,
  resolveThreePointDatumPlaneFrame,
  resolveTwoPlaneDatumAxis,
  resolveTwoPointDatumAxis,
  resolveSketchAxis3d,
  resolveSketchPlane3d,
  type CadDatumPlaneFrames,
  type CadSketchAxis3d,
  type CadSketchPlane3d,
  type CadSketchProfile3d,
  type CadSketchWire3d,
  type PlaneFrame,
} from './sketch-profile';
import {
  resolveTopologyRef,
  type TopologyCandidate,
  type TopologyKind,
} from './topology-ref';

export interface CadFeatureKernel extends CadExactKernel {
  profileWire(definition: CadSketchWire3d): CadKernelShape;
  profileFace(profile: CadSketchProfile3d): CadKernelShape;
  helixWire(definition: CadHelixDefinition): CadKernelShape;
  topologyCandidates(shape: CadKernelShape, producerFeatureId: string, kind: TopologyKind): TopologyCandidate[];
  release(shape: CadKernelShape): void;
}

export interface CadEvaluatedBody {
  bodyId: string;
  sourceFeatureId: string;
  shape: CadKernelShape;
}

export interface CadFeatureEvaluationResult {
  bodies: CadEvaluatedBody[];
  warnings: string[];
}

export class CadFeatureEvaluationError extends Error {
  readonly featureId: string;

  constructor(featureId: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CadFeatureEvaluationError';
    this.featureId = featureId;
  }
}

interface LoftSectionSpec {
  sketchId: string;
  profileEntityIds: string[];
}

function parameterNumber(feature: CadFeature, key: string, options: { allowZero?: boolean } = {}): number {
  const value = feature.parameters[key];
  const allowZero = options.allowZero === true;
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    const qualifier = allowZero ? 'a finite non-negative number' : 'a finite positive number';
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be ${qualifier}.`);
  }
  return value;
}

function parameterNonZeroNumber(feature: CadFeature, key: string): number {
  const value = feature.parameters[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be a finite non-zero number.`);
  }
  return value;
}

function parameterFiniteNumber(feature: CadFeature, key: string): number {
  const value = feature.parameters[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be a finite number.`);
  }
  return value;
}

function parameterPositiveInteger(feature: CadFeature, key: string): number {
  const value = feature.parameters[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be a positive integer.`);
  }
  return value;
}

function parameterString(feature: CadFeature, key: string): string {
  const value = feature.parameters[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be a non-empty string.`);
  }
  return value;
}

function parameterOriginPlane(feature: CadFeature, key: string): 'XY' | 'XZ' | 'YZ' {
  const value = parameterString(feature, key);
  if (value !== 'XY' && value !== 'XZ' && value !== 'YZ') {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be one of 'XY', 'XZ', or 'YZ'.`);
  }
  return value;
}

function parameterPlaneReference(
  feature: CadFeature,
  key: string,
  frames: ReadonlyMap<string, PlaneFrame>,
): PlaneFrame {
  const value = parameterString(feature, key);
  if (value === 'XY' || value === 'XZ' || value === 'YZ') return resolveDatumPlaneFrame(value, 0);
  const frame = frames.get(value);
  if (!frame) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} references unresolved plane '${value}' in parameter '${key}'.`);
  }
  return frame;
}

type CadDatumAxes = ReadonlyMap<string, CadSketchAxis3d>;

interface CadDatumGeometry {
  planes: CadDatumPlaneFrames;
  axes: CadDatumAxes;
}

function resolveDatumAxisDefinition(
  feature: CadFeature,
  datumPlanes: CadDatumPlaneFrames,
): CadSketchAxis3d {
  const kind = feature.parameters.kind;
  if (kind === 'two-point') {
    return resolveTwoPointDatumAxis(
      parameterVector3(feature, 'point1'),
      parameterVector3(feature, 'point2'),
    );
  }
  if (kind === 'two-plane') {
    return resolveTwoPlaneDatumAxis(
      parameterPlaneReference(feature, 'plane1', datumPlanes),
      parameterPlaneReference(feature, 'plane2', datumPlanes),
    );
  }
  throw new CadFeatureEvaluationError(
    feature.id,
    `${feature.label} datum axis kind '${String(kind)}' is not supported; use 'two-point' or 'two-plane'.`,
  );
}

/**
 * Resolves datum planes and axes in feature-history order. References therefore
 * target only origin geometry or earlier resolved datum features; forward
 * references fail explicitly instead of being guessed.
 */
function resolveDatumGeometry(project: CadProject): CadDatumGeometry {
  const planes = new Map<string, PlaneFrame>();
  const axes = new Map<string, CadSketchAxis3d>();

  for (const feature of project.features) {
    if (feature.suppressed) continue;
    try {
      if (feature.type === 'datum-axis') {
        axes.set(feature.id, resolveDatumAxisDefinition(feature, planes));
        continue;
      }
      if (feature.type !== 'datum-plane') continue;

      const kind = feature.parameters.kind ?? 'offset';
      if (kind === 'offset') {
        const basePlane = parameterOriginPlane(feature, 'basePlane');
        planes.set(feature.id, resolveDatumPlaneFrame(
          basePlane,
          parameterNumber(feature, 'distance', { allowZero: true }),
        ));
      } else if (kind === 'three-point') {
        planes.set(feature.id, resolveThreePointDatumPlaneFrame(
          parameterVector3(feature, 'point1'),
          parameterVector3(feature, 'point2'),
          parameterVector3(feature, 'point3'),
        ));
      } else if (kind === 'mid-plane') {
        const flipAlignment = feature.parameters.flipAlignment;
        if (flipAlignment !== undefined && typeof flipAlignment !== 'boolean') {
          throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'flipAlignment' must be a boolean when provided.`);
        }
        planes.set(feature.id, resolveMidPlaneDatumPlaneFrame(
          parameterPlaneReference(feature, 'plane1', planes),
          parameterPlaneReference(feature, 'plane2', planes),
          flipAlignment === true,
        ));
      } else if (kind === 'angle') {
        const axisFeatureId = parameterString(feature, 'axisFeatureId');
        const axis = axes.get(axisFeatureId);
        if (!axis) {
          throw new CadFeatureEvaluationError(feature.id, `${feature.label} references unresolved datum axis '${axisFeatureId}'.`);
        }
        planes.set(feature.id, resolveAngleDatumPlaneFrame(
          parameterPlaneReference(feature, 'basePlane', planes),
          axis,
          parameterFiniteNumber(feature, 'angle'),
        ));
      } else {
        throw new CadFeatureEvaluationError(
          feature.id,
          `${feature.label} datum plane kind '${String(kind)}' is not supported; only 'offset', 'three-point', 'mid-plane', and 'angle' are implemented.`,
        );
      }
    } catch (error) {
      if (error instanceof CadFeatureEvaluationError) throw error;
      throw new CadFeatureEvaluationError(
        feature.id,
        `${feature.label}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  return { planes, axes };
}

function parameterDatumAxis(feature: CadFeature, datumAxes: CadDatumAxes): CadSketchAxis3d | null {
  const value = feature.parameters.axisFeatureId;
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'axisFeatureId' must be a non-empty string when provided.`);
  }
  const axis = datumAxes.get(value);
  if (!axis) throw new CadFeatureEvaluationError(feature.id, `${feature.label} references unknown datum axis '${value}'.`);
  return axis;
}

function parameterStringArray(feature: CadFeature, key: string): string[] {
  const value = feature.parameters[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be a non-empty array of ids.`);
  }
  return value;
}

/**
 * A sweep's path may come from an inline helix definition instead of a
 * sketch, for springs and thread-like forms. Returns undefined when the
 * feature has no 'helix' parameter at all, so the caller can fall back to
 * the sketch-path convention rather than treating "no helix" as an error.
 */
function parameterHelixDefinition(feature: CadFeature): CadHelixDefinition | undefined {
  const value = feature.parameters.helix;
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'helix' must be an object when provided.`);
  }
  const helix = value as Record<string, unknown>;
  const number = (key: string, positive: boolean): number => {
    const entry = helix[key];
    if (typeof entry !== 'number' || !Number.isFinite(entry) || (positive && entry <= 0)) {
      throw new CadFeatureEvaluationError(
        feature.id,
        `${feature.label} parameter 'helix.${key}' must be a finite${positive ? ' positive' : ''} number.`,
      );
    }
    return entry;
  };
  const vector = (key: string): CadKernelVector3 => {
    const entry = helix[key];
    if (!Array.isArray(entry) || entry.length !== 3 || entry.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
      throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'helix.${key}' must be an array of three finite numbers.`);
    }
    return entry as CadKernelVector3;
  };
  if (helix.leftHanded !== undefined && typeof helix.leftHanded !== 'boolean') {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'helix.leftHanded' must be a boolean when provided.`);
  }
  return {
    origin: vector('origin'),
    axis: vector('axis'),
    pitch: number('pitch', true),
    height: number('height', true),
    radius: number('radius', true),
    leftHanded: helix.leftHanded as boolean | undefined,
  };
}

function parameterVector3(feature: CadFeature, key: string): CadKernelVector3 {
  const value = feature.parameters[key];
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be an array of three finite numbers.`);
  }
  return value as CadKernelVector3;
}

function parameterLoftSections(feature: CadFeature): LoftSectionSpec[] {
  const value = feature.parameters.sections;
  if (!Array.isArray(value) || value.length < 2) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'sections' must contain at least two sketch sections.`);
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new CadFeatureEvaluationError(feature.id, `${feature.label} section ${index + 1} must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.sketchId !== 'string' || record.sketchId.length === 0) {
      throw new CadFeatureEvaluationError(feature.id, `${feature.label} section ${index + 1} requires a sketchId.`);
    }
    if (
      !Array.isArray(record.profileEntityIds)
      || record.profileEntityIds.length === 0
      || record.profileEntityIds.some((id) => typeof id !== 'string' || id.length === 0)
    ) {
      throw new CadFeatureEvaluationError(feature.id, `${feature.label} section ${index + 1} requires profileEntityIds.`);
    }
    return {
      sketchId: record.sketchId,
      profileEntityIds: record.profileEntityIds as string[],
    };
  });
}

function primitive(feature: CadFeature, kernel: CadFeatureKernel): CadKernelShape {
  const kind = feature.parameters.kind;
  switch (kind) {
    case 'box':
      return kernel.box(
        parameterNumber(feature, 'width'),
        parameterNumber(feature, 'depth'),
        parameterNumber(feature, 'height'),
      );
    case 'cylinder':
      return kernel.cylinder(parameterNumber(feature, 'radius'), parameterNumber(feature, 'height'));
    case 'sphere':
      return kernel.sphere(parameterNumber(feature, 'radius'));
    case 'cone': {
      const radius1 = parameterNumber(feature, 'radius1', { allowZero: true });
      const radius2 = parameterNumber(feature, 'radius2', { allowZero: true });
      if (radius1 === 0 && radius2 === 0) {
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} cone requires at least one positive radius.`);
      }
      return kernel.cone(radius1, radius2, parameterNumber(feature, 'height'));
    }
    case 'torus': {
      const majorRadius = parameterNumber(feature, 'majorRadius');
      const minorRadius = parameterNumber(feature, 'minorRadius');
      if (majorRadius <= minorRadius) {
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} majorRadius must be greater than minorRadius.`);
      }
      return kernel.torus(majorRadius, minorRadius);
    }
    case 'tube': {
      const outerRadius = parameterNumber(feature, 'outerRadius');
      const innerRadius = parameterNumber(feature, 'innerRadius');
      const height = parameterNumber(feature, 'height');
      if (outerRadius <= innerRadius) {
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} outerRadius must be greater than innerRadius.`);
      }

      let outer: CadKernelShape | null = null;
      let inner: CadKernelShape | null = null;
      try {
        outer = kernel.cylinder(outerRadius, height);
        inner = kernel.cylinder(innerRadius, height);
        return kernel.cut(outer, inner);
      } finally {
        if (inner) kernel.release(inner);
        if (outer) kernel.release(outer);
      }
    }
    default:
      throw new CadFeatureEvaluationError(feature.id, `${feature.label} has unsupported primitive kind '${String(kind)}'.`);
  }
}

function booleanFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  if (feature.dependsOn.length !== 2) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} Boolean feature requires exactly two feature dependencies.`);
  }

  const left = featureShapes.get(feature.dependsOn[0]!);
  const right = featureShapes.get(feature.dependsOn[1]!);
  if (!left || !right) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} Boolean dependencies must resolve to earlier exact-shape features.`);
  }

  switch (feature.parameters.operation) {
    case 'fuse':
      return kernel.fuse(left, right);
    case 'cut':
      return kernel.cut(left, right);
    case 'common':
      return kernel.common(left, right);
    case 'section':
      return kernel.section(left, right);
    default:
      throw new CadFeatureEvaluationError(
        feature.id,
        `${feature.label} has unsupported Boolean operation '${String(feature.parameters.operation)}'.`,
      );
  }
}

function singleDependencyShape(
  feature: CadFeature,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
  role: string,
): CadKernelShape {
  if (feature.dependsOn.length !== 1) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} ${role} requires exactly one feature dependency.`);
  }
  const shape = featureShapes.get(feature.dependsOn[0]!);
  if (!shape) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} ${role} dependency must resolve to an earlier exact-shape feature.`);
  }
  return shape;
}

function resolvedTopologyIds(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  shape: CadKernelShape,
  kind: TopologyKind,
): string[] {
  const producerFeatureId = feature.dependsOn[0];
  if (!producerFeatureId) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} topology operation requires one producer dependency.`);
  }
  const references = feature.topologyRefs.filter((reference) => reference.kind === kind);
  if (references.length === 0) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} requires at least one persisted ${kind} reference.`);
  }
  if (references.some((reference) => reference.producerFeatureId !== producerFeatureId)) {
    throw new CadFeatureEvaluationError(
      feature.id,
      `${feature.label} ${kind} references must target dependency '${producerFeatureId}'.`,
    );
  }

  const candidates = kernel.topologyCandidates(shape, producerFeatureId, kind);
  const resolved = references.map((reference) => {
    const result = resolveTopologyRef(reference, candidates);
    if (result.status === 'missing') {
      throw new CadFeatureEvaluationError(
        feature.id,
        `${feature.label} ${kind} reference '${reference.role}' could not be resolved on the current exact shape.`,
      );
    }
    if (result.status === 'ambiguous') {
      throw new CadFeatureEvaluationError(
        feature.id,
        `${feature.label} ${kind} reference '${reference.role}' is ambiguous across ${result.candidates.length} current candidates.`,
      );
    }
    return result.candidate.id;
  });

  if (new Set(resolved).size !== resolved.length) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} topology references must resolve to distinct ${kind} candidates.`);
  }
  return resolved;
}

function filletFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const radius = parameterNumber(feature, 'radius');
  const shape = singleDependencyShape(feature, featureShapes, 'fillet');
  return kernel.fillet(shape, resolvedTopologyIds(feature, kernel, shape, 'edge'), radius);
}

function chamferFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const distance = parameterNumber(feature, 'distance');
  const shape = singleDependencyShape(feature, featureShapes, 'chamfer');
  return kernel.chamfer(shape, resolvedTopologyIds(feature, kernel, shape, 'edge'), distance);
}

function shellFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const thickness = parameterNumber(feature, 'thickness');
  const shape = singleDependencyShape(feature, featureShapes, 'shell');
  return kernel.shell(shape, resolvedTopologyIds(feature, kernel, shape, 'face'), thickness);
}

function defeatureFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const shape = singleDependencyShape(feature, featureShapes, 'defeature');
  return kernel.defeature(shape, resolvedTopologyIds(feature, kernel, shape, 'face'));
}

/**
 * Applies OCCT's general solid-healing pass and surfaces whether it actually
 * produced a valid shape. Reporting exactly what changed is still out of
 * scope (occt-wasm's isValid is a pass/fail check, not a change log) but a
 * heal that silently leaves invalid geometry in the model is worth flagging.
 */
function healFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
  warnings: string[],
): CadKernelShape {
  const healed = kernel.heal(singleDependencyShape(feature, featureShapes, 'heal'));
  if (!kernel.isValid(healed)) warnings.push(`${feature.id}: shape is still invalid after healing.`);
  return healed;
}

function unifyFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  return kernel.unify(singleDependencyShape(feature, featureShapes, 'unify'));
}

function sewFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  if (feature.dependsOn.length < 2) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} sew feature requires at least two feature dependencies.`);
  }
  const shapes = feature.dependsOn.map((id) => featureShapes.get(id));
  if (shapes.some((shape) => !shape)) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} sew dependencies must resolve to earlier exact-shape features.`);
  }
  return kernel.sew(shapes as CadKernelShape[]);
}

function splitFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  if (feature.dependsOn.length < 2) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} split feature requires a shape dependency and at least one tool dependency.`);
  }
  const [shapeId, ...toolIds] = feature.dependsOn;
  const shape = featureShapes.get(shapeId!);
  const tools = toolIds.map((id) => featureShapes.get(id));
  if (!shape || tools.some((tool) => !tool)) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} split dependencies must resolve to earlier exact-shape features.`);
  }
  return kernel.split(shape, tools as CadKernelShape[]);
}

/**
 * occt-wasm's raw draft() takes exactly one face handle, unlike
 * fillet/chamfer/shell which accept an array. Batch multi-face draft would
 * need each subsequent face re-resolved by semantic fingerprint against the
 * shape produced by the previous face's draft (since the raw topology shifts
 * after each edit), which is a real design decision nobody has validated
 * yet. Rather than guess at that sequencing, this rejects more than one
 * resolved face and leaves batch draft as an explicit follow-up.
 */
/**
 * Resolves one persisted topology reference's semantic id against whatever
 * shape is passed in - unlike resolvedTopologyIds, which resolves every
 * reference of a kind against a single shared shape, this lets a caller
 * resolve references one at a time against a shape that changes between
 * resolutions (draft's raw kernel op only accepts one face at a time, so
 * later faces must be re-resolved against each earlier draft's own output -
 * OCCT's raw subshape ordinals aren't stable across an operation like this).
 */
function resolvedSingleTopologyId(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  shape: CadKernelShape,
  kind: TopologyKind,
  reference: CadTopologyRefRecord,
): string {
  const candidates = kernel.topologyCandidates(shape, reference.producerFeatureId, kind);
  const result = resolveTopologyRef(reference, candidates);
  if (result.status === 'missing') {
    throw new CadFeatureEvaluationError(
      feature.id,
      `${feature.label} ${kind} reference '${reference.role}' could not be resolved on the current exact shape.`,
    );
  }
  if (result.status === 'ambiguous') {
    throw new CadFeatureEvaluationError(
      feature.id,
      `${feature.label} ${kind} reference '${reference.role}' is ambiguous across ${result.candidates.length} current candidates.`,
    );
  }
  return result.candidate.id;
}

/**
 * Drafts one face at a time, in the order the references are persisted:
 * occt-wasm's raw draft() takes exactly one face handle, so each subsequent
 * face is re-resolved by semantic fingerprint against the PREVIOUS draft's
 * own output rather than the original shape or a cached index - the same
 * fingerprint-based resolution every other topology-driven feature already
 * relies on, just invoked once per step instead of once per feature.
 */
function draftFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const angle = parameterNumber(feature, 'angle');
  const direction = parameterVector3(feature, 'direction');
  const shape = singleDependencyShape(feature, featureShapes, 'draft');
  const producerFeatureId = feature.dependsOn[0]!;
  const references = feature.topologyRefs.filter((reference) => reference.kind === 'face');
  if (references.length === 0) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} requires at least one persisted face reference.`);
  }
  if (references.some((reference) => reference.producerFeatureId !== producerFeatureId)) {
    throw new CadFeatureEvaluationError(
      feature.id,
      `${feature.label} face references must target dependency '${producerFeatureId}'.`,
    );
  }

  let current = shape;
  let ownsCurrent = false;
  try {
    for (const reference of references) {
      const faceId = resolvedSingleTopologyId(feature, kernel, current, 'face', reference);
      const next = kernel.draft(current, [faceId], angle, direction);
      if (ownsCurrent) kernel.release(current);
      current = next;
      ownsCurrent = true;
    }
    return current;
  } catch (error) {
    if (ownsCurrent) kernel.release(current);
    throw error;
  }
}

function offsetFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const distance = parameterNonZeroNumber(feature, 'distance');
  return kernel.offset(singleDependencyShape(feature, featureShapes, 'offset'), distance);
}

function thickenFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const thickness = parameterNonZeroNumber(feature, 'thickness');
  return kernel.thicken(singleDependencyShape(feature, featureShapes, 'thicken'), thickness);
}

function mirrorFeature(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const sketch = sketchForFeature(feature, project);
  const shape = singleDependencyShape(feature, featureShapes, 'mirror');
  let plane;
  try {
    plane = resolveSketchPlane3d(sketch, datumPlanes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} mirror plane is invalid: ${message}`, { cause: error });
  }
  return kernel.mirror(shape, plane.origin, plane.normal);
}

/**
 * Pattern: repeats a dependency shape into N rigidly-transformed instances,
 * combined into a single compound - deliberately not tracked as separate
 * bodies/features. A compound is exactly one CadKernelShape (the same
 * reasoning `split` already established for its multi-fragment result), so
 * this fits the one-shape-per-feature model without inventing multi-output
 * feature semantics that nothing else in the schema supports yet. Each
 * instance is a fresh, independent transform of the dependency shape
 * (translate/rotateAroundAxis never mutate their input), so `count`
 * includes the untransformed first instance at offset/angle zero.
 */
function patternFeature(
  feature: CadFeature,
  datumAxes: CadDatumAxes,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const shape = singleDependencyShape(feature, featureShapes, 'pattern');
  const count = parameterPositiveInteger(feature, 'count');
  const kind = feature.parameters.kind;

  const instances: CadKernelShape[] = [];
  try {
    if (kind === 'linear') {
      const step = parameterVector3(feature, 'step');
      if (Math.hypot(step[0], step[1], step[2]) === 0) {
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} linear pattern 'step' must be a non-zero vector.`);
      }
      for (let i = 0; i < count; i += 1) {
        instances.push(kernel.translate(shape, [step[0] * i, step[1] * i, step[2] * i]));
      }
    } else if (kind === 'circular') {
      const datumAxis = parameterDatumAxis(feature, datumAxes);
      const axisOrigin = datumAxis?.origin ?? parameterVector3(feature, 'axisOrigin');
      const axisDirection = datumAxis?.direction ?? parameterVector3(feature, 'axisDirection');
      const angleStep = parameterNonZeroNumber(feature, 'angleStep');
      for (let i = 0; i < count; i += 1) {
        instances.push(kernel.rotateAroundAxis(shape, axisOrigin, axisDirection, angleStep * i));
      }
    } else {
      throw new CadFeatureEvaluationError(
        feature.id,
        `${feature.label} pattern kind '${String(kind)}' is not supported; use 'linear' or 'circular'.`,
      );
    }
    return kernel.compound(instances);
  } finally {
    for (const instance of instances) kernel.release(instance);
  }
}

/**
 * Simple blind hole: extrudes the sketch's circular profile into a cutting
 * tool and subtracts it from the dependency body. Composes entirely from
 * already-verified primitives (profile placement, extrude, cut) instead of
 * adding new kernel surface area. An optional counterbore fuses a second,
 * wider tool built from a concentric sketch circle into the bore before
 * cutting; an optional countersink instead fuses a conical frustum (sized
 * from a concentric sketch circle and an included angle) via the exact same
 * pattern. Patterned placement is not yet supported.
 */
interface CounterboreSpec {
  profileEntityIds: string[];
  depth: number;
}

function parameterCounterbore(feature: CadFeature): CounterboreSpec | null {
  const value = feature.parameters.counterbore;
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'counterbore' must be an object when provided.`);
  }
  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.profileEntityIds)
    || record.profileEntityIds.length === 0
    || record.profileEntityIds.some((id) => typeof id !== 'string' || id.length === 0)
  ) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} counterbore requires profileEntityIds.`);
  }
  if (typeof record.depth !== 'number' || !Number.isFinite(record.depth) || record.depth <= 0) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} counterbore requires a positive finite depth.`);
  }
  return { profileEntityIds: record.profileEntityIds as string[], depth: record.depth };
}

interface CountersinkSpec {
  profileEntityIds: string[];
  /** Full included angle of the conical recess, in radians, strictly between 0 and pi. */
  angle: number;
}

function parameterCountersink(feature: CadFeature): CountersinkSpec | null {
  const value = feature.parameters.countersink;
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'countersink' must be an object when provided.`);
  }
  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.profileEntityIds)
    || record.profileEntityIds.length === 0
    || record.profileEntityIds.some((id) => typeof id !== 'string' || id.length === 0)
  ) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} countersink requires profileEntityIds.`);
  }
  if (typeof record.angle !== 'number' || !Number.isFinite(record.angle) || record.angle <= 0 || record.angle >= Math.PI) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} countersink requires a finite angle in radians, strictly between 0 and pi.`);
  }
  return { profileEntityIds: record.profileEntityIds as string[], angle: record.angle };
}

/** A countersink/counterbore's numeric radius comes from the profile's own resolved geometry
 * rather than the sketch entity, so it works the same way regardless of how the circle was
 * drawn or constrained - but that only works when the profile really is a single circle. */
function circleProfileGeometry(
  feature: CadFeature,
  profile3d: CadSketchProfile3d,
  role: string,
): { center: CadKernelVector3; radius: number } {
  const edge = profile3d.edges.length === 1 ? profile3d.edges[0] : undefined;
  if (!edge || edge.kind !== 'circle') {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} ${role} must reference a single circle entity.`);
  }
  return { center: edge.center, radius: edge.radius };
}

/** A cut tool sized to a fixed depth is only guaranteed to reach through a body if it exceeds
 * the body's bounding diagonal; the diagonal is a direction-agnostic safe over-estimate that
 * avoids projecting onto the cut direction, and the boolean cut only removes what actually
 * overlaps the body regardless of how far the tool extends beyond it. */
const THROUGH_ALL_MARGIN = 1;

function throughAllDepth(kernel: CadFeatureKernel, shape: CadKernelShape): number {
  const bounds = kernel.bounds(shape);
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) + THROUGH_ALL_MARGIN;
}

function holeFeature(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const throughAll = feature.parameters.throughAll === true;
  if (!throughAll && feature.parameters.depth === undefined) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} requires either 'depth' or 'throughAll'.`);
  }
  const depth = throughAll ? undefined : parameterNumber(feature, 'depth');
  const counterbore = parameterCounterbore(feature);
  const countersink = parameterCountersink(feature);
  if (counterbore && countersink) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} cannot specify both a counterbore and a countersink.`);
  }
  if (counterbore && depth !== undefined && counterbore.depth >= depth) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} counterbore depth must be less than the hole depth.`);
  }
  const shape = singleDependencyShape(feature, featureShapes, 'hole');
  return withProfileFace(feature, project, datumPlanes, kernel, (profile, profile3d) => {
    const reversed = feature.parameters.reversed === true;
    const direction: CadKernelVector3 = reversed ? profile3d.normal : negate(profile3d.normal);
    const tool = kernel.extrude(profile, depth ?? throughAllDepth(kernel, shape), direction);

    if (counterbore) {
      const sketch = sketchForFeature(feature, project);
      let counterboreProfile3d: CadSketchProfile3d;
      try {
        counterboreProfile3d = buildSketchProfile3d(sketch, counterbore.profileEntityIds, datumPlanes);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} counterbore profile is invalid: ${message}`, { cause: error });
      }
      const counterboreFace = kernel.profileFace(counterboreProfile3d);
      let counterboreTool: CadKernelShape;
      try {
        counterboreTool = kernel.extrude(counterboreFace, counterbore.depth, direction);
      } finally {
        kernel.release(counterboreFace);
      }
      let fusedTool: CadKernelShape;
      try {
        fusedTool = kernel.fuse(tool, counterboreTool);
      } finally {
        kernel.release(tool);
        kernel.release(counterboreTool);
      }
      try {
        return kernel.cut(shape, fusedTool);
      } finally {
        kernel.release(fusedTool);
      }
    }

    if (countersink) {
      const sketch = sketchForFeature(feature, project);
      let countersinkProfile3d: CadSketchProfile3d;
      try {
        countersinkProfile3d = buildSketchProfile3d(sketch, countersink.profileEntityIds, datumPlanes);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} countersink profile is invalid: ${message}`, { cause: error });
      }
      const bore = circleProfileGeometry(feature, profile3d, 'hole profile');
      const sink = circleProfileGeometry(feature, countersinkProfile3d, 'countersink profile');
      if (sink.radius <= bore.radius) {
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} countersink diameter must be larger than the hole diameter.`);
      }
      const countersinkDepth = (sink.radius - bore.radius) / Math.tan(countersink.angle / 2);
      const cone = kernel.cone(sink.radius, bore.radius, countersinkDepth);
      let placedCone: CadKernelShape;
      try {
        placedCone = kernel.placeAlongAxis(cone, bore.center, direction);
      } finally {
        kernel.release(cone);
      }
      let fusedTool: CadKernelShape;
      try {
        fusedTool = kernel.fuse(tool, placedCone);
      } finally {
        kernel.release(tool);
        kernel.release(placedCone);
      }
      try {
        return kernel.cut(shape, fusedTool);
      } finally {
        kernel.release(fusedTool);
      }
    }

    try {
      return kernel.cut(shape, tool);
    } finally {
      kernel.release(tool);
    }
  });
}

/**
 * Rib: extrudes a thin wall along a straight sketch centerline and fuses it
 * onto the dependency body. The wall's cross-section is built automatically
 * by offsetting the centerline by half the thickness on each side, in-plane,
 * rather than requiring the user to hand-draw the offset rectangle - the one
 * thing a plain extrude+fuse composition doesn't already give for free.
 * Scope is deliberately narrow: a single straight-line centerline only.
 * Multi-segment or curved centerlines would need real 2D polyline offset
 * with mitered corners, which is a genuinely separate piece of geometry.
 */
function ribFeature(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const thickness = parameterNumber(feature, 'thickness');
  const depth = parameterNumber(feature, 'depth');
  const shape = singleDependencyShape(feature, featureShapes, 'rib');
  const sketch = sketchForFeature(feature, project);
  const pathEntityIds = parameterStringArray(feature, 'profileEntityIds');
  if (pathEntityIds.length !== 1) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} centerline must reference exactly one straight line entity.`);
  }

  let path: CadSketchWire3d;
  try {
    path = buildSketchPath3d(sketch, pathEntityIds, datumPlanes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} centerline is invalid: ${message}`, { cause: error });
  }
  const centerlineEdge = path.edges.length === 1 ? path.edges[0] : undefined;
  if (!centerlineEdge || centerlineEdge.kind !== 'line') {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} centerline must be a single straight line entity.`);
  }

  let plane: CadSketchPlane3d;
  try {
    plane = resolveSketchPlane3d(sketch, datumPlanes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} sketch plane is invalid: ${message}`, { cause: error });
  }

  const { start, end } = centerlineEdge;
  const lineDirection: CadKernelVector3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  let perpendicular: CadKernelVector3;
  try {
    perpendicular = perpendicularInPlane(lineDirection, plane.normal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} centerline direction is invalid: ${message}`, { cause: error });
  }

  const halfThickness = thickness / 2;
  const offset = (point: CadKernelVector3, sign: 1 | -1): CadKernelVector3 => [
    point[0] + sign * perpendicular[0] * halfThickness,
    point[1] + sign * perpendicular[1] * halfThickness,
    point[2] + sign * perpendicular[2] * halfThickness,
  ];
  const a = offset(start, 1);
  const b = offset(end, 1);
  const c = offset(end, -1);
  const d = offset(start, -1);
  const wallProfile3d: CadSketchProfile3d = {
    normal: plane.normal,
    edges: [
      { kind: 'line', start: a, end: b },
      { kind: 'line', start: b, end: c },
      { kind: 'line', start: c, end: d },
      { kind: 'line', start: d, end: a },
    ],
  };

  const reversed = feature.parameters.reversed === true;
  const direction: CadKernelVector3 = reversed ? negate(plane.normal) : plane.normal;
  const wallFace = kernel.profileFace(wallProfile3d);
  let tool: CadKernelShape;
  try {
    tool = kernel.extrude(wallFace, depth, direction);
  } finally {
    kernel.release(wallFace);
  }
  try {
    return kernel.fuse(shape, tool);
  } finally {
    kernel.release(tool);
  }
}

function projectSketch(feature: CadFeature, project: CadProject, sketchId: string, role: string) {
  const sketch = project.sketches.find((candidate) => candidate.id === sketchId);
  if (!sketch) throw new CadFeatureEvaluationError(feature.id, `${feature.label} references unknown ${role} sketch '${sketchId}'.`);
  return sketch;
}

function sketchForFeature(feature: CadFeature, project: CadProject) {
  return projectSketch(feature, project, parameterString(feature, 'sketchId'), 'profile');
}

function profileForFeature3d(feature: CadFeature, project: CadProject, datumPlanes: CadDatumPlaneFrames): CadSketchProfile3d {
  const sketch = sketchForFeature(feature, project);
  const profileEntityIds = parameterStringArray(feature, 'profileEntityIds');
  try {
    return buildSketchProfile3d(sketch, profileEntityIds, datumPlanes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} profile is invalid: ${message}`, { cause: error });
  }
}

function withProfileFace(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
  operation: (profile: CadKernelShape, profile3d: CadSketchProfile3d) => CadKernelShape,
): CadKernelShape {
  const profile3d = profileForFeature3d(feature, project, datumPlanes);
  const profile = kernel.profileFace(profile3d);
  try {
    return operation(profile, profile3d);
  } finally {
    kernel.release(profile);
  }
}

function withProfileWire(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
  operation: (profile: CadKernelShape, profile3d: CadSketchProfile3d) => CadKernelShape,
): CadKernelShape {
  const profile3d = profileForFeature3d(feature, project, datumPlanes);
  const profile = kernel.profileWire(profile3d);
  try {
    return operation(profile, profile3d);
  } finally {
    kernel.release(profile);
  }
}

function extrudeFeature(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
): CadKernelShape {
  const distance = parameterNumber(feature, 'distance');
  return withProfileFace(feature, project, datumPlanes, kernel, (profile, profile3d) => {
    const reversed = feature.parameters.reversed === true;
    const direction: CadKernelVector3 = reversed ? negate(profile3d.normal) : profile3d.normal;
    return kernel.extrude(profile, distance, direction);
  });
}

function revolveFeature(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  datumAxes: CadDatumAxes,
  kernel: CadFeatureKernel,
): CadKernelShape {
  const angle = parameterNumber(feature, 'angle');
  if (angle > Math.PI * 2 + 1e-12) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} revolve angle must not exceed one full revolution.`);
  }
  const sketch = sketchForFeature(feature, project);
  let axis = parameterDatumAxis(feature, datumAxes);
  if (axis && feature.parameters.axisLineId !== undefined) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} must reference either axisFeatureId or axisLineId, not both.`);
  }
  if (!axis) {
    const axisLineId = parameterString(feature, 'axisLineId');
    try {
      axis = resolveSketchAxis3d(sketch, axisLineId, datumPlanes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CadFeatureEvaluationError(feature.id, `${feature.label} axis is invalid: ${message}`, { cause: error });
    }
  }
  return withProfileFace(feature, project, datumPlanes, kernel, (profile) => kernel.revolve(
    profile,
    axis.origin,
    axis.direction,
    feature.parameters.reversed === true ? -angle : angle,
  ));
}

function sweepPath(feature: CadFeature, project: CadProject, datumPlanes: CadDatumPlaneFrames, kernel: CadFeatureKernel): CadKernelShape {
  const helix = parameterHelixDefinition(feature);
  if (helix) return kernel.helixWire(helix);

  const pathSketchId = parameterString(feature, 'pathSketchId');
  const pathEntityIds = parameterStringArray(feature, 'pathEntityIds');
  const pathSketch = projectSketch(feature, project, pathSketchId, 'path');
  let path3d: CadSketchWire3d;
  try {
    path3d = buildSketchPath3d(pathSketch, pathEntityIds, datumPlanes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} path is invalid: ${message}`, { cause: error });
  }
  return kernel.profileWire(path3d);
}

function sweepFeature(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
): CadKernelShape {
  return withProfileWire(feature, project, datumPlanes, kernel, (profile) => {
    const path = sweepPath(feature, project, datumPlanes, kernel);
    try {
      return kernel.sweep(profile, path);
    } finally {
      kernel.release(path);
    }
  });
}

function loftFeature(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
): CadKernelShape {
  const sections = parameterLoftSections(feature);
  const solidParameter = feature.parameters.solid;
  if (solidParameter !== undefined && typeof solidParameter !== 'boolean') {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter 'solid' must be a boolean when provided.`);
  }
  const sectionWires: CadKernelShape[] = [];

  try {
    for (const [index, section] of sections.entries()) {
      const sketch = projectSketch(feature, project, section.sketchId, `loft section ${index + 1}`);
      let profile3d: CadSketchProfile3d;
      try {
        profile3d = buildSketchProfile3d(sketch, section.profileEntityIds, datumPlanes);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new CadFeatureEvaluationError(
          feature.id,
          `${feature.label} loft section ${index + 1} is invalid: ${message}`,
          { cause: error },
        );
      }
      sectionWires.push(kernel.profileWire(profile3d));
    }
    return kernel.loft(sectionWires, solidParameter ?? true);
  } finally {
    for (const wire of sectionWires) kernel.release(wire);
  }
}

function isNonSolidPassThrough(feature: CadFeature): boolean {
  return feature.type === 'sketch' || feature.type === 'datum-plane' || feature.type === 'datum-axis';
}

function createFeatureShape(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  datumAxes: CadDatumAxes,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
  warnings: string[],
): CadKernelShape | null {
  switch (feature.type) {
    case 'primitive':
      return primitive(feature, kernel);
    case 'extrude':
      return extrudeFeature(feature, project, datumPlanes, kernel);
    case 'revolve':
      return revolveFeature(feature, project, datumPlanes, datumAxes, kernel);
    case 'sweep':
      return sweepFeature(feature, project, datumPlanes, kernel);
    case 'loft':
      return loftFeature(feature, project, datumPlanes, kernel);
    case 'boolean':
      return booleanFeature(feature, kernel, featureShapes);
    case 'fillet':
      return filletFeature(feature, kernel, featureShapes);
    case 'chamfer':
      return chamferFeature(feature, kernel, featureShapes);
    case 'shell':
      return shellFeature(feature, kernel, featureShapes);
    case 'defeature':
      return defeatureFeature(feature, kernel, featureShapes);
    case 'heal':
      return healFeature(feature, kernel, featureShapes, warnings);
    case 'unify':
      return unifyFeature(feature, kernel, featureShapes);
    case 'sew':
      return sewFeature(feature, kernel, featureShapes);
    case 'split':
      return splitFeature(feature, kernel, featureShapes);
    case 'draft':
      return draftFeature(feature, kernel, featureShapes);
    case 'offset':
      return offsetFeature(feature, kernel, featureShapes);
    case 'mirror':
      return mirrorFeature(feature, project, datumPlanes, kernel, featureShapes);
    case 'pattern':
      return patternFeature(feature, datumAxes, kernel, featureShapes);
    case 'thicken':
      return thickenFeature(feature, kernel, featureShapes);
    case 'hole':
      return holeFeature(feature, project, datumPlanes, kernel, featureShapes);
    case 'rib':
      return ribFeature(feature, project, datumPlanes, kernel, featureShapes);
    default:
      if (isNonSolidPassThrough(feature)) return null;
      throw new CadFeatureEvaluationError(
        feature.id,
        `${feature.label} feature type '${feature.type}' is not implemented by the exact evaluator yet.`,
      );
  }
}

function releaseShapes(
  kernel: CadFeatureKernel,
  ownedShapes: ReadonlySet<CadKernelShape>,
  retainedShapes: ReadonlySet<CadKernelShape>,
): void {
  for (const shape of ownedShapes) {
    if (!retainedShapes.has(shape)) kernel.release(shape);
  }
}

/**
 * Replays the serializable feature history into exact worker-local geometry.
 * Intermediate shapes remain alive until evaluation finishes so downstream
 * dependencies can resolve by feature id; only final body shapes are retained.
 */
export function evaluateCadFeatures(project: CadProject, kernel: CadFeatureKernel): CadFeatureEvaluationResult {
  const declaredBodyIds = new Set(project.bodies.map((body) => body.id));
  const featureShapes = new Map<string, CadKernelShape>();
  const finalBodies = new Map<string, CadEvaluatedBody>();
  const ownedShapes = new Set<CadKernelShape>();
  const warnings: string[] = [];
  let activeFeature: CadFeature | null = null;

  try {
    const { planes: datumPlanes, axes: datumAxes } = resolveDatumGeometry(project);
    for (const feature of project.features) {
      activeFeature = feature;
      if (feature.suppressed) continue;

      const shape = createFeatureShape(feature, project, datumPlanes, datumAxes, kernel, featureShapes, warnings);
      if (!shape) continue;

      if (!feature.bodyId) {
        kernel.release(shape);
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} exact solid feature requires a bodyId.`);
      }
      if (!declaredBodyIds.has(feature.bodyId)) {
        kernel.release(shape);
        throw new CadFeatureEvaluationError(feature.id, `${feature.label} references unknown body '${feature.bodyId}'.`);
      }

      ownedShapes.add(shape);
      featureShapes.set(feature.id, shape);
      finalBodies.set(feature.bodyId, {
        bodyId: feature.bodyId,
        sourceFeatureId: feature.id,
        shape,
      });
    }

    const retainedShapes = new Set([...finalBodies.values()].map((body) => body.shape));
    releaseShapes(kernel, ownedShapes, retainedShapes);
    return {
      bodies: project.bodies.flatMap((body) => {
        const evaluated = finalBodies.get(body.id);
        return evaluated ? [evaluated] : [];
      }),
      warnings,
    };
  } catch (error) {
    releaseShapes(kernel, ownedShapes, new Set());
    if (error instanceof CadFeatureEvaluationError) throw error;
    const featureId = activeFeature?.id ?? 'project';
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(featureId, `Exact feature evaluation failed: ${message}`, { cause: error });
  }
}
