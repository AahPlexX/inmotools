import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "otel-flamegraph",
  category: "developer",
  shortTitle: "Trace Flamegraph",
  title: "OpenTelemetry & Jaeger Trace Flamegraph Explorer",
  audience: "Site reliability engineers · backend developers · platform teams",
  summary: "Normalize local OTLP or Jaeger trace exports, explore span latency and hierarchy, filter services/errors, and follow a clearly marked critical path.",
  privacy: "Trace IDs, attributes, timing, and errors are processed only inside your browser and are never sent to a telemetry service.",
  accepts: "OTLP JSON resource spans and Jaeger JSON trace exports",
  outputs: "Interactive local flamegraph, span details, filters, and critical-path analysis",
  steps: [
    "Choose an OTLP or Jaeger JSON trace export.",
    "Filter by service, error state, or minimum latency and navigate the flamegraph.",
    "Select spans to inspect IDs, timing, hierarchy, and attributes while following ◆ critical-path markers.",
  ],
  hint: "Critical-path highlighting is an analysis aid based on the imported span relationships and timing; incomplete or sampled traces may omit causal work.",
  load: () => import('./OtelWorkspace'),
} satisfies ToolMeta;
