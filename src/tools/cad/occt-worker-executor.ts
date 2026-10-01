import {
  CadFeatureEvaluationError,
  evaluateCadFeatures,
} from './feature-evaluator';
import type {
  CadKernelBodyResult,
  CadKernelOperation,
  CadKernelPayload,
  CadKernelQuality,
  CadKernelRequest,
  CadKernelShape,
  CadKernelTessellationOptions,
} from './kernel-contract';
import {
  createOcctCadKernelAdapter,
  type OcctCadKernelAdapter,
  type OcctCadKernelAdapterOptions,
} from './occt-adapter';
import { CadKernelRuntimeError } from './kernel-worker-runtime';

interface WorkerBody {
  id: string;
  shape: CadKernelShape;
}

type ImportOperation = Extract<CadKernelOperation, { kind: 'import' }>;
type ExportOperation = Extract<CadKernelOperation, { kind: 'export' }>;

function tessellationOptions(quality: CadKernelQuality): CadKernelTessellationOptions {
  return quality === 'preview'
    ? { linearDeflection: 0.5, angularDeflection: 0.8 }
    : { linearDeflection: 0.1, angularDeflection: 0.5 };
}

/**
 * Stateful request executor owned by one dedicated CAD worker. Exact shapes
 * live only here; protocol responses contain meshes, measurements, or export
 * bytes and therefore remain structured-clone-safe.
 */
export class OcctKernelRequestExecutor {
  readonly #kernel: OcctCadKernelAdapter;
  #bodies: WorkerBody[] = [];
  #disposed = false;

  constructor(kernel: OcctCadKernelAdapter) {
    this.#kernel = kernel;
  }

  async execute(request: CadKernelRequest): Promise<CadKernelPayload> {
    this.#assertActive();

    switch (request.operation.kind) {
      case 'import':
        return this.#import(request.operation, request.quality);
      case 'export':
        return this.#export(request.operation);
      case 'rebuild':
        return this.#rebuild(request);
      case 'measure':
        throw new CadKernelRuntimeError(
          'evaluation-failed',
          'Project measurement requests are attached by the G6 exact feature evaluator.',
          true,
        );
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#releaseBodies(this.#bodies);
    this.#bodies = [];
    this.#disposed = true;
    this.#kernel.dispose();
  }

  #import(operation: ImportOperation, quality: CadKernelQuality): CadKernelPayload {
    const bytes = new Uint8Array(operation.data);
    const shapes = operation.format === 'step'
      ? this.#kernel.importStep(bytes)
      : this.#kernel.importBrep(bytes);

    try {
      const bodyResults = shapes.map((shape, index) => this.#bodyResult(`import-${index + 1}`, shape, quality));
      const nextBodies = shapes.map((shape, index) => ({ id: `import-${index + 1}`, shape }));
      const previousBodies = this.#bodies;
      this.#bodies = nextBodies;
      this.#releaseBodies(previousBodies);
      return { kind: 'import', bodies: bodyResults, warnings: [] };
    } catch (error) {
      for (const shape of shapes) this.#kernel.release(shape);
      throw error;
    }
  }

  #rebuild(request: CadKernelRequest): CadKernelPayload {
    let evaluated: ReturnType<typeof evaluateCadFeatures>;
    try {
      evaluated = evaluateCadFeatures(request.project, this.#kernel);
    } catch (error) {
      throw this.#evaluationError(error);
    }

    try {
      const bodyResults = evaluated.bodies.map((body) => {
        try {
          return this.#bodyResult(body.bodyId, body.shape, request.quality);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new CadFeatureEvaluationError(
            body.sourceFeatureId,
            `Failed to tessellate evaluated feature '${body.sourceFeatureId}': ${message}`,
            { cause: error },
          );
        }
      });
      const nextBodies = evaluated.bodies.map((body) => ({ id: body.bodyId, shape: body.shape }));
      const previousBodies = this.#bodies;
      this.#bodies = nextBodies;
      this.#releaseBodies(previousBodies);
      return { kind: 'rebuild', bodies: bodyResults, warnings: evaluated.warnings };
    } catch (error) {
      this.#releaseBodies(evaluated.bodies.map((body) => ({ id: body.bodyId, shape: body.shape })));
      throw this.#evaluationError(error);
    }
  }

  #export(operation: ExportOperation): CadKernelPayload {
    if (this.#bodies.length === 0) {
      throw new CadKernelRuntimeError('export-failed', 'There are no exact worker-owned bodies to export.', true);
    }

    const shapes = this.#bodies.map((body) => body.shape);
    let data: string | Uint8Array;
    switch (operation.format) {
      case 'step':
        data = this.#kernel.exportStep(shapes);
        break;
      case 'brep':
        data = this.#kernel.exportBrep(shapes);
        break;
      case 'stl': {
        if (shapes.length !== 1) {
          throw new CadKernelRuntimeError(
            'export-failed',
            'STL export currently requires one exact body; multi-body STL packaging belongs to the export workbench.',
            true,
          );
        }
        const ascii = operation.options.ascii === true;
        data = ascii
          ? this.#kernel.exportStl(shapes[0]!, true)
          : this.#kernel.exportStl(shapes[0]!, false);
        break;
      }
      case 'gltf':
        data = this.#kernel.exportGltf(shapes);
        break;
    }

    return { kind: 'export', format: operation.format, data, warnings: [] };
  }

  #bodyResult(id: string, shape: CadKernelShape, quality: CadKernelQuality): CadKernelBodyResult {
    return {
      bodyId: id,
      mesh: this.#kernel.tessellate(shape, tessellationOptions(quality)),
      bounds: this.#kernel.bounds(shape),
    };
  }

  #evaluationError(error: unknown): CadKernelRuntimeError {
    if (error instanceof CadKernelRuntimeError) return error;
    if (error instanceof CadFeatureEvaluationError) {
      return new CadKernelRuntimeError('evaluation-failed', error.message, true, error.featureId);
    }
    const message = error instanceof Error ? error.message : String(error);
    return new CadKernelRuntimeError('evaluation-failed', message, true);
  }

  #releaseBodies(bodies: readonly WorkerBody[]): void {
    for (const body of bodies) this.#kernel.release(body.shape);
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('The OCCT worker request executor has been disposed.');
  }
}

export async function createOcctKernelRequestExecutor(
  options: OcctCadKernelAdapterOptions = {},
): Promise<OcctKernelRequestExecutor> {
  return new OcctKernelRequestExecutor(await createOcctCadKernelAdapter(options));
}
