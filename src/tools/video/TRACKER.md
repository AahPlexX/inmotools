---
tool: video-keyframe-slicer
folder: src/tools/video
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-video-keyframe-slicer-design.md
tracker: src/tools/video/TRACKER.md
updated: 2026-10-01
---

# Keyframe Video Slicer — tracker

## Resume here

On `origin/main`. 14 requirements: 5 verified, 6 implemented without a covering test, 3 missing. The design's visual timeline with keyframe markers (KVS-R10) is not built; the keyframe list stands in for it. No browser test loads a video. Next action: build KVS-R10 and add a browser test with a small fixture video.

## Documents

- Spec: [2026-10-01-video-keyframe-slicer-design.md](../../../docs/superpowers/specs/2026-10-01-video-keyframe-slicer-design.md)
- Original design: "Tool 12" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `video-engine.ts` (inspection, snapping, packet export), `VideoWorkspace.tsx` (UI)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/video.test.ts`, `tests/unit/video-audit-regressions.test.ts`; browser test: `tests/e2e/video.spec.ts`

## Requirement status

`unit` = `tests/unit/video.test.ts`; `audit` = `tests/unit/video-audit-regressions.test.ts`; `e2e` = `tests/e2e/video.spec.ts` "explains exact selected-track preview policy and reflows across target viewports".

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| KVS-R01 | implemented | — | |
| KVS-R02 | implemented | — | |
| KVS-R03 | verified | unit "snaps the start backward and the end forward…", "clamps requests to media bounds…", "rejects inverted ranges and media without a usable keyframe" | |
| KVS-R04 | implemented | — | |
| KVS-R05 | implemented | unit "navigates the complete verified keyframe sequence in either direction" covers the helper | UI buttons have no test |
| KVS-R06 | implemented | — | |
| KVS-R07 | verified | e2e (policy text) | Previews with a loaded file have no test |
| KVS-R08 | implemented | — | No test exports a real file |
| KVS-R09 | verified | audit "keeps every audio packet that starts before the exclusive trim end", "reads source rotation…", "does not use the packet at range.end…" | |
| KVS-R10 | missing | — | Design requirement; only a keyframe table exists |
| KVS-R11 | missing | — | Optional in the design; buildable, so kept under the default integration rule |
| KVS-R12 | verified | e2e axe check; `tests/e2e/accessibility.spec.ts` route `video-keyframe-slicer` | |
| KVS-R13 | verified | e2e (overflow at each viewport) | |
| KVS-R14 | missing | — | Delivered through TASK-028 |

## Open work

1. Build KVS-R10 (timeline with keyframe markers), then KVS-R11.
2. Add a browser test with a small fixture video covering KVS-R01, R02, R04–R08.
3. KVS-R14 with TASK-028.

## Known limitations

- Cuts land on keyframes; the snapped range can be wider than requested.

## Verification evidence

- 2026-10-01, `main` @ `3228f0da`: video units 7/7; `tests/e2e/video.spec.ts` 2 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
