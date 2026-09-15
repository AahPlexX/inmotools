import type { CadFeature, CadProject } from './cad-types';
import type { CadExactKernel, CadHelixDefinition, CadKernelShape, CadKernelVector3 } from './kernel-contract';
import {
  buildSketchPath3d,
  buildSketchProfile3d,
  negate,
  resolveDatumPlaneFrame,
  resolveSketchAxis3d,
  resolveSketchPlane3d,
  type CadDatumPlaneFrames,
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

/**
 * Resolves every non-suppressed 'datum-plane' feature into a 3D plane frame
 * before any sketch is placed. Only the offset-from-origin-plane variant is
 * supported today (parameters: basePlane, distance); angle, mid-plane,
 * three-point, tangent, and face-derived datum planes are rejected rather
 * than approximated, since none of those has an unambiguous in-plane axis
 * convention without a design decision this evaluator does not yet make.
 */
function resolveDatumPlanes(project: CadProject): CadDatumPlaneFrames {
  const frames = new Map<string, PlaneFrame>();
  for (const feature of project.features) {
    if (feature.type !== 'datum-plane' || feature.suppressed) continue;
    const kind = feature.parameters.kind;
    if (kind !== undefined && kind !== 'offset') {
      throw new CadFeatureEvaluationError(
        feature.id,
        `${feature.label} datum plane kind '${String(kind)}' is not supported; only 'offset' is implemented.`,
      );
    }
    const basePlane = parameterOriginPlane(feature, 'basePlane');
    const distance = parameterNumber(feature, 'distance', { allowZero: true });
    frames.set(feature.id, resolveDatumPlaneFrame(basePlane, distance));
  }
  return frames;
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

/** Applies OCCT's general solid-healing pass. Reporting exactly what changed is not yet implemented. */
function healFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  return kernel.heal(singleDependencyShape(feature, featureShapes, 'heal'));
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
function draftFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const angle = parameterNumber(feature, 'angle');
  const direction = parameterVector3(feature, 'direction');
  const shape = singleDependencyShape(feature, featureShapes, 'draft');
  const faceIds = resolvedTopologyIds(feature, kernel, shape, 'face');
  if (faceIds.length !== 1) {
    throw new CadFeatureEvaluationError(
      feature.id,
      `${feature.label} draft supports exactly one face per feature today; add another draft feature for additional faces.`,
    );
  }
  return kernel.draft(shape, faceIds, angle, direction);
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
 * Simple blind hole: extrudes the sketch's circular profile into a cutting
 * tool and subtracts it from the dependency body. Composes entirely from
 * already-verified primitives (profile placement, extrude, cut) instead of
 * adding new kernel surface area. Counterbore/countersink presets,
 * through-all termination, and patterned placement are not yet supported.
 */
function holeFeature(
  feature: CadFeature,
  project: CadProject,
  datumPlanes: CadDatumPlaneFrames,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const depth = parameterNumber(feature, 'depth');
  const shape = singleDependencyShape(feature, featureShapes, 'hole');
  return withProfileFace(feature, project, datumPlanes, kernel, (profile, profile3d) => {
    const reversed = feature.parameters.reversed === true;
    const direction: CadKernelVector3 = reversed ? profile3d.normal : negate(profile3d.normal);
    const tool = kernel.extrude(profile, depth, direction);
    try {
      return kernel.cut(shape, tool);
    } finally {
      kernel.release(tool);
    }
  });
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
  kernel: CadFeatureKernel,
): CadKernelShape {
  const angle = parameterNumber(feature, 'angle');
  if (angle > Math.PI * 2 + 1e-12) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} revolve angle must not exceed one full revolution.`);
  }
  const sketch = sketchForFeature(feature, project);
  const axisLineId = parameterString(feature, 'axisLineId');
  let axis;
  try {
    axis = resolveSketchAxis3d(sketch, axisLineId, datumPlanes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} axis is invalid: ${message}`, { cause: error });
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
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape | null {
  switch (feature.type) {
    case 'primitive':
      return primitive(feature, kernel);
    case 'extrude':
      return extrudeFeature(feature, project, datumPlanes, kernel);
    case 'revolve':
      return revolveFeature(feature, project, datumPlanes, kernel);
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
      return healFeature(feature, kernel, featureShapes);
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
    case 'thicken':
      return thickenFeature(feature, kernel, featureShapes);
    case 'hole':
      return holeFeature(feature, project, datumPlanes, kernel, featureShapes);
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
  let activeFeature: CadFeature | null = null;

  try {
    const datumPlanes = resolveDatumPlanes(project);
    for (const feature of project.features) {
      activeFeature = feature;
      if (feature.suppressed) continue;

      const shape = createFeatureShape(feature, project, datumPlanes, kernel, featureShapes);
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
      warnings: [],
    };
  } catch (error) {
    releaseShapes(kernel, ownedShapes, new Set());
    if (error instanceof CadFeatureEvaluationError) throw error;
    const featureId = activeFeature?.id ?? 'project';
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(featureId, `Exact feature evaluation failed: ${message}`, { cause: error });
  }
}
