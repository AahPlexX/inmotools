import { createBrowserCadKernelWorker } from '../../../src/tools/cad/cad-worker-factory';

const worker = createBrowserCadKernelWorker();
worker.terminate();
