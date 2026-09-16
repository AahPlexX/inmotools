import type { CadProject } from './cad-types';
import type {
  CadKernelOperation,
  CadKernelQuality,
  CadKernelRequest,
  CadKernelResponse,
} from './kernel-contract';
import { CadKernelSession, type CadKernelRestartState } from './kernel-session';

export interface CadKernelWorkerLike {
  onmessage: ((event: MessageEvent<CadKernelResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

export type CadKernelWorkerFactory = () => CadKernelWorkerLike;

export interface CadKernelWorkerClientOptions {
  onResponse(response: CadKernelResponse): void;
  onWorkerError?(event: ErrorEvent): void;
}

function requestTransferables(operation: CadKernelOperation): Transferable[] {
  return operation.kind === 'import' ? [operation.data] : [];
}

/**
 * Owns the replaceable browser worker transport while CadKernelSession owns
 * commit eligibility. A worker is permanently associated with the generation
 * in which it was created, so late messages remain stale even after restart.
 */
export class CadKernelWorkerClient {
  readonly #factory: CadKernelWorkerFactory;
  readonly #options: CadKernelWorkerClientOptions;
  readonly #session = new CadKernelSession();
  #worker: CadKernelWorkerLike;
  #disposed = false;

  constructor(factory: CadKernelWorkerFactory, options: CadKernelWorkerClientOptions) {
    this.#factory = factory;
    this.#options = options;
    this.#worker = this.#createWorker(this.#session.snapshot().generation);
  }

  request(project: CadProject, quality: CadKernelQuality, operation: CadKernelOperation): CadKernelRequest {
    this.#assertActive();
    const issued = this.#session.issue(project, quality, operation);
    this.#worker.postMessage(issued.request, requestTransferables(operation));
    return issued.request;
  }

  invalidate(): number {
    this.#assertActive();
    return this.#session.invalidate();
  }

  restart(): CadKernelRestartState {
    this.#assertActive();
    this.#worker.terminate();
    const state = this.#session.restart();
    this.#worker = this.#createWorker(state.generation);
    return state;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#worker.terminate();
    this.#session.restart();
  }

  #createWorker(generation: number): CadKernelWorkerLike {
    const worker = this.#factory();
    worker.onmessage = (event) => {
      if (this.#disposed) return;
      if (this.#session.accept(generation, event.data)) this.#options.onResponse(event.data);
    };
    worker.onerror = (event) => {
      if (this.#disposed) return;
      if (generation !== this.#session.snapshot().generation) return;
      this.#options.onWorkerError?.(event);
    };
    return worker;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('CAD kernel worker client has been disposed.');
  }
}
