import { createBrowserCadKernelWorker } from '../../../src/tools/cad/cad-worker-factory';
import type { CadKernelResponse } from '../../../src/tools/cad/kernel-contract';
import { createCadProject } from '../../../src/tools/cad/project-engine';

const root = document.documentElement;
root.dataset.cadWorkerProof = 'pending';

const worker = createBrowserCadKernelWorker();
worker.onmessage = (event: MessageEvent<CadKernelResponse>) => {
  const response = event.data;
  root.dataset.cadWorkerProof = response.ok ? 'unexpected-success' : 'response';
  root.dataset.cadWorkerCode = response.ok ? 'ok' : response.error.code;
  root.dataset.cadWorkerRecoverable = response.ok ? 'false' : String(response.error.recoverable);
  worker.terminate();
};
worker.onerror = (event) => {
  root.dataset.cadWorkerProof = 'worker-error';
  root.dataset.cadWorkerCode = event.message || 'worker-error';
  worker.terminate();
};

worker.postMessage({
  revision: 1,
  project: createCadProject('Browser kernel proof'),
  quality: 'final',
  operation: { kind: 'rebuild', dirtyFeatureIds: [] },
});
