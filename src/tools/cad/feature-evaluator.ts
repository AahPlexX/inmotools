import type { CadFeature, CadProject } from './cad-types';
import type { CadExactKernel, CadKernelShape } from './kernel-contract';

export interface CadFeatureKernel extends CadExactKernel {
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

function parameterNumber(feature: CadFeature, key: string, options: { allowZero?: boolean } = {}): number {
  const value = feature.parameters[key];
  const allowZero = options.allowZero === true;
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    const qualifier = allowZero ? 'a finite non-negative number' : 'a finite positive number';
    throw new CadFeatureEvaluationError(feature.id, `${feature.label} parameter '${key}' must be ${qualifier}.`);
  }
  return value;
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

function isNonSolidPassThrough(feature: CadFeature): boolean {
  return feature.type === 'sketch' || feature.type === 'datum-plane' || feature.type === 'datum-axis';
}

function createFeatureShape(
  feature: CadFeature,
  kernel: CadFeatureKernel,
  featureShapes: ReadonlyMap<string, CadKernelShape>,
): CadKernelShape | null {
  switch (feature.type) {
    case 'primitive':
      return primitive(feature, kernel);
    case 'boolean':
      return booleanFeature(feature, kernel, featureShapes);
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

      const shape = createFeatureShape(feature, kernel, featureShapes);
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
