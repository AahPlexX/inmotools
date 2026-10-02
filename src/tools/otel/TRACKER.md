---
tool: otel-flamegraph
folder: src/tools/otel
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-otel-flamegraph-design.md
tracker: src/tools/otel/TRACKER.md
updated: 2026-10-01
---

# Trace Flamegraph — tracker

## Resume here

On `origin/main`. 18 requirements: 7 verified, 7 implemented without a covering test, 4 missing Span details do not show span events or exception data, which the design asks for (OTF-R13); the engine does not keep events. Next action: build OTF-R13 and add tests for the `implemented` rows.

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
| OTF-R04 | implemented | — | |
| OTF-R05 | verified | unit "subtracts direct child coverage from parent self-time", "does not double-count nested inclusive durations…" | |
| OTF-R06 | verified | e2e "matches the backing canvas to a narrow rendered width and caps vertical bitmap allocation" | |
| OTF-R07 | implemented | e2e "ordinary wheel scrolling reaches later lanes without changing timeline zoom" | Zoom buttons and keys have no test |
| OTF-R08 | implemented | — | |
| OTF-R09 | implemented | — | |
| OTF-R10 | implemented | e2e "…exposes searchable span navigation" covers search | Service, errors-only and latency filters have no test |
| OTF-R11 | verified | e2e "…exposes searchable span navigation" | |
| OTF-R12 | implemented | — | |
| OTF-R13 | missing | — | Events and exception data are not parsed or shown |
| OTF-R14 | verified | `tests/e2e/accessibility.spec.ts` route `otel-flamegraph` | |
| OTF-R15 | implemented | — | No viewport test for this route |
| OTF-R16 | missing | — | Delivered through TASK-028 |
| OTF-R17 | missing | — | Added 2026-10-02 |
| OTF-R18 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: OTF-R17, OTF-R18.
1. Build OTF-R13 (keep span events in the engine; show events and exception fields).
2. Add tests for OTF-R04, R07 (zoom), R08, R09, R10 (filters), R12, R15.
3. OTF-R16 with TASK-028.

## Known limitations

- Large traces are bounded by the capped canvas height and paged span table.

## Verification evidence

- 2026-10-01, `main` @ `744907c3`: `tests/unit/otel.test.ts` 5/5; `tests/e2e/otel.spec.ts` 5 passed / 1 skipped; accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added OTF-R17, OTF-R18 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
