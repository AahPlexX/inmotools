export type NormalizedSpan = { traceId: string; spanId: string; parentSpanId?: string; name: string; serviceName: string; startMs: number; durationMs: number; error: boolean; attributes: Record<string, unknown> };
export type SpanTreeNode = { span: NormalizedSpan; children: SpanTreeNode[] };

function otelValue(value: any): unknown {
  if (!value || typeof value !== 'object') return value;
  for (const key of ['stringValue','intValue','doubleValue','boolValue','bytesValue']) if (key in value) return value[key];
  if (value.arrayValue?.values) return value.arrayValue.values.map(otelValue);
  if (value.kvlistValue?.values) return Object.fromEntries(value.kvlistValue.values.map((item: any) => [item.key, otelValue(item.value)]));
  return value;
}
const attributes = (items: any[] = []) => Object.fromEntries(items.map((item) => [String(item.key), otelValue(item.value)]));
function nanosToMs(value: string | number | bigint): number { const nanos = BigInt(value); return Number(nanos / 1_000_000n) + Number(nanos % 1_000_000n) / 1_000_000; }

function parseOtlp(input: any): NormalizedSpan[] {
  const spans: NormalizedSpan[] = [];
  for (const resourceSpan of input.resourceSpans ?? []) {
    const resourceAttributes = attributes(resourceSpan.resource?.attributes ?? []);
    const serviceName = String(resourceAttributes['service.name'] ?? 'unknown-service');
    for (const group of resourceSpan.scopeSpans ?? resourceSpan.instrumentationLibrarySpans ?? []) {
      for (const span of group.spans ?? []) {
        const attrs = attributes(span.attributes ?? []);
        const start = nanosToMs(span.startTimeUnixNano ?? 0); const end = nanosToMs(span.endTimeUnixNano ?? span.startTimeUnixNano ?? 0);
        spans.push({ traceId: String(span.traceId ?? ''), spanId: String(span.spanId ?? ''), parentSpanId: span.parentSpanId ? String(span.parentSpanId) : undefined, name: String(span.name ?? 'unnamed span'), serviceName, startMs: start, durationMs: Math.max(0, end - start), error: Number(span.status?.code ?? 0) === 2 || 'error.type' in attrs || 'exception.message' in attrs || attrs.error === true, attributes: attrs });
      }
    }
  }
  return spans;
}

function parseJaeger(input: any): NormalizedSpan[] {
  const spans: NormalizedSpan[] = [];
  for (const trace of input.data ?? []) for (const span of trace.spans ?? []) {
    const process = trace.processes?.[span.processID] ?? {};
    const tags = Object.fromEntries((span.tags ?? []).map((tag: any) => [String(tag.key), tag.value]));
    const childOf = (span.references ?? []).find((reference: any) => String(reference.refType ?? '').toUpperCase() === 'CHILD_OF');
    const status = Number(tags['http.status_code'] ?? tags['http.response.status_code'] ?? 0);
    spans.push({ traceId: String(span.traceID ?? trace.traceID ?? ''), spanId: String(span.spanID ?? ''), parentSpanId: childOf?.spanID ? String(childOf.spanID) : undefined, name: String(span.operationName ?? 'unnamed span'), serviceName: String(process.serviceName ?? 'unknown-service'), startMs: Number(span.startTime ?? 0) / 1000, durationMs: Math.max(0, Number(span.duration ?? 0) / 1000), error: tags.error === true || status >= 500, attributes: tags });
  }
  return spans;
}

export function parseTraceExport(input: any) {
  const spans = Array.isArray(input?.resourceSpans) ? parseOtlp(input) : parseJaeger(input);
  const base = spans.length ? Math.min(...spans.map((span) => span.startMs)) : 0;
  return { spans: spans.map((span) => ({ ...span, startMs: span.startMs - base })).sort((a, b) => a.startMs - b.startMs || a.spanId.localeCompare(b.spanId)) };
}

export function buildSpanTree(spans: NormalizedSpan[]): SpanTreeNode[] {
  const nodes = new Map(spans.map((span) => [span.spanId, { span, children: [] as SpanTreeNode[] }]));
  const roots: SpanTreeNode[] = [];
  for (const span of spans) { const node = nodes.get(span.spanId)!; const parent = span.parentSpanId ? nodes.get(span.parentSpanId) : undefined; if (parent && parent !== node) parent.children.push(node); else roots.push(node); }
  const sortNodes = (items: SpanTreeNode[]) => { items.sort((a, b) => a.span.startMs - b.span.startMs || a.span.spanId.localeCompare(b.span.spanId)); items.forEach((item) => sortNodes(item.children)); };
  sortNodes(roots); return roots;
}

function longestPath(node: SpanTreeNode): { score: number; path: string[] } {
  if (!node.children.length) return { score: node.span.durationMs, path: [node.span.spanId] };
  const best = node.children.map(longestPath).sort((a, b) => b.score - a.score || a.path.join(':').localeCompare(b.path.join(':')))[0];
  return { score: node.span.durationMs + best.score, path: [node.span.spanId, ...best.path] };
}
export function computeCriticalPath(spans: NormalizedSpan[]): string[] { const roots = buildSpanTree(spans); return roots.length ? roots.map(longestPath).sort((a, b) => b.score - a.score || a.path.join(':').localeCompare(b.path.join(':')))[0].path : []; }
