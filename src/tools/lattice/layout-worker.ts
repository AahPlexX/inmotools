import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { LatticeGraphModel } from './graph-engine';
import { buildElkGraph, normalizeElkLayout, type LatticeLayoutDirection, type LatticeLayoutModel } from './layout-engine';

export interface LatticeLayoutWorkerRequest {
  readonly requestId: number;
  readonly graph: LatticeGraphModel;
  readonly direction: LatticeLayoutDirection;
}

export type LatticeLayoutWorkerResponse =
  | { readonly requestId: number; readonly ok: true; readonly layout: LatticeLayoutModel }
  | { readonly requestId: number; readonly ok: false; readonly error: string };

export interface LatticeLayoutWorkerClient {
  layout: (request: LatticeLayoutWorkerRequest) => Promise<LatticeLayoutWorkerResponse>;
  terminate: () => void;
}

export const createLatticeLayoutWorkerClient = (): LatticeLayoutWorkerClient => {
  const elk = new ELK({
    algorithms: ['layered'],
    workerFactory: () => new Worker(elkWorkerUrl),
  });

  return {
    layout: async ({ requestId, graph, direction }) => {
      try {
        const result = await elk.layout(buildElkGraph(graph, direction));
        return { requestId, ok: true, layout: normalizeElkLayout(result) };
      } catch (error) {
        return {
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : 'Graph layout failed.',
        };
      }
    },
    terminate: () => elk.terminateWorker(),
  };
};
