import type { CadFeature, CadProject } from './cad-types';
import type { CadExactKernel, CadKernelShape, CadKernelVector3 } from './kernel-contract';
import {
  buildSketchPath3d,
  buildSketchProfile3d,
  resolveSketchAxis3d,
  type CadSketchProfile3d,
  type CadSketchWire3d,
} from './sketch-profile';
import {
  resolveTopologyRef,
  type TopologyCandidate,
  type TopologyKind,
} from './topology-ref';

export interface CadFeatureKernel extends CadExactKernel {
  profileWire(definition: CadSketchWire3d): CadKernelShape;
  profileFace(profile: CadSketchProfile3d): CadKernelShape;
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

function parameterStringArray(feature: CadFeature, key: string): string[] {
  const value = feature.parameters[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be a non-empty array of ids.`);
  }
  return value;
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

function offsetFeature(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape {
  const distance = parameterNonZeroNumber(feature, 'distance');
  return kernel.offset(singleDependencyShape(feature, featureShapes, 'offset'), distance);
}

function projectSketch(feature: CadFeature, project: CadProject, sketchId: string, role: string) {
  const sketch = project.sketches.find((candidate) => candidate.id === sketchId);
  if (!sketch) throw new CadFeatureEvaluationError(feature.id, `${feature.label} references unknown ${role} sketch '${sketchId}'.`);
  return sketch;
}

function sketchForFeature(feature: CadFeature, project: CadProject) {
  return projectSketch(feature, project, parameterString(feature, 'sketchId'), 'profile');
}

function profileForFeature3d(feature: CadFeature, project: CadProject): CadSketchProfile3d {
  const sketch = sketchForFeature(feature, project);
  const profileEntityIds = parameterStringArray(feature, 'profileEntityIds');
  try {
    return buildSketchProfile3d(sketch, profileEntityIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} profile is invalid: ${message}`, { cause: error });
  }
}

function withProfileFace(
  feature: CadFeature,
  project: CadProject,
  kernel: CadFeatureKernel,
  operation: (profile: CadKernelShape, profile3d: CadSketchProfile3d) => CadKernelShape,
): CadKernelShape {
  const profile3d = profileForFeature3d(feature, project);
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
  kernel: CadFeatureKernel,
  operation: (profile: CadKernelShape, profile3d: CadSketchProfile3d) => CadKernelShape,
): CadKernelShape {
  const profile3d = profileForFeature3d(feature, project);
  const profile = kernel.profileWire(profile3d);
  try {
    return operation(profile, profile3d);
  } finally {
    kernel.release(profile);
  }
}

function extrudeFeature(feature: CadFeature, project: CadProject, kernel: CadFeatureKernel): CadKernelShape {
  const distance = parameterNumber(feature, 'distance');
  return withProfileFace(feature, project, kernel, (profile, profile3d) => {
    const reversed = feature.parameters.reversed === true;
    const direction: CadKernelVector3 = reversed
      ? [-profile3d.normal[0], -profile3d.normal[1], -profile3d.normal[2]]
      : profile3d.normal;
    return kernel.extrude(profile, distance, direction);
  });
}

function revolveFeature(feature: CadFeature, project: CadProject, kernel: CadFeatureKernel): CadKernelShape {
  const angle = parameterNumber(feature, 'angle');
  if (angle > Math.PI * 2 + 1e-12) {
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} revolve angle must not exceed one full revolution.`);
  }
  const sketch = sketchForFeature(feature, project);
  const axisLineId = parameterString(feature, 'axisLineId');
  let axis;
  try {
    axis = resolveSketchAxis3d(sketch, axisLineId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} axis is invalid: ${message}`, { cause: error });
  }
  return withProfileFace(feature, project, kernel, (profile) => kernel.revolve(
    profile,
    axis.origin,
    axis.direction,
    feature.parameters.reversed === true ? -angle : angle,
  ));
}

function sweepFeature(feature: CadFeature, project: CadProject, kernel: CadFeatureKernel): CadKernelShape {
  const pathSketchId = parameterString(feature, 'pathSketchId');
  const pathEntityIds = parameterStringArray(feature, 'pathEntityIds');
  const pathSketch = projectSketch(feature, project, pathSketchId, 'path');
  let path3d: CadSketchWire3d;
  try {
    path3d = buildSketchPath3d(pathSketch, pathEntityIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} path is invalid: ${message}`, { cause: error });
  }

  return withProfileWire(feature, project, kernel, (profile) => {
    const path = kernel.profileWire(path3d);
    try {
      return kernel.sweep(profile, path);
    } finally {
      kernel.release(path);
    }
  });
}

function loftFeature(feature: CadFeature, project: CadProject, kernel: CadFeatureKernel): CadKernelShape {
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
        profile3d = buildSketchProfile3d(sketch, section.profileEntityIds);
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
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape | null {
  switch (feature.type) {
    case 'primitive':
      return primitive(feature, kernel);
    case 'extrude':
      return extrudeFeature(feature, project, kernel);
    case 'revolve':
      return revolveFeature(feature, project, kernel);
    case 'sweep':
      return sweepFeature(feature, project, kernel);
    case 'loft':
      return loftFeature(feature, project, kernel);
    case 'boolean':
      return booleanFeature(feature, kernel, featureShapes);
    case 'fillet':
      return filletFeature(feature, kernel, featureShapes);
    case 'chamfer':
      return chamferFeature(feature, kernel, featureShapes);
    case 'offset':
      return offsetFeature(feature, kernel, featureShapes);
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
    for (const feature of project.features) {
      activeFeature = feature;
      if (feature.suppressed) continue;

      const shape = createFeatureShape(feature, project, kernel, featureShapes);
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
