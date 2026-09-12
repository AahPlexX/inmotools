import type {
  CadKernelBodyResult,
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
        return this.#import(request);
      case 'export':
        return this.#export(request);
      case 'rebuild':
        throw new CadKernelRuntimeError(
          'evaluation-failed',
          'Parametric feature-tree rebuild is attached by the G6 exact feature evaluator.',
          true,
        );
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

  #import(request: CadKernelRequest & { operation: Extract<CadKernelRequest['operation'], { kind: 'import' }> }): CadKernelPayload {
    const bytes = new Uint8Array(request.operation.data);
    const shapes = request.operation.format === 'step'
      ? this.#kernel.importStep(bytes)
      : this.#kernel.importBrep(bytes);

    try {
      const bodyResults = shapes.map((shape, index) => this.#bodyResult(`import-${index + 1}`, shape, request.quality));
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

  #export(request: CadKernelRequest & { operation: Extract<CadKernelRequest['operation'], { kind: 'export' }> }): CadKernelPayload {
    if (this.#bodies.length === 0) {
      throw new CadKernelRuntimeError('export-failed', 'There are no exact worker-owned bodies to export.', true);
    }

    const shapes = this.#bodies.map((body) => body.shape);
    let data: string | Uint8Array;
    switch (request.operation.format) {
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
        const ascii = request.operation.options.ascii === true;
        data = ascii
          ? this.#kernel.exportStl(shapes[0]!, true)
          : this.#kernel.exportStl(shapes[0]!, false);
        break;
      }
      case 'gltf':
        data = this.#kernel.exportGltf(shapes);
        break;
    }

    return { kind: 'export', format: request.operation.format, data, warnings: [] };
  }

  #bodyResult(id: string, shape: CadKernelShape, quality: CadKernelQuality): CadKernelBodyResult {
    return {
      bodyId: id,
      mesh: this.#kernel.tessellate(shape, tessellationOptions(quality)),
      bounds: this.#kernel.bounds(shape),
    };
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
