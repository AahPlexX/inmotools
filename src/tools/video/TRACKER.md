---
tool: video-keyframe-slicer
folder: src/tools/video
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-video-keyframe-slicer-design.md
tracker: src/tools/video/TRACKER.md
updated: 2026-10-04
---

# Keyframe Video Slicer — tracker

## Resume here

On `origin/main`. 14 requirements: 11 verified, 3 missing (VKS-R10 timeline with keyframe markers, VKS-R11 timeline thumbnails, VKS-R14 site theme). The keyframe list stands in for the timeline. Next action: build VKS-R10, then VKS-R11.

## Documents

- Spec: [2026-10-01-video-keyframe-slicer-design.md](../../../docs/superpowers/specs/2026-10-01-video-keyframe-slicer-design.md)
- Original design: "Tool 12" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `video-engine.ts` (inspection, snapping, packet export), `VideoWorkspace.tsx` (UI)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/video.test.ts`, `tests/unit/video-audit-regressions.test.ts`; browser test: `tests/e2e/video.spec.ts` (fixture media built by `tests/e2e/video-fixture.ts` from `tests/fixtures/tactical-review-sample.webm`)

## Requirement status

`unit` = `tests/unit/video.test.ts`; `audit` = `tests/unit/video-audit-regressions.test.ts`; `e2e` = `tests/e2e/video.spec.ts` "explains exact selected-track preview policy and reflows across target viewports".

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| VKS-R01 | verified | e2e "VKS-R01 inspection lists verified keyframes and Cancel inspection stops it" | |
| VKS-R02 | verified | e2e "VKS-R02 the chosen video and audio tracks are the ones written to the export" | |
| VKS-R03 | verified | unit "snaps the start backward and the end forward…", "clamps requests to media bounds…", "rejects inverted ranges and media without a usable keyframe" | |
| VKS-R04 | verified | e2e "VKS-R04 shows the snapped In and Out next to the requested range before export" | |
| VKS-R05 | verified | e2e "VKS-R05 keyframe navigation, Set In/Out at the playhead and Preview snapped In/Out"; unit "navigates the complete verified keyframe sequence in either direction" | |
| VKS-R06 | verified | e2e "VKS-R06 pages verified keyframes 100 at a time and Seek moves the playhead" | |
| VKS-R07 | verified | e2e "VKS-R07 shows the source preview and a selected-track preview of the loaded file with the policy"; e2e (policy text) | |
| VKS-R08 | verified | e2e "VKS-R08 exports a playable file whose packets are byte-identical to the snapped source range, with progress" | |
| VKS-R09 | verified | audit "keeps every audio packet that starts before the exclusive trim end", "reads source rotation…", "does not use the packet at range.end…" | |
| VKS-R10 | missing | — | Design requirement; only a keyframe table exists |
| VKS-R11 | missing | — | Optional in the design; buildable, so kept under the default integration rule |
| VKS-R12 | verified | e2e axe check; `tests/e2e/accessibility.spec.ts` route `video-keyframe-slicer` | |
| VKS-R13 | verified | e2e (overflow at each viewport) | |
| VKS-R14 | missing | — | Delivered through TASK-028 |

## Open work

1. Build VKS-R10 (timeline with keyframe markers), then VKS-R11.
2. VKS-R14 with TASK-028.

## Known limitations

- Cuts land on keyframes; the snapped range can be wider than requested.

## Verification evidence

- 2026-10-04, `expand/video-keyframe-slicer`: `pnpm build`; `PW_PORT=4204 pnpm exec playwright test tests/e2e/video.spec.ts --repeat-each=3` 48 passed (8 tests × 2 projects × 3).
- 2026-10-01, `main` @ `3228f0da`: video units 7/7; `tests/e2e/video.spec.ts` 2 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Browser tests with generated fixture media added for VKS-R01, R02, R04–R08 (now `verified`).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.
