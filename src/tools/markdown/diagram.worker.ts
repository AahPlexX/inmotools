/// <reference lib="webworker" />
import { Graphviz } from '@hpcc-js/wasm-graphviz';
import type { DiagramRenderRequest, DiagramRenderResponse } from './markdown-types';

// Graphviz-only worker. Mermaid is deliberately not handled here: its
// renderer depends on real DOM elements internally and cannot execute
// inside a dedicated Worker, which has no DOM - see diagram-engine.ts for
// the main-thread Mermaid dispatch this worker does not attempt to
// duplicate.

let graphvizPromise: Promise<Graphviz> | null = null;
const loadGraphviz = (): Promise<Graphviz> => {
  if (!graphvizPromise) graphvizPromise = Graphviz.load();
  return graphvizPromise;
};

self.onmessage = async (event: MessageEvent<DiagramRenderRequest>) => {
  const { id, kind, source } = event.data;
  if (kind !== 'graphviz') return;
  try {
    const graphviz = await loadGraphviz();
    const svg = graphviz.layout(source, 'svg', 'dot');
    self.postMessage({ id, svg } satisfies DiagramRenderResponse);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Graphviz rendering failed.',
    } satisfies DiagramRenderResponse);
  }
};
