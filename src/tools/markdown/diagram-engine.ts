import type { DiagramRenderRequest, DiagramRenderResponse } from './markdown-types';

// Mermaid dispatch runs on the main thread by necessity: Mermaid's renderer
// creates and measures real DOM elements internally, and a dedicated Worker
// has no DOM available to it. To avoid blocking typing responsiveness,
// callers are expected to debounce and schedule this during browser idle
// time (see scheduleIdle below) rather than calling it synchronously on
// every keystroke.
//
// The actual mermaid.render call is injected as a parameter (rather than
// imported directly and called here) so this module's scheduling and error
// handling logic is unit-testable without loading the real Mermaid library,
// which requires a browser-like environment this project's plain Vitest
// setup does not provide.

export type MermaidRenderFn = (id: string, source: string) => Promise<{ svg: string }>;

export const renderMermaidDiagram = async (
  render: MermaidRenderFn,
  id: string,
  source: string,
): Promise<{ svg?: string; error?: string }> => {
  try {
    const result = await render(id, source);
    return { svg: result.svg };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Mermaid rendering failed.' };
  }
};

// requestIdleCallback is not implemented in every browser; fall back to a
// short setTimeout so idle-scheduled work still eventually runs.
export const scheduleIdle = (callback: () => void): void => {
  const withIdle = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void) => number;
  };
  if (typeof withIdle.requestIdleCallback === 'function') {
    withIdle.requestIdleCallback(callback);
  } else {
    setTimeout(callback, 0);
  }
};

// Graphviz-only Worker orchestration. Mirrors the request/response
// correlation and main-thread synchronous fallback pattern already used by
// this catalog's other Worker-backed tools (see dedupe.worker.ts,
// floorplan-worker.ts): a unique request id is generated per call, the
// Worker is created fresh per request and terminated once its response
// arrives, and cancel() exposes that same termination so an in-flight
// render can be abandoned by the caller.

export interface GraphvizRenderHandle {
  readonly promise: Promise<DiagramRenderResponse>;
  cancel(): void;
}

export const renderGraphvizDiagram = (source: string): GraphvizRenderHandle => {
  const id = crypto.randomUUID();
  const worker = new Worker(new URL('./diagram.worker.ts', import.meta.url), { type: 'module' });

  const promise = new Promise<DiagramRenderResponse>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<DiagramRenderResponse>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Graphviz worker failed.'));
    };
    const request: DiagramRenderRequest = { id, kind: 'graphviz', source };
    worker.postMessage(request);
  });

  return {
    promise,
    cancel: () => worker.terminate(),
  };
};
