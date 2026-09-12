import type { DiagramRenderRequest, DiagramRenderResponse } from './markdown-types';

// Mermaid dispatch runs on the main thread by necessity: Mermaid's renderer
// creates and measures real DOM elements internally. Keep the input bounded,
// remove trailing whitespace that is semantically irrelevant to Mermaid, and
// schedule required work with an explicit timeout so it cannot wait forever
// for an idle period.

export const MAX_MERMAID_SOURCE_CHARS = 50_000;
const REQUIRED_IDLE_TIMEOUT_MS = 500;
const GANTT_TASK_TAGS = new Set(['active', 'done', 'crit', 'milestone', 'vert']);

export interface MermaidRenderResult {
  readonly svg: string;
  readonly diagramType?: string;
  readonly bindFunctions?: (element: Element) => void;
}

export type MermaidRenderFn = (id: string, source: string) => Promise<MermaidRenderResult>;

export type PreparedMermaidSource =
  | { readonly ok: true; readonly source: string }
  | { readonly ok: false; readonly error: string };

export const prepareMermaidSource = (source: string): PreparedMermaidSource => {
  // Mermaid syntax does not require trailing whitespace. Removing it prevents
  // large pasted whitespace tails from becoming parser work while preserving
  // meaningful whitespace inside labels and diagram statements.
  const prepared = source.trimEnd();
  if (prepared.length > MAX_MERMAID_SOURCE_CHARS) {
    return {
      ok: false,
      error: `Mermaid diagram is too large (${prepared.length.toLocaleString()} characters). The limit is ${MAX_MERMAID_SOURCE_CHARS.toLocaleString()} characters.`,
    };
  }
  return { ok: true, source: prepared };
};

const findInvalidGanttMetadataLine = (source: string): number | undefined => {
  if (!/^\s*gantt\b/m.test(source)) return undefined;

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const separator = lines[index].indexOf(':');
    if (separator < 0) continue;

    const metadata = lines[index].slice(separator + 1).split(',').map((item) => item.trim());
    while (metadata.length > 0 && GANTT_TASK_TAGS.has(metadata[0])) metadata.shift();
    if (metadata.length > 3) return index + 1;
  }
  return undefined;
};

export const renderMermaidDiagram = async (
  render: MermaidRenderFn,
  id: string,
  source: string,
): Promise<MermaidRenderResult | { error: string }> => {
  const prepared = prepareMermaidSource(source);
  if (!prepared.ok) return { error: prepared.error };

  // Mermaid 12.0.0 still accepts Gantt task rows with more metadata fields than
  // its renderer can compile, then throws an internal TypeError. Detect that
  // exact malformed row before dispatch so authors get a useful source line.
  const invalidGanttLine = findInvalidGanttMetadataLine(prepared.source);
  if (invalidGanttLine !== undefined) {
    return {
      error: `Mermaid Gantt task on line ${invalidGanttLine} has too many metadata items. Use at most an id, a start value, and an end/duration value after optional task tags.`,
    };
  }

  try {
    return await render(id, prepared.source);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Mermaid rendering failed.' };
  }
};

// requestIdleCallback is not implemented in every browser. Required preview
// work gets a timeout per MDN guidance and every scheduled callback exposes a
// cancellation handle so superseded renders do not accumulate queued work.
export const scheduleIdle = (callback: () => void): (() => void) => {
  const withIdle = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof withIdle.requestIdleCallback === 'function') {
    const id = withIdle.requestIdleCallback(callback, { timeout: REQUIRED_IDLE_TIMEOUT_MS });
    return () => withIdle.cancelIdleCallback?.(id);
  }

  const id = setTimeout(callback, 0);
  return () => clearTimeout(id);
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
