import { probeOcctWasmCapabilities } from './browser-capabilities';
import {
  createOcctWasmInitializer,
  type CadKernelCapabilityProbe,
} from './kernel-capabilities';
import type { CadKernelPayload, CadKernelRequest, CadKernelResponse } from './kernel-contract';
import {
  CadKernelWorkerRuntime,
  type CadKernelWorkerRuntimePort,
} from './kernel-worker-runtime';
import {
  createOcctKernelRequestExecutor,
  type OcctKernelRequestExecutor,
} from './occt-worker-executor';

export interface CadKernelWorkerScope extends CadKernelWorkerRuntimePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(response: CadKernelResponse, transfer?: Transferable[]): void;
}

export interface CadKernelWorkerExecutorLike {
  execute(request: CadKernelRequest): CadKernelPayload | Promise<CadKernelPayload>;
  dispose(): void;
}

export interface CadKernelWorkerDependencies {
  probeCapabilities?: CadKernelCapabilityProbe;
  createExecutor?: () => CadKernelWorkerExecutorLike | Promise<CadKernelWorkerExecutorLike>;
}

function defaultExecutorFactory(): Promise<OcctKernelRequestExecutor> {
  return createOcctKernelRequestExecutor();
}

/**
 * Installs the exact CAD protocol on one dedicated browser worker. Capability
 * detection runs before any OCCT initialization, and CadKernelWorkerRuntime
 * memoizes the resulting request executor for the lifetime of this worker.
 */
export function installCadKernelWorker(
  scope: CadKernelWorkerScope,
  dependencies: CadKernelWorkerDependencies = {},
): CadKernelWorkerRuntime {
  const probeCapabilities = dependencies.probeCapabilities ?? probeOcctWasmCapabilities;
  const createExecutor = dependencies.createExecutor ?? defaultExecutorFactory;

  const initialize = createOcctWasmInitializer(probeCapabilities, async () => {
    const executor = await createExecutor();
    return (request: CadKernelRequest) => executor.execute(request);
  });

  const runtime = new CadKernelWorkerRuntime(scope, initialize);
  scope.onmessage = async (event) => {
    await runtime.handle(event.data);
  };
  return runtime;
}

function isDedicatedWorkerRuntime(value: typeof globalThis): boolean {
  const candidate = value as typeof globalThis & {
    importScripts?: unknown;
    postMessage?: unknown;
    document?: unknown;
  };
  return (
    typeof candidate.importScripts === 'function'
    && typeof candidate.postMessage === 'function'
    && candidate.document === undefined
  );
}

if (isDedicatedWorkerRuntime(globalThis)) {
  installCadKernelWorker(globalThis as unknown as CadKernelWorkerScope);
}
