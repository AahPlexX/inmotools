import {
  assertKernelRequest,
  collectKernelTransferables,
  createKernelFailure,
  type CadKernelErrorCode,
  type CadKernelPayload,
  type CadKernelRequest,
  type CadKernelResponse,
} from './kernel-contract';

export interface CadKernelWorkerRuntimePort {
  postMessage(response: CadKernelResponse, transfer?: Transferable[]): void;
}

export type CadKernelRequestExecutor = (
  request: CadKernelRequest,
) => CadKernelPayload | Promise<CadKernelPayload>;

export type CadKernelRuntimeInitializer = () =>
  | CadKernelRequestExecutor
  | Promise<CadKernelRequestExecutor>;

export class CadKernelRuntimeError extends Error {
  readonly code: CadKernelErrorCode;
  readonly recoverable: boolean;
  readonly featureId?: string;

  constructor(code: CadKernelErrorCode, message: string, recoverable: boolean, featureId?: string) {
    super(message);
    this.name = 'CadKernelRuntimeError';
    this.code = code;
    this.recoverable = recoverable;
    this.featureId = featureId;
  }
}

function safeRevision(input: unknown): number {
  if (!input || typeof input !== 'object' || !('revision' in input)) return 0;
  const revision = (input as { revision?: unknown }).revision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function operationFailureCode(request: CadKernelRequest): CadKernelErrorCode {
  switch (request.operation.kind) {
    case 'import':
      return 'import-failed';
    case 'export':
      return 'export-failed';
    case 'measure':
    case 'rebuild':
      return 'evaluation-failed';
  }
}

function expectedPayloadKind(request: CadKernelRequest): CadKernelPayload['kind'] {
  return request.operation.kind;
}

/**
 * Worker-side protocol runtime. It owns no OpenCascade-specific code; instead
 * it lazily initializes one request executor supplied by the exact-kernel
 * adapter. This keeps transport/error semantics independently testable and
 * lets a hard worker restart recreate the entire native-kernel lifetime.
 */
export class CadKernelWorkerRuntime {
  readonly #port: CadKernelWorkerRuntimePort;
  readonly #initialize: CadKernelRuntimeInitializer;
  #executorPromise: Promise<CadKernelRequestExecutor> | null = null;

  constructor(port: CadKernelWorkerRuntimePort, initialize: CadKernelRuntimeInitializer) {
    this.#port = port;
    this.#initialize = initialize;
  }

  async handle(input: unknown): Promise<void> {
    const fallbackRevision = safeRevision(input);
    let request: CadKernelRequest;
    try {
      request = assertKernelRequest(input as CadKernelRequest);
    } catch (error) {
      this.#post(createKernelFailure(fallbackRevision, error, 'invalid-request', true));
      return;
    }

    let execute: CadKernelRequestExecutor;
    try {
      execute = await this.#executor();
    } catch (error) {
      this.#post(this.#failureFromInitialization(request.revision, error));
      return;
    }

    try {
      const payload = await execute(request);
      if (!payload || payload.kind !== expectedPayloadKind(request)) {
        throw new CadKernelRuntimeError(
          operationFailureCode(request),
          `Kernel executor returned '${String(payload?.kind)}' for '${request.operation.kind}' request.`,
          true,
        );
      }
      this.#post({ revision: request.revision, ok: true, payload });
    } catch (error) {
      if (error instanceof CadKernelRuntimeError) {
        this.#post(createKernelFailure(request.revision, error, error.code, error.recoverable, error.featureId));
        return;
      }
      this.#post(createKernelFailure(request.revision, error, operationFailureCode(request), true));
    }
  }

  #executor(): Promise<CadKernelRequestExecutor> {
    if (!this.#executorPromise) {
      this.#executorPromise = Promise.resolve().then(() => this.#initialize());
    }
    return this.#executorPromise;
  }

  #failureFromInitialization(revision: number, error: unknown): CadKernelResponse {
    if (error instanceof CadKernelRuntimeError) {
      return createKernelFailure(revision, error, error.code, error.recoverable, error.featureId);
    }
    return createKernelFailure(revision, error, 'kernel-init', false);
  }

  #post(response: CadKernelResponse): void {
    this.#port.postMessage(response, collectKernelTransferables(response));
  }
}
