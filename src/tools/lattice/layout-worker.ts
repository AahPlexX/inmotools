import ELK from 'elkjs/lib/elk.bundled.js';
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

const elk = new ELK();

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<LatticeLayoutWorkerRequest>) => void) | null;
  postMessage: (message: LatticeLayoutWorkerResponse) => void;
};

workerScope.onmessage = (event): void => {
  const { requestId, graph, direction } = event.data;
  void elk.layout(buildElkGraph(graph, direction)).then((result) => {
    workerScope.postMessage({ requestId, ok: true, layout: normalizeElkLayout(result) });
  }).catch((error: unknown) => {
    workerScope.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Graph layout failed.',
    });
  });
};
