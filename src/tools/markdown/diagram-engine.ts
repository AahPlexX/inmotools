import type { DiagramRenderRequest, DiagramRenderResponse } from './markdown-types';

// Mermaid dispatch runs on the main thread by necessity: Mermaid's renderer
// creates and measures real DOM elements internally. Keep the input bounded,
// remove trailing whitespace that is semantically irrelevant to Mermaid, and
// schedule required work with an explicit timeout so it cannot wait forever
// for an idle period.

export const MAX_MERMAID_SOURCE_CHARS = 50_000;
export const MAX_MERMAID_FLOWCHART_LINES = 4_000;
const REQUIRED_IDLE_TIMEOUT_MS = 500;
const GANTT_TASK_TAGS = new Set(['active', 'done', 'crit', 'milestone', 'vert']);
const GANTT_DIRECTIVE = /^(?:gantt\b|title\b|dateFormat\b|inclusiveEndDates\b|topAxis\b|axisFormat\b|tickInterval\b|includes\b|excludes\b|todayMarker\b|weekday\b|weekend\b|section\b|accTitle\b|accDescr\b|click\b)/i;

export interface MermaidRenderResult {
  readonly svg: string;
  readonly diagramType?: string;
  readonly bindFunctions?: (element: Element) => void;
}

export type MermaidRenderFn = (id: string, source: string) => Promise<MermaidRenderResult>;

export type PreparedMermaidSource =
  | { readonly ok: true; readonly source: string }
  | { readonly ok: false; readonly error: string };

const isFlowchartSource = (source: string): boolean =>
  /(?:^|\n)\s*(?:flowchart|graph)\b/i.test(source);

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

  // Mermaid 12 groups horizontal whitespace runs, but its legacy Jison
  // flowchart parser can still scale quadratically with very high token/line
  // counts. Bound only flowcharts at an intentionally high line count so
  // normal large diagrams remain available while pathological inputs cannot
  // monopolize the UI thread.
  if (isFlowchartSource(prepared)) {
    const lineCount = prepared.split(/\r\n|\r|\n/).length;
    if (lineCount > MAX_MERMAID_FLOWCHART_LINES) {
      return {
        ok: false,
        error: `Mermaid flowchart has too many lines (${lineCount.toLocaleString()}). The limit is ${MAX_MERMAID_FLOWCHART_LINES.toLocaleString()} lines to prevent pathological parser work.`,
      };
    }
  }

  return { ok: true, source: prepared };
};

const firstMermaidStatement = (source: string): string | undefined => {
  const lines = source.split(/\r?\n/);
  let inFrontmatter = false;
  let canOpenFrontmatter = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (canOpenFrontmatter && trimmed === '---') {
      inFrontmatter = true;
      canOpenFrontmatter = false;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
      continue;
    }

    canOpenFrontmatter = false;
    if (trimmed.startsWith('%%')) continue;
    return trimmed;
  }

  return undefined;
};

const isGanttSource = (source: string): boolean => /^gantt\b/i.test(firstMermaidStatement(source) ?? '');

const findInvalidGanttMetadataLine = (source: string): number | undefined => {
  if (!isGanttSource(source)) return undefined;

  const lines = source.split(/\r?\n/);
  let inFrontmatter = false;
  let frontmatterClosed = false;
  let inAccDescr = false;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    if (index === 0 && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === '---') {
        inFrontmatter = false;
        frontmatterClosed = true;
      }
      continue;
    }
    if (!frontmatterClosed && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }

    if (inAccDescr) {
      if (trimmed.includes('}')) inAccDescr = false;
      continue;
    }
    if (/^accDescr\s*\{/i.test(trimmed)) {
      inAccDescr = !trimmed.includes('}');
      continue;
    }
    if (!trimmed || trimmed.startsWith('%%') || GANTT_DIRECTIVE.test(trimmed)) continue;

    const separator = lines[index].indexOf(':');
    if (separator < 0) continue;

    const metadata = lines[index].slice(separator + 1).split(',').map((item) => item.trim());
    while (metadata.length > 0 && GANTT_TASK_TAGS.has(metadata[0])) metadata.shift();
    if (metadata.length > 3) return index + 1;
  }
  return undefined;
};

const ganttMetadataError = (line: number): { error: string } => ({
  error: `Mermaid Gantt task on line ${line} has too many metadata items. Use at most an id, a start value, and an end/duration value after optional task tags.`,
});

export const renderMermaidDiagram = async (
  render: MermaidRenderFn,
  id: string,
  source: string,
): Promise<MermaidRenderResult | { error: string }> => {
  const prepared = prepareMermaidSource(source);
  if (!prepared.ok) return { error: prepared.error };

  // Mermaid 12.0.0 can accept malformed Gantt task rows far enough to enter
  // unstable renderer code. The grammar has a strict upper bound of three
  // non-tag metadata items, so reject only that impossible task shape before
  // invoking Mermaid. Directive/frontmatter lines are excluded by the scanner.
  const invalidGanttLine = findInvalidGanttMetadataLine(prepared.source);
  if (invalidGanttLine !== undefined) return ganttMetadataError(invalidGanttLine);

  try {
    return await render(id, prepared.source);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mermaid rendering failed.';
    return { error: message };
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
