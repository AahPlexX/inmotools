---
tool: subtitle-drift
folder: src/tools/subtitles
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-subtitle-drift-design.md
tracker: src/tools/subtitles/TRACKER.md
updated: 2026-10-01
---

# Subtitle Drift — tracker

## Resume here

On `origin/main`. 19 requirements: 12 verified, 4 implemented without a covering test, 3 missing. The catalog title promises waveform re-alignment (SUB-R15), which the tool does not have. Next action: owner decides whether to build SUB-R15 or change the title. No other blocker.

## Documents

- Spec: [2026-10-01-subtitle-drift-design.md](../../../docs/superpowers/specs/2026-10-01-subtitle-drift-design.md)
- Code: `subtitle-engine.ts` (parse, diagnostics, correction, serialize), `SubtitleWorkspace.tsx` (UI)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/subtitles.test.ts`; browser tests: `tests/e2e/subtitles.spec.ts`

## Requirement status

`unit` = `tests/unit/subtitles.test.ts`; `e2e` = `tests/e2e/subtitles.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SUB-R01 | verified | e2e "previews and applies drift correction…"; e2e "keeps the newest file or editor change…" | |
| SUB-R02 | verified | unit "parses SRT cues without losing text", "rejects malformed SRT blocks…"; e2e "reports malformed SRT blocks…" | |
| SUB-R03 | verified | unit "parses WebVTT millisecond separators and omitted hours", "round-trips named WebVTT cue identifiers, settings, STYLE, REGION, and NOTE blocks" | |
| SUB-R04 | verified | unit "rejects reversed cue timing in imported files" | |
| SUB-R05 | verified | unit "reports out-of-order starts and overlaps without rewriting cue order" | |
| SUB-R06 | verified | unit "accepts millisecond and readable timestamp anchors", "rejects non-finite and reversed anchors" | |
| SUB-R07 | verified | unit "applies a two-anchor linear correction across all timestamps" | |
| SUB-R08 | verified | unit "retimes WebVTT inline timestamp tags…", "rejects WebVTT inline timestamps that are invalid or collapse…" | |
| SUB-R09 | verified | unit "reports cues shifted below zero and refuses cues ending below zero" | |
| SUB-R10 | verified | e2e "previews and applies drift correction without mutating the original WebVTT source" | |
| SUB-R11 | implemented | — | |
| SUB-R12 | verified | e2e "keeps the newest file or editor change when an older file read completes later" | |
| SUB-R13 | implemented | — | |
| SUB-R14 | implemented | e2e checks the `.vtt` download name | SRT download name has no test; counted implemented until both formats are covered |
| SUB-R15 | missing | — | Promised by the catalog title; not built |
| SUB-R16 | verified | `tests/e2e/accessibility.spec.ts` route `subtitle-drift` | |
| SUB-R17 | implemented | — | No viewport test for this route |
| SUB-R18 | missing | — | Delivered through TASK-028 |
| SUB-R19 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: SUB-R19.
1. Owner decision on SUB-R15 (build the waveform or change the title).
2. Add tests for SUB-R11, R13, R14 (SRT), R17.
3. SUB-R18 with TASK-028.

## Known limitations

- One linear mapping for the whole file; subtitles with several separate edits (cuts) need correcting in parts.

## Verification evidence

- 2026-10-01, `main` @ `f5d3385e`: `tests/unit/subtitles.test.ts` 13/13; `tests/e2e/subtitles.spec.ts` 6 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added SUB-R19 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
