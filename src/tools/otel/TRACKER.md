---
tool: otel-flamegraph
folder: src/tools/otel
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-otel-flamegraph-design.md
tracker: src/tools/otel/TRACKER.md
updated: 2026-10-04
---

# Trace Flamegraph — tracker

## Resume here

On `origin/main`. 18 requirements: 14 verified, 4 missing. Span details do not show span events or exception data, which the design asks for (OTF-R13); the engine does not keep events. Next action: build OTF-R13 and the other missing requirements (Open work).

## Documents

- Spec: [2026-10-01-otel-flamegraph-design.md](../../../docs/superpowers/specs/2026-10-01-otel-flamegraph-design.md)
- Original design: "Tool 20" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `otel-engine.ts`, `FlamegraphCanvas.tsx`, `OtelWorkspace.tsx`
- Task history: `.tasks/DONE.md` (flamegraph wheel/pan/zoom findings did not reproduce)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/otel.test.ts`; browser tests: `tests/e2e/otel.spec.ts`

## Requirement status

`unit` = `tests/unit/otel.test.ts`; `e2e` = `tests/e2e/otel.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| OTF-R01 | verified | unit "normalizes OTLP timing, hierarchy, and error state…", "accepts Jaeger JSON…" | |
| OTF-R02 | verified | unit "does not collide when two traces reuse the same span ID", "…safely handles an orphaned parent"; e2e "keeps reused span IDs isolated by trace…" | |
| OTF-R03 | verified | unit "normalizes OTLP timing, hierarchy, and error state…" | |
| OTF-R04 | verified | e2e "OTF-R04 choosing another trace switches the flamegraph, table and details" | |
| OTF-R05 | verified | unit "subtracts direct child coverage from parent self-time", "does not double-count nested inclusive durations…" | |
| OTF-R06 | verified | e2e "matches the backing canvas to a narrow rendered width and caps vertical bitmap allocation" | |
| OTF-R07 | verified | e2e "ordinary wheel scrolling reaches later lanes without changing timeline zoom", "OTF-R07 zoom buttons, + and - keys, Home and arrow keys change the timeline and selection" | |
| OTF-R08 | verified | e2e "OTF-R08 clicking a span on the flamegraph selects it and shows it in the details" | |
| OTF-R09 | verified | e2e "OTF-R09 services get distinct styling and labels, and errors are marked in text" | |
| OTF-R10 | verified | e2e "OTF-R10 service, errors-only, minimum-latency and attribute search filters narrow the spans" | |
| OTF-R11 | verified | e2e "…exposes searchable span navigation" | |
| OTF-R12 | verified | e2e "OTF-R12 span details show service, duration, status, operation, IDs, parent, start and attributes" | |
| OTF-R13 | missing | — | Events and exception data are not parsed or shown |
| OTF-R14 | verified | `tests/e2e/accessibility.spec.ts` route `otel-flamegraph` | |
| OTF-R15 | verified | e2e "OTF-R15 lays out without horizontal overflow at <width> px" (320, 375, 768, 1024, 1440, 1920, 2560) | |
| OTF-R16 | missing | — | Delivered through TASK-028 |
| OTF-R17 | missing | — | Added 2026-10-02 |
| OTF-R18 | missing | — | Added 2026-10-02 |

## Open work

1. Build the requirements added 2026-10-02: OTF-R17, OTF-R18.
2. Build OTF-R13 (keep span events in the engine; show events and exception fields).
3. OTF-R16 with TASK-028.

## Known limitations

- Large traces are bounded by the capped canvas height and paged span table.

## Verification evidence

- 2026-10-04, `expand/otel-flamegraph`: `pnpm build` clean; `PW_PORT=4202 pnpm exec playwright test tests/e2e/otel.spec.ts --repeat-each=3` 72 passed, 24 skipped (mobile wheel and viewport-matrix cases skipped by design), desktop and mobile.
- 2026-10-01, `main` @ `744907c3`: `tests/unit/otel.test.ts` 5/5; `tests/e2e/otel.spec.ts` 5 passed / 1 skipped; accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Tests added for OTF-R04, R07 (zoom buttons and keys), R08, R09, R10 (filters), R12, R15 (7 widths); those rows verified.
- 2026-10-02 — Added OTF-R17, OTF-R18 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
