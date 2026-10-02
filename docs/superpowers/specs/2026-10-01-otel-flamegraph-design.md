---
tool: otel-flamegraph
folder: src/tools/otel
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-otel-flamegraph-design.md
tracker: src/tools/otel/TRACKER.md
updated: 2026-10-01
---

# Trace Flamegraph — spec

As built at `6d38cd60` (last change under `src/tools/otel/`). Requirement prefix: `OTF`. Status of each requirement: [TRACKER.md](../../../src/tools/otel/TRACKER.md). Original design: "Tool 20" in [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md#tool-20--opentelemetry-flamegraph).

## Purpose

Open an exported OpenTelemetry or Jaeger trace in the browser and find where the time went, as a flamegraph with the critical path, filters and span details, for backend developers and SREs.

## Scope

In scope:
- OTLP JSON and Jaeger JSON trace files; one trace at a time from a file with several; flamegraph, filters, search, span table and span details.

Out of scope:
- Connecting to a live collector or tracing backend: that needs a server or credentials (platform rules).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- The trace is never altered (design).

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| OTF-R01 | Load an OTLP JSON (resource/scope spans, including the older instrumentation-library shape) or Jaeger JSON trace | Both formats normalize |
| OTF-R02 | Spans get a common model with parent/child links; orphaned parents are handled; spans with reused IDs stay separate per trace | Reused span IDs isolated by trace |
| OTF-R03 | Errors are flagged from status code, `error.type`, `exception.message` or an `error` attribute | Error spans flagged |
| OTF-R04 | A trace selector when the file holds several traces | Choosing a trace switches the view |
| OTF-R05 | The critical path uses self-time (child coverage subtracted) without double-counting nested durations | Critical-path tests pass |
| OTF-R06 | A canvas flamegraph, device-pixel-ratio aware, sized to its rendered width with a capped bitmap height | Canvas matches a narrow width; height capped |
| OTF-R07 | Zoom in, zoom out, fit timeline, keyboard `+`/`-` and arrows; ordinary wheel scrolling moves through lanes without zooming | Wheel scrolls lanes; zoom unchanged |
| OTF-R08 | Clicking a span selects it (hit testing) and focuses it in the details | Selected span shown |
| OTF-R09 | Services are identified by label and styling, and errors are marked without relying on colour | Error marker visible without colour |
| OTF-R10 | Filters: service, errors only, minimum latency; search over names and attributes | Filters narrow the spans |
| OTF-R11 | A paged span table navigable to each span | Table search reaches a span |
| OTF-R12 | Span details: service, duration, status, operation, trace and span IDs, parent, start and attributes | Details show those fields |
| OTF-R13 | Span details also show events and exception data (design) | A span with events and an exception shows both |
| OTF-R14 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| OTF-R15 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| OTF-R16 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |
| OTF-R17 | Load Zipkin JSON traces | Zipkin spans normalize to the common model |
| OTF-R18 | Compare two traces side by side with per-span duration differences | Differences shown for matching spans |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added OTF-R17, OTF-R18 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/otel/`, the shared design section and the tool's tests.
